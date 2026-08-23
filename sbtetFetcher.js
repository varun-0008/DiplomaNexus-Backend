/**
 * SBTET Data Fetcher Module
 * Fetches student results from TS SBTET public API (BranchWise reports)
 * and caches them in PostgreSQL. Designed for weekly refresh.
 */
const https = require('https');

const SBTET_BASE = 'https://www.sbtet.telangana.gov.in';
const THROTTLE_MS = 300; // 300ms between requests

// Known scheme mappings
const SCHEMES = {
  C24: { id: 11, code: 'C24' },
  C21: { id: 9, code: 'C21' },
  C18: { id: 5, code: 'C18' },
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make an HTTPS GET request to SBTET API
 */
function sbtetGet(endpoint, params = {}, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams(params).toString();
    const url = `${SBTET_BASE}/api/${endpoint}${query ? '?' + query : ''}`;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'token': 'DUMMY_TOKEN', // PreExamination endpoints require a token header but don't validate it
      ...customHeaders
    };

    const req = https.get(url, {
      headers: headers,
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return resolve({ status: res.statusCode, data: null });
        }
        try {
          let parsed = JSON.parse(data);
          // Handle double-serialized responses
          if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch (e) {}
          }
          resolve({ status: 200, data: parsed });
        } catch (e) {
          resolve({ status: 200, data: data });
        }
      });
    });

    req.on('error', (e) => resolve({ status: null, data: null }));
    req.on('timeout', () => { req.destroy(); resolve({ status: null, data: null }); });
  });
}

/**
 * Fetch bonafide student details by PIN from SBTET
 */
async function getBonafideDetails(pin) {
  const cleanPin = pin.trim().toUpperCase();
  const res = await sbtetGet('api/PreExamination/getBonafiedDetailsByPin', { pin: cleanPin });
  if (res.status === 200 && res.data) {
    const table1 = res.data.Table1 || [];
    if (table1.length > 0) {
      return {
        success: true,
        student: {
          pin: table1[0].Pin,
          name: table1[0].Name,
          fatherName: table1[0].FatherName,
          collegeCode: table1[0].CollegeCode,
          collegeName: table1[0].CollegeName,
          collegeAddress: table1[0].CollegeAddress,
          branchCode: table1[0].BranchCode,
          branchName: table1[0].BranchName,
          phoneNumber: table1[0].StudentPhoneNumber
        }
      };
    }
  }
  return { success: false, error: 'Student details not found or API error' };
}

/**
 * Generate an OTP to verify/update mobile number on SBTET
 */
async function generateOtp(pin, phone) {
  const cleanPin = pin.trim().toUpperCase();
  const cleanPhone = phone.trim();
  const res = await sbtetGet('api/PreExamination/GenerateOtpForMobileNoUpdate', {
    Pin: cleanPin,
    Phone: cleanPhone
  });
  
  if (res.status === 200 && res.data) {
    const status = res.data.status || res.data.Status;
    const desc = res.data.description || res.data.Description;
    if (status === '200' || status === 200) {
      return { success: true, description: desc };
    }
    return { success: false, error: desc || 'Failed to send OTP' };
  }
  return { success: false, error: 'Failed to communicate with SBTET OTP service' };
}

/**
 * Verify OTP on SBTET and return bonafide student details
 */
async function verifyOtpAndUpdate(pin, phone, otp) {
  const cleanPin = pin.trim().toUpperCase();
  const cleanPhone = phone.trim();
  const cleanOtp = otp.trim().toUpperCase();
  
  const res = await sbtetGet('api/PreExamination/UpdateUserdata', {
    Pin: cleanPin,
    StudentPhoneNumber: cleanPhone,
    OTP: cleanOtp
  });
  
  // The SBTET UpdateUserdata returns standard JSON response
  if (res.status === 200 && res.data) {
    // Some endpoints return a string message or a structured object
    const dataStr = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const isSuccess = dataStr.includes('Success') || dataStr.includes('200') || dataStr.includes('updated') || dataStr.includes('OTP Verified');
    
    if (isSuccess) {
      // Fetch official details to confirm and retrieve updated profile
      const details = await getBonafideDetails(cleanPin);
      return details;
    }
    return { success: false, error: res.data.description || res.data.Description || 'OTP verification failed' };
  }
  return { success: false, error: 'OTP verification request failed' };
}

/**
 * Fetch metadata: exam months, exam types, branches for a college
 */
async function fetchMetadata(collegeId) {
  // Get branches
  const branchRes = await sbtetGet('api/Results/GetSchemeSemBranchInfo', { CollegeId: collegeId });
  const branches = branchRes.status === 200 && branchRes.data ? branchRes.data[0]?.branchInfo || [] : [];

  // Get exam months
  const monthRes = await sbtetGet('api/Results/GetExamMonthYear');
  let examMonths = [];
  if (monthRes.status === 200 && monthRes.data) {
    if (typeof monthRes.data === 'string') {
      const parsed = JSON.parse(monthRes.data);
      examMonths = parsed.Table || [];
    } else if (monthRes.data.Table) {
      examMonths = monthRes.data.Table;
    } else if (Array.isArray(monthRes.data)) {
      examMonths = monthRes.data;
    }
  }

  // Get exam types for each scheme+semester
  const examTypes = {};
  for (const [schemeName, schemeInfo] of Object.entries(SCHEMES)) {
    examTypes[schemeName] = {};
    for (let sem = 1; sem <= 6; sem++) {
      const typeRes = await sbtetGet('api/Results/GetExamTypeInfo', {
        SchemeId: schemeInfo.id, SemYearId: sem
      });
      if (typeRes.status === 200 && typeRes.data && typeRes.data[0]?.typeInfo) {
        examTypes[schemeName][sem] = typeRes.data[0].typeInfo;
      }
      await sleep(THROTTLE_MS);
    }
  }

  return { branches, examMonths, examTypes };
}

/**
 * Fetch and store BranchWise results for a specific combination
 */
async function fetchAndStoreBranchWise(pool, collegeId, schemeId, schemeCode, semYearId, examTypeId, examTypeName, branchId, branchCode, examMonthYearId, examMonthYear) {
  const res = await sbtetGet('api/Results/GetBranchWiseReport', {
    CollegeId: collegeId,
    SchemeId: schemeId,
    SemYearId: semYearId,
    ExamTypeId: examTypeId,
    BranchId: branchId,
    ExamMonthYearId: examMonthYearId,
  });

  if (res.status !== 200 || !res.data) return { students: 0, subjects: 0 };

  const bw = Array.isArray(res.data) && res.data.length > 0 ? res.data[0] : res.data;
  if (!bw || typeof bw !== 'object') return { students: 0, subjects: 0 };

  const students = bw.studentSubjectTotalSGPA || [];
  const subjects = bw.branchWiseReport || [];

  if (students.length === 0) return { students: 0, subjects: 0 };

  // Store subject results
  for (const subj of subjects) {
    try {
      await pool.query(`
        INSERT INTO sbtet_subject_results 
          (pin, branch_code, subject_code, subject_name, hybrid_grade, scheme_code, semester,
           mid1_marks, mid2_marks, internal_marks, end_sem_marks, subject_total, exam_type,
           college_code, college_name, exam_month_year, exam_month_year_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (pin, subject_code, scheme_code, semester, exam_month_year_id)
        DO UPDATE SET
          hybrid_grade = EXCLUDED.hybrid_grade,
          mid1_marks = EXCLUDED.mid1_marks,
          mid2_marks = EXCLUDED.mid2_marks,
          internal_marks = EXCLUDED.internal_marks,
          end_sem_marks = EXCLUDED.end_sem_marks,
          subject_total = EXCLUDED.subject_total,
          fetched_at = CURRENT_TIMESTAMP
      `, [
        subj.pin, subj.Branch_Code, subj.CODE, subj.SubjectName, subj.HybridGrade,
        subj.Scheme_Code, subj.Semister, subj.MID1_MARKS, subj.MID2_MARKS,
        subj.Internal_MARKS, subj.EndSemMarks, subj.SubjectTotal, subj.ExamType,
        subj.CollegeCode, subj.CollegeName, examMonthYear, examMonthYearId,
      ]);
    } catch (e) {
      // Skip duplicates or errors for individual records
    }
  }

  // Store student summaries
  for (const stu of students) {
    try {
      await pool.query(`
        INSERT INTO sbtet_student_summary
          (pin, student_name, semester, total_marks, total_credits, sgpa, cgpa,
           sem_exam_status, total_grade_points, scheme_code, exam_month_year, exam_month_year_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (pin, scheme_code, semester, exam_month_year_id)
        DO UPDATE SET
          total_marks = EXCLUDED.total_marks,
          sgpa = EXCLUDED.sgpa,
          cgpa = EXCLUDED.cgpa,
          sem_exam_status = EXCLUDED.sem_exam_status,
          fetched_at = CURRENT_TIMESTAMP
      `, [
        stu.pin, stu.Studentname, `${semYearId}SEM`, stu.total, stu.TotalCredits,
        stu.SGPA, stu.CGPA, stu.SemExamStatus, stu.TotalGradePoints,
        schemeCode, examMonthYear, examMonthYearId,
      ]);
    } catch (e) {
      // Skip duplicates
    }
  }

  // Update cache meta
  const uniquePins = new Set(students.map(s => s.pin));
  try {
    await pool.query(`
      INSERT INTO sbtet_cache_meta
        (college_id, scheme_id, scheme_code, sem_year_id, exam_type_id, exam_type_name,
         branch_id, branch_code, exam_month_year_id, exam_month_year, student_count, subject_record_count)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (college_id, scheme_id, sem_year_id, exam_type_id, branch_id, exam_month_year_id)
      DO UPDATE SET
        student_count = EXCLUDED.student_count,
        subject_record_count = EXCLUDED.subject_record_count,
        fetched_at = CURRENT_TIMESTAMP
    `, [
      collegeId, schemeId, schemeCode, semYearId, examTypeId, examTypeName,
      branchId, branchCode, examMonthYearId, examMonthYear,
      uniquePins.size, subjects.length,
    ]);
  } catch (e) {}

  return { students: uniquePins.size, subjects: subjects.length };
}

/**
 * Full extraction for a college: scan all scheme/sem/branch/month combos
 * @param {Pool} pool - PostgreSQL pool
 * @param {number} collegeId - SBTET College ID
 * @param {string[]} schemeFilter - e.g. ['C21', 'C24'] 
 * @param {Function} progressCb - optional callback(message)
 */
async function extractCollegeResults(pool, collegeId, schemeFilter = ['C21', 'C24'], progressCb = null) {
  const log = (msg) => {
    if (progressCb) progressCb(msg);
    else console.log(`[SBTET] ${msg}`);
  };

  log(`Starting extraction for college ${collegeId}, schemes: ${schemeFilter.join(', ')}`);

  const metadata = await fetchMetadata(collegeId);
  const { branches, examMonths, examTypes } = metadata;

  log(`Found ${branches.length} branches, ${examMonths.length} exam months`);

  let totalStudents = 0;
  let totalSubjects = 0;
  let totalCalls = 0;

  for (const schemeName of schemeFilter) {
    const scheme = SCHEMES[schemeName];
    if (!scheme) { log(`Unknown scheme: ${schemeName}`); continue; }

    const schemeExamTypes = examTypes[schemeName] || {};

    for (let sem = 1; sem <= 6; sem++) {
      const types = schemeExamTypes[sem] || [];
      if (types.length === 0) { log(`  ${schemeName} Sem${sem}: no exam types`); continue; }

      for (const examType of types) {
        for (const branch of branches) {
          for (const month of examMonths) {
            totalCalls++;
            const result = await fetchAndStoreBranchWise(
              pool, collegeId, scheme.id, scheme.code, sem, examType.ID, examType.ExamType,
              branch.BranchId, branch.BranchCode, month.Id, month.ExamYearMonth
            );

            if (result.students > 0) {
              totalStudents += result.students;
              totalSubjects += result.subjects;
              log(`  [OK] ${schemeName} Sem${sem} ${examType.ExamType} ${branch.BranchCode} ${month.ExamYearMonth}: ${result.students} students, ${result.subjects} subjects`);
            }

            await sleep(THROTTLE_MS);

            if (totalCalls % 50 === 0) {
              log(`  ... ${totalCalls} calls, ${totalStudents} students found so far`);
            }
          }
        }
      }
    }
  }

  log(`Extraction complete: ${totalCalls} API calls, ${totalStudents} students, ${totalSubjects} subject records`);
  return { totalCalls, totalStudents, totalSubjects };
}

/**
 * Check if cache needs refresh (older than 7 days)
 */
async function isCacheStale(pool, collegeId, schemeCode) {
  try {
    const res = await pool.query(`
      SELECT MAX(fetched_at) as last_fetch
      FROM sbtet_cache_meta
      WHERE college_id = $1 AND scheme_code = $2
    `, [collegeId, schemeCode]);

    if (!res.rows[0] || !res.rows[0].last_fetch) return true;

    const lastFetch = new Date(res.rows[0].last_fetch);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return lastFetch < weekAgo;
  } catch (e) {
    return true;
  }
}

/**
 * Get cached results for a specific student PIN
 */
async function getStudentResults(pool, pin) {
  // Get subject-level results
  const subjectsRes = await pool.query(`
    SELECT DISTINCT ON (subject_code, semester)
      pin, branch_code, subject_code, subject_name, hybrid_grade, scheme_code, semester,
      mid1_marks, mid2_marks, internal_marks, end_sem_marks, subject_total,
      exam_month_year, college_code, college_name
    FROM sbtet_subject_results
    WHERE pin = $1
    ORDER BY subject_code, semester, exam_month_year_id DESC
  `, [pin]);

  // Get summary per semester
  const summaryRes = await pool.query(`
    SELECT DISTINCT ON (semester)
      pin, student_name, semester, total_marks, total_credits, sgpa, cgpa,
      sem_exam_status, total_grade_points, scheme_code, exam_month_year
    FROM sbtet_student_summary
    WHERE pin = $1
    ORDER BY semester, exam_month_year_id DESC
  `, [pin]);

  return {
    subjects: subjectsRes.rows,
    semesters: summaryRes.rows,
    hasRealData: subjectsRes.rows.length > 0,
  };
}

/**
 * Fetch consolidated results for a student from SBTET portal and save to DB
 */
async function fetchAndStoreConsolidatedResults(pool, pin) {
  const cleanPin = pin.trim().toUpperCase();
  console.log(`[SBTET] Fetching consolidated results for PIN ${cleanPin}...`);
  
  const res = await sbtetGet('api/Results/GetConsolidatedResults', { Pin: cleanPin });
  if (res.status !== 200 || !res.data) {
    console.error(`[SBTET] Failed to fetch consolidated results (status=${res.status})`);
    return false;
  }
  
  let data = res.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      console.error(`[SBTET] JSON parsing error on consolidated results string:`, e.message);
      return false;
    }
  }
  
  const table = data.Table || [];
  const table1 = data.Table1 || [];
  const table2 = data.Table2 || [];
  
  if (table.length === 0) {
    console.log(`[SBTET] No consolidated results found for PIN ${cleanPin}`);
    return false;
  }
  
  const student = table[0];
  const stats = table1[0] || {};
  
  const studentName = student.StudentName;
  const schemeCode = student.Scheme;
  const collegeName = student.CenterName || '';
  const collegeCode = student.CenterCode || '';
  
  console.log(`[SBTET] Saving consolidated results for ${studentName} (${cleanPin})...`);
  
  // Store subject results in Table2
  for (const sub of table2) {
    try {
      await pool.query(`
        INSERT INTO sbtet_subject_results 
          (pin, branch_code, subject_code, subject_name, hybrid_grade, scheme_code, semester,
           mid1_marks, mid2_marks, internal_marks, end_sem_marks, subject_total, exam_type,
           college_code, college_name, exam_month_year, exam_month_year_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (pin, subject_code, scheme_code, semester, exam_month_year_id)
        DO UPDATE SET
          hybrid_grade = EXCLUDED.hybrid_grade,
          mid1_marks = EXCLUDED.mid1_marks,
          mid2_marks = EXCLUDED.mid2_marks,
          internal_marks = EXCLUDED.internal_marks,
          end_sem_marks = EXCLUDED.end_sem_marks,
          subject_total = EXCLUDED.subject_total,
          fetched_at = CURRENT_TIMESTAMP
      `, [
        cleanPin, sub.Branch_Code, sub.Subject_Code, sub.SubjectName, sub.HybridGrade,
        schemeCode, sub.Semester, sub.Mid1Marks, sub.Mid2Marks,
        sub.InternalMarks, sub.EndExamMarks, sub.SubjectTotal, sub.WholeOrSupply || 'Semester',
        collegeCode, collegeName, sub.ExamMonthYear, sub.SemId || 0
      ]);
    } catch (e) {
      console.error(`[SBTET] Error storing subject ${sub.Subject_Code}:`, e.message);
    }
  }
  
  // Store student summary in Table1 (overall) or group by semester
  const semestersFound = [...new Set(table2.map(sub => sub.Semester))];
  
  for (const sem of semestersFound) {
    const semSubjects = table2.filter(sub => sub.Semester === sem);
    const totalSemMarks = semSubjects.reduce((sum, sub) => sum + (parseFloat(sub.SubjectTotal) || 0), 0);
    const examMonthYear = semSubjects[0]?.ExamMonthYear || '';
    const semId = semSubjects[0]?.SemId || 0;
    
    // Calculate semester SGPA: sum(GradePoint * Credits) / sum(Credits)
    let totalGradePoints = 0;
    let totalCredits = 0;
    for (const sub of semSubjects) {
      const credits = parseFloat(sub.MaxCredits) || 0;
      const gp = parseFloat(sub.GradePoint) || 0;
      if (credits > 0) {
        totalGradePoints += gp * credits;
        totalCredits += credits;
      }
    }
    const calculatedSGPA = totalCredits > 0 ? (totalGradePoints / totalCredits).toFixed(2) : '0.00';
    
    try {
      await pool.query(`
        INSERT INTO sbtet_student_summary
          (pin, student_name, semester, total_marks, total_credits, sgpa, cgpa,
           sem_exam_status, total_grade_points, scheme_code, exam_month_year, exam_month_year_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (pin, scheme_code, semester, exam_month_year_id)
        DO UPDATE SET
          total_marks = EXCLUDED.total_marks,
          sgpa = EXCLUDED.sgpa,
          cgpa = EXCLUDED.cgpa,
          fetched_at = CURRENT_TIMESTAMP
      `, [
        cleanPin, studentName, sem, totalSemMarks, totalCredits.toString(),
        calculatedSGPA, stats.CGPA ? stats.CGPA.toString() : '0.00',
        'Completed', totalGradePoints.toString(), schemeCode, examMonthYear, semId
      ]);
    } catch (e) {
      console.error(`[SBTET] Error storing semester summary for ${sem}:`, e.message);
    }
  }
  
  return true;
}

/**
 * Fetch real-time attendance report for a student from SBTET portal
 */
async function getAttendanceReport(pin) {
  const cleanPin = pin.trim().toUpperCase();
  console.log(`[SBTET] Fetching attendance report for PIN ${cleanPin}...`);
  
  const res = await sbtetGet('api/PreExamination/getAttendanceReport', { Pin: cleanPin });
  if (res.status === 200 && res.data) {
    let data = res.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) {}
    }
    
    const table = data.Table || [];
    const table1 = data.Table1 || [];
    
    return {
      success: true,
      summary: table.length > 0 ? {
        percentage: parseFloat(table[0].Percentage) || parseFloat(table[0].TotalPercentage) || 0,
        workingDays: parseInt(table[0].WorkingDays) || parseInt(table[0].TotalWorkingDays) || 0,
        presentDays: parseFloat(table[0].NumberOfDaysPresent) || 0,
        semester: table[0].Semester || ''
      } : null,
      logs: table1.map(log => ({
        date: log.Date,
        status: log.Status,
        month: log.AttendanceMonth,
        monthNum: parseInt(log.mnt) || 0,
        day: log.Day,
        year: parseInt(log.yr) || 0
      }))
    };
  }
  return { success: false, error: 'Failed to fetch attendance report from SBTET' };
}

module.exports = {
  SCHEMES,
  fetchMetadata,
  fetchAndStoreBranchWise,
  extractCollegeResults,
  isCacheStale,
  getStudentResults,
  getBonafideDetails,
  generateOtp,
  verifyOtpAndUpdate,
  fetchAndStoreConsolidatedResults,
  getAttendanceReport,
};
