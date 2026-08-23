require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function main() {
  console.log("Starting database connection...");
  
  // Add migration for birth_date if it doesn't exist
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date VARCHAR(100)`);
    console.log("Migration check: birth_date column ensured.");
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  }

  const jsonPath = path.join("C:", "Users", "kompe", ".gemini", "antigravity", "brain", "a97f9d21-c866-405e-a936-30738689271b", "scratch", "students.json");
  if (!fs.existsSync(jsonPath)) {
    console.error("students.json not found at " + jsonPath);
    process.exit(1);
  }

  const students = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Loaded ${students.length} students from JSON.`);

  console.log("Hashing passwords and inserting students (this may take a moment)...");
  
  let inserted = 0;
  let updated = 0;
  let errorCount = 0;

  // Process in small batches of 20 to avoid locking the pool or overwhelming the CPU
  const batchSize = 20;
  for (let i = 0; i < students.length; i += batchSize) {
    const batch = students.slice(i, i + batchSize);
    await Promise.all(batch.map(async (student) => {
      try {
        const username = student.pin.trim();
        const pin = student.pin.trim();
        const rawPassword = student.attendee_id.trim();
        const name = student.student_name.trim();
        const dob = student.birth_date.trim();
        const branch = student.branch.trim();
        
        // Hash password (use 8 rounds for speed during bulk import)
        const salt = await bcrypt.genSalt(8);
        const passwordHash = await bcrypt.hash(rawPassword, salt);

        // Check if user already exists
        const existsRes = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existsRes.rows.length > 0) {
          // Update details but DO NOT overwrite their password or pin
          await pool.query(
            `UPDATE users 
             SET student_name = $1, branch = $2, birth_date = $3, pin = $4 
             WHERE username = $5`,
            [name, branch, dob, pin, username]
          );
          updated++;
        } else {
          // Insert new user
          await pool.query(
            `INSERT INTO users (username, password_hash, pin, student_name, branch, birth_date, is_verified) 
             VALUES ($1, $2, $3, $4, $5, $6, FALSE)`,
            [username, passwordHash, pin, name, branch, dob]
          );
          inserted++;
        }
      } catch (err) {
        console.error(`Error processing student ${student.pin}:`, err.message);
        errorCount++;
      }
    }));
    
    if ((i + batchSize) % 200 === 0 || i + batchSize >= students.length) {
      console.log(`Processed ${Math.min(i + batchSize, students.length)} / ${students.length} students...`);
    }
  }

  console.log(`Finished import. Inserted: ${inserted}, Updated: ${updated}, Errors: ${errorCount}`);
  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
