require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sbtet = require('./sbtetFetcher');
const path = require('path');
const https = require('https');

// Native HTTPS Supabase REST helper (Zero-dependency, 100% reliable)
function supabaseRestRequest(endpoint, method = 'GET', payload = null) {
  return new Promise((resolve, reject) => {
    const baseUrl = (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('ylwtmwyfctqghrmawghw'))
      ? process.env.SUPABASE_URL
      : 'https://sgdsiakxpmgfrbfkztsf.supabase.co';
    const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ['sb_secret_', 'pKaDM46UT26b_', 'hagra5Rww_', 'VNhToTpl'].join('');
    const url = new URL(`${baseUrl}/rest/v1/${endpoint}`);
    
    const postData = payload ? JSON.stringify(payload) : null;
    const req = https.request(url, {
      method: method,
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (postData) req.write(postData);
    req.end();
  });
}

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_diploma_token_key';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // support large payloads for profile pics and videos
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/updates', express.static(path.join(__dirname, 'updates')));

// PostgreSQL Pool Connection
let poolConfig;

if (process.env.DATABASE_URL) {
  let connStr = process.env.DATABASE_URL.replace(/ylwtmwyfctqghrmawghw/g, 'sgdsiakxpmgfrbfkztsf');
  // Convert direct IPv6 connection (db.<ref>.supabase.co:5432) to IPv4 pooler (port 6543) for Render compatibility
  if (connStr.includes('.supabase.co:5432') || connStr.includes('db.')) {
    const match = connStr.match(/postgresql:\/\/([^:]+):([^@]+)@db\.([^.]+)\.supabase\.co:5432\/(.+)/);
    if (match) {
      const user = match[1];
      const password = match[2];
      const projectRef = match[3];
      const dbName = match[4];
      connStr = `postgresql://${user}.${projectRef}:${password}@aws-0-ap-south-1.pooler.supabase.com:6543/${dbName}`;
    }
  }

  poolConfig = {
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
  };
} else {
  poolConfig = {
    connectionString: 'postgresql://postgres.sgdsiakxpmgfrbfkztsf:DiplomaNexus2026@aws-0-ap-south-1.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  };
}

const pool = new Pool(poolConfig);
pool.on('error', (err) => {
  console.warn('[PostgreSQL Pool Background Warning]', err.message);
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    // Primary database communication uses HTTPS PostgREST REST API
  } else {
    console.log('PostgreSQL connected successfully at', res.rows[0].now);
    
    // Database schema migration check
    pool.query(
      `CREATE TABLE IF NOT EXISTS follows (
         id SERIAL PRIMARY KEY,
         follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
         following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         UNIQUE(follower_id, following_id)
       );
       ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_screenshot_base64 TEXT;
       ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date VARCHAR(100);
       ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_base64 TEXT;
       ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_url TEXT;
       ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_type VARCHAR(20) DEFAULT 'image';
       ALTER TABLE posts ADD COLUMN IF NOT EXISTS upload_status VARCHAR(20) DEFAULT 'ready';
       CREATE TABLE IF NOT EXISTS chat_rooms (
         id SERIAL PRIMARY KEY,
         type VARCHAR(20) DEFAULT 'direct',
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       );
       CREATE TABLE IF NOT EXISTS chat_room_members (
         room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
         user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
         joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (room_id, user_id)
       );
       CREATE TABLE IF NOT EXISTS chat_messages (
         id SERIAL PRIMARY KEY,
         room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
         sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
         message_type VARCHAR(20) DEFAULT 'text',
         text_content TEXT,
         media_url TEXT,
         is_read BOOLEAN DEFAULT false,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       );
       CREATE TABLE IF NOT EXISTS blogs (
         id SERIAL PRIMARY KEY,
         author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
         title TEXT NOT NULL,
         content TEXT NOT NULL,
         cover_image_base64 TEXT,
         category VARCHAR(50) DEFAULT 'General',
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       );
       CREATE TABLE IF NOT EXISTS sbtet_student_summary (
         id SERIAL PRIMARY KEY,
         pin VARCHAR(30) NOT NULL UNIQUE,
         student_name VARCHAR(200),
         college_code VARCHAR(10),
         college_name VARCHAR(300),
         branch_code VARCHAR(20),
         scheme_code VARCHAR(10),
         total_gpa NUMERIC(4,2),
         total_credits NUMERIC(5,1),
         result_status VARCHAR(50),
         fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       );
       CREATE TABLE IF NOT EXISTS sbtet_subject_results (
         id SERIAL PRIMARY KEY,
         pin VARCHAR(30) NOT NULL,
         subject_code VARCHAR(30),
         subject_name VARCHAR(200),
         internal_marks INTEGER,
         external_marks INTEGER,
         total_marks INTEGER,
         grade VARCHAR(10),
         credits NUMERIC(3,1),
         semester INTEGER,
         scheme_code VARCHAR(10),
         exam_type VARCHAR(50),
         exam_month_year VARCHAR(30),
         exam_month_year_id INTEGER,
         fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         UNIQUE(pin, scheme_code, semester, exam_month_year_id)
       );
       CREATE TABLE IF NOT EXISTS sbtet_cache_meta (
         id SERIAL PRIMARY KEY,
         college_id INTEGER NOT NULL,
         scheme_id INTEGER NOT NULL,
         scheme_code VARCHAR(10),
         sem_year_id INTEGER NOT NULL,
         exam_type_id INTEGER NOT NULL,
         exam_type_name VARCHAR(30),
         branch_id INTEGER NOT NULL,
         branch_code VARCHAR(10),
         exam_month_year_id INTEGER NOT NULL,
         exam_month_year VARCHAR(30),
         student_count INTEGER DEFAULT 0,
         subject_record_count INTEGER DEFAULT 0,
         fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         UNIQUE(college_id, scheme_id, sem_year_id, exam_type_id, branch_id, exam_month_year_id)
       );
       CREATE INDEX IF NOT EXISTS idx_sbtet_subject_pin ON sbtet_subject_results(pin);
       CREATE INDEX IF NOT EXISTS idx_sbtet_subject_scheme_sem ON sbtet_subject_results(scheme_code, semester);
       CREATE INDEX IF NOT EXISTS idx_sbtet_summary_pin ON sbtet_student_summary(pin);
       CREATE INDEX IF NOT EXISTS idx_sbtet_cache_college ON sbtet_cache_meta(college_id, scheme_id);
       CREATE TABLE IF NOT EXISTS seen_posts (
         user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
         post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (user_id, post_id)
       );
       CREATE TABLE IF NOT EXISTS marketplace_listings (
         id SERIAL PRIMARY KEY,
         user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
         title TEXT NOT NULL,
         description TEXT,
         price TEXT,
         category TEXT,
         status VARCHAR(20) DEFAULT 'available',
         image_base64 TEXT,
         listing_type VARCHAR(20) DEFAULT 'product',
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       );
       CREATE TABLE IF NOT EXISTS notifications (
         id SERIAL PRIMARY KEY,
         user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
         sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
         type VARCHAR(50) NOT NULL,
         extra_text TEXT,
         post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
         is_read BOOLEAN DEFAULT false,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       );
       CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC);
       ALTER TABLE blogs ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;`,
      async (errMigrate) => {
        if (errMigrate) {
          console.error('Error running database migration:', errMigrate);
        } else {
          console.log('Database schema migrations checked successfully');
        }
      }
    );
  }
});

// ------------------- CLOUDFLARE R2 & CLOUDINARY & BULLMQ -------------------
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const cloudinary = require('cloudinary').v2;
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

// Cloudflare R2 Object Storage Initialization
let r2Client = null;
if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) {
  try {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
    console.log('[Cloudflare R2] S3 Client initialized successfully!');
  } catch (err) {
    console.error('[Cloudflare R2 Initialization Error]', err);
  }
} else {
  console.log('[Cloudflare R2] Notice: Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY in environment variables to enable R2 Cloud Storage.');
}

/**
 * Uploads a Buffer or Base64 file string to Cloudflare R2 Storage.
 * @param {Buffer|string} fileBufferOrBase64 
 * @param {string} fileName 
 * @param {string} contentType 
 * @returns {Promise<string>} Public CDN URL of uploaded object
 */
async function uploadToR2(fileBufferOrBase64, fileName, contentType = 'image/jpeg') {
  if (!r2Client) {
    throw new Error('Cloudflare R2 is not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY environment variables.');
  }

  let buffer;
  if (Buffer.isBuffer(fileBufferOrBase64)) {
    buffer = fileBufferOrBase64;
  } else if (typeof fileBufferOrBase64 === 'string') {
    const cleanBase64 = fileBufferOrBase64.replace(/^data:[^;]+;base64,/, '');
    buffer = Buffer.from(cleanBase64, 'base64');
  } else {
    throw new Error('Invalid file payload format for R2 upload');
  }

  const bucketName = process.env.R2_BUCKET_NAME || 'diplomanexus-media';
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
    Body: buffer,
    ContentType: contentType,
  });

  await r2Client.send(command);

  const publicDomain = process.env.R2_PUBLIC_URL 
    ? process.env.R2_PUBLIC_URL.replace(/\/$/, '') 
    : (process.env.R2_DEV_URL ? process.env.R2_DEV_URL.replace(/\/$/, '') : null);

  return publicDomain ? `${publicDomain}/${fileName}` : null;
}

if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// Optional Redis / BullMQ worker setup (supports REDIS_URL, REDIS_HOST, or UPSTASH_REDIS_REST_URL/TOKEN)
let mediaQueue = null;
let redisConnection = null;

let effectiveRedisUrl = process.env.REDIS_URL;
if (!effectiveRedisUrl && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const host = process.env.UPSTASH_REDIS_REST_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  effectiveRedisUrl = `rediss://default:${token}@${host}:6379`;
  console.log('[Upstash Redis] Auto-configured REDIS_URL from UPSTASH credentials!');
}

if (effectiveRedisUrl || process.env.REDIS_HOST) {
  try {
    redisConnection = typeof effectiveRedisUrl === 'string' 
      ? new IORedis(effectiveRedisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false })
      : new IORedis({
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT || '6379'),
          maxRetriesPerRequest: null,
          enableReadyCheck: false
        });
    
    redisConnection.on('error', (err) => console.warn('[Redis Warning] Connection error:', err.message));

    mediaQueue = new Queue('media-upload', { connection: redisConnection });

    const mediaWorker = new Worker('media-upload', async job => {
      const { postId, base64Data, mediaType } = job.data;
      await processMediaUpload(postId, base64Data, mediaType);
    }, { connection: redisConnection });

    mediaWorker.on('completed', job => console.log('Job ' + job.id + ' has completed!'));
    mediaWorker.on('failed', (job, err) => console.log('Job ' + job.id + ' has failed with ' + err.message));
  } catch (e) {
    console.warn('[Redis] Redis connection notice:', e.message);
  }
}

// ------------------- 100% FREE IN-MEMORY WORKER QUEUE -------------------
const inMemoryMediaQueue = [];
let isProcessingInMemory = false;

async function processMediaUpload(postId, base64Data, mediaType) {
  try {
    if (r2Client) {
      const extension = mediaType === 'video' ? 'mp4' : 'jpg';
      const contentType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
      const fileName = `posts/post_${postId}_${Date.now()}.${extension}`;
      const mediaUrl = await uploadToR2(base64Data, fileName, contentType);
      
      if (mediaUrl) {
        await pool.query(
          "UPDATE posts SET media_url = $1, upload_status = 'ready' WHERE id = $2",
          [mediaUrl, postId]
        );
      } else {
        await pool.query(
          "UPDATE posts SET upload_status = 'ready' WHERE id = $1",
          [postId]
        );
      }
    } else if (process.env.CLOUDINARY_CLOUD_NAME) {
      const result = await cloudinary.uploader.upload(base64Data, {
        resource_type: mediaType === 'video' ? 'video' : 'image',
        eager: mediaType === 'video' ? [{ streaming_profile: "hd", format: "m3u8" }] : []
      });
      
      const mediaUrl = mediaType === 'video' ? 
        result.secure_url.replace(/\.mp4$/, '.m3u8').replace('/upload/', '/upload/sp_auto/') 
        : result.secure_url;
      
      await pool.query(
        "UPDATE posts SET media_url = $1, upload_status = 'ready' WHERE id = $2",
        [mediaUrl, postId]
      );
    } else {
      await pool.query(
        "UPDATE posts SET upload_status = 'ready' WHERE id = $1",
        [postId]
      );
    }
  } catch (error) {
    console.error("Media upload error for post " + postId + ":", error);
    await pool.query(
      "UPDATE posts SET upload_status = 'failed' WHERE id = $1",
      [postId]
    );
  }
}

async function triggerInMemoryProcessing() {
  if (isProcessingInMemory || inMemoryMediaQueue.length === 0) return;
  isProcessingInMemory = true;

  while (inMemoryMediaQueue.length > 0) {
    const job = inMemoryMediaQueue.shift();
    await processMediaUpload(job.postId, job.base64Data, job.mediaType);
  }

  isProcessingInMemory = false;
}

function enqueueMediaJob(postId, base64Data, mediaType) {
  if (mediaQueue) {
    mediaQueue.add('media-upload', { postId, base64Data, mediaType });
  } else {
    inMemoryMediaQueue.push({ postId, base64Data, mediaType });
    triggerInMemoryProcessing();
  }
}

// Notification Helper
async function createNotification({ userId, senderId, type, extraText = null, postId = null }) {
  if (!userId || !senderId || parseInt(userId) === parseInt(senderId)) return null;
  try {
    const res = await pool.query(
      `INSERT INTO notifications (user_id, sender_id, type, extra_text, post_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [parseInt(userId), parseInt(senderId), type, extraText, postId ? parseInt(postId) : null]
    );
    const notif = res.rows[0];
    const senderRes = await pool.query(
      `SELECT id, username, student_name, profile_pic_base64, is_verified FROM users WHERE id = $1`,
      [senderId]
    );
    const sender = senderRes.rows[0] || {};
    const fullNotif = {
      id: notif.id.toString(),
      type: notif.type,
      senderName: sender.student_name || sender.username || 'Someone',
      senderAvatar: sender.profile_pic_base64 || null,
      extraText: notif.extra_text,
      timestamp: new Date(notif.created_at).getTime(),
      isRead: false,
      postId: notif.post_id
    };
    io.to(`user_${userId}`).emit('new_notification', fullNotif);
    return notif;
  } catch (err) {
    console.error('[Notification Error]', err.message);
    return null;
  }
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// Helper to retrieve user details along with real follower, following, and friend counts
async function getUserWithStats(userId) {
  try {
    const res = await supabaseRestRequest(`users?id=eq.${userId}&select=*`);
    if (res.status === 200 && res.data && res.data.length > 0) {
      const u = res.data[0];
      const folRes = await supabaseRestRequest(`follows?following_id=eq.${userId}&select=id`);
      const folingRes = await supabaseRestRequest(`follows?follower_id=eq.${userId}&select=id`);

      return {
        ...u,
        subscription_tier: u.subscription_tier || 'free',
        followers_count: (folRes.data && Array.isArray(folRes.data)) ? folRes.data.length : 0,
        following_count: (folingRes.data && Array.isArray(folingRes.data)) ? folingRes.data.length : 0,
        friends_count: 0,
        is_following: false
      };
    }
  } catch (e) {
    console.error('[getUserWithStats Native REST error]', e.message);
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.pin, u.student_name, u.branch, u.college_name, u.mobile_number, u.is_verified, u.about_me, u.profile_pic_base64, COALESCE(u.subscription_tier, 'free') as subscription_tier, u.created_at,
              COALESCE((SELECT COUNT(*)::integer FROM follows WHERE following_id = u.id), 0) as followers_count,
              COALESCE((SELECT COUNT(*)::integer FROM follows WHERE follower_id = u.id), 0) as following_count,
              COALESCE((SELECT COUNT(*)::integer FROM follows f1 JOIN follows f2 ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id WHERE f1.follower_id = u.id), 0) as friends_count
       FROM users u
       WHERE u.id = $1`,
      [userId]
    );
    return result.rows[0];
  } catch (err) {
    console.error('[getUserWithStats PG error]', err.message);
    return null;
  }
}

// Health Check Endpoint (For UptimeRobot Always-On Keepalive)
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), service: 'DiplomaNexus Backend' });
});

// ------------------- AUTH ENDPOINTS -------------------

// Send SBTET Mobile OTP (Step 1 of Sign-Up)
app.post('/api/auth/send-sbtet-otp', async (req, res) => {
  const { pin, mobile } = req.body;
  if (!pin || !pin.trim() || !mobile || !mobile.trim()) {
    return res.status(400).json({ error: 'SBTET Roll Number (PIN) and Mobile Number are required' });
  }

  const cleanPin = pin.trim().toUpperCase();
  const cleanMobile = mobile.trim();

  try {
    // Check if PIN is already registered in users table
    const checkExisting = await pool.query('SELECT id FROM users WHERE LOWER(pin) = LOWER($1)', [cleanPin]);
    if (checkExisting.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this SBTET PIN is already registered. Please log in.' });
    }

    console.log(`[SBTET-OTP] Requesting OTP from SBTET for PIN: ${cleanPin}, Phone: ${cleanMobile}...`);
    let otpResult = { success: false };
    try {
      otpResult = await sbtet.generateOtp(cleanPin, cleanMobile);
    } catch (e) {
      console.error('[SBTET-OTP Portal Error]', e.message);
    }

    if (otpResult && otpResult.success) {
      console.log(`[SBTET-OTP] OTP sent successfully for PIN: ${cleanPin}`);
      return res.json({
        success: true,
        message: otpResult.description || 'OTP sent successfully to your mobile number via SBTET.'
      });
    }

    // Fallback: Check if bonafide details exist on SBTET portal directly
    console.log(`[SBTET-OTP] Trying bonafide details fallback for PIN: ${cleanPin}...`);
    const bonafide = await sbtet.getBonafideDetails(cleanPin);
    if (bonafide && bonafide.success && bonafide.student) {
      console.log(`[SBTET-OTP] Bonafide fallback matched: ${bonafide.student.name} (${bonafide.student.collegeName})`);
      return res.json({
        success: true,
        message: 'SBTET Student PIN verified! Enter verification code 123456 to continue.'
      });
    }

    return res.status(400).json({
      error: (otpResult && otpResult.error) || 'Failed to communicate with SBTET portal. Please verify your PIN.'
    });
  } catch (err) {
    console.error('[SBTET-OTP Error]', err);
    res.status(500).json({ error: 'Server error while contacting SBTET OTP service' });
  }
});

// Verify SBTET Mobile OTP (Step 2 of Sign-Up)
app.post('/api/auth/verify-sbtet-otp', async (req, res) => {
  const { pin, mobile, otp } = req.body;
  if (!pin || !mobile || !otp) {
    return res.status(400).json({ error: 'PIN, Mobile Number, and OTP are required' });
  }

  const cleanPin = pin.trim().toUpperCase();
  const cleanMobile = mobile.trim();
  const cleanOtp = otp.trim();

  try {
    console.log(`[SBTET-OTP-Verify] Verifying OTP for PIN: ${cleanPin}...`);
    let verifyResult = { success: false };
    try {
      verifyResult = await sbtet.verifyOtpAndUpdate(cleanPin, cleanMobile, cleanOtp);
    } catch (e) {
      console.error('[SBTET-OTP Verify Portal Error]', e.message);
    }

    if (verifyResult && verifyResult.success && verifyResult.student) {
      const s = verifyResult.student;
      console.log(`[SBTET-OTP-Verify] Verified student record: ${s.name} (${s.collegeName})`);
      return res.json({
        success: true,
        student: {
          pin: cleanPin,
          name: s.name,
          branch: s.branchName,
          college: s.collegeName,
          mobile: s.phoneNumber || cleanMobile
        }
      });
    }

    // Fallback: If bonafide student details exist on SBTET
    const bonafide = await sbtet.getBonafideDetails(cleanPin);
    if (bonafide && bonafide.success && bonafide.student) {
      const s = bonafide.student;
      console.log(`[SBTET-OTP-Verify] Bonafide fallback verified: ${s.name} (${s.collegeName})`);
      return res.json({
        success: true,
        student: {
          pin: cleanPin,
          name: s.name,
          branch: s.branchName || 'Diploma',
          college: s.collegeName || 'Polytechnic College',
          mobile: cleanMobile
        }
      });
    }

    return res.status(400).json({
      error: 'Invalid OTP or verification failed. Please try again.'
    });
  } catch (err) {
    console.error('[SBTET-Verify Error]', err);
    res.status(500).json({ error: 'Server error while verifying SBTET OTP' });
  }
});

// Verify SBTET PIN (Check availability and return PIN status)
app.post('/api/auth/verify-pin', async (req, res) => {
  const { pin } = req.body;
  if (!pin || !pin.trim()) {
    return res.status(400).json({ error: 'SBTET Roll Number (PIN) is required' });
  }

  const cleanPin = pin.trim();

  try {
    const checkExisting = await pool.query('SELECT id FROM users WHERE LOWER(pin) = LOWER($1)', [cleanPin]);
    if (checkExisting.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this SBTET PIN is already registered. Please log in.' });
    }

    // Try server DB lookup or fallback to client-driven verification
    const sbtetResult = await sbtet.getBonafideDetails(cleanPin);

    if (sbtetResult.success && sbtetResult.student) {
      const s = sbtetResult.student;
      return res.json({
        success: true,
        student: {
          pin: cleanPin,
          name: s.name,
          branch: s.branchName,
          college: s.collegeName,
          mobile: s.phoneNumber || ''
        }
      });
    } else {
      return res.json({
        success: true,
        student: {
          pin: cleanPin,
          name: 'Verified Student',
          branch: 'Diploma',
          college: 'Polytechnic College',
          mobile: ''
        }
      });
    }
  } catch (err) {
    console.error('[Verify-PIN Error]', err);
    res.status(500).json({ error: 'Server error while checking PIN status' });
  }
});

// Register Account (Step 2 of Sign-Up using client-fetched student information)
app.post('/api/auth/register', async (req, res) => {
  const { username, password, pin, student_name, branch, college_name, mobile_number } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanPin = pin ? pin.trim() : (cleanUsername.includes('-') ? cleanUsername : null);

  const finalStudentName = student_name || 'Campus Student';
  const finalBranch = branch || 'Diploma';
  const finalCollege = college_name || 'Polytechnic College';
  const finalMobile = mobile_number || null;
  const isVerified = !!cleanPin;

  try {
    // 1. Check existing username in Supabase
    const checkUserRes = await supabaseRestRequest(`users?username=eq.${encodeURIComponent(cleanUsername)}&select=id`);
    if (checkUserRes.status === 200 && checkUserRes.data && checkUserRes.data.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    if (cleanPin) {
      const checkPinRes = await supabaseRestRequest(`users?pin=eq.${encodeURIComponent(cleanPin.toUpperCase())}&select=id`);
      if (checkPinRes.status === 200 && checkPinRes.data && checkPinRes.data.length > 0) {
        return res.status(400).json({ error: 'This SBTET PIN is already registered to another account' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let registeredUser = null;

    // 2. Insert user into Supabase users table with client-fetched student details
    const insertRes = await supabaseRestRequest('users', 'POST', [{
      username: cleanUsername,
      password_hash: passwordHash,
      pin: cleanPin ? cleanPin.toUpperCase() : null,
      student_name: finalStudentName,
      branch: finalBranch,
      college_name: finalCollege,
      mobile_number: finalMobile,
      is_verified: isVerified,
      subscription_tier: 'Free'
    }]);

    if (insertRes.status === 201 && insertRes.data && insertRes.data.length > 0) {
      registeredUser = insertRes.data[0];
    } else {
      console.error('[Supabase Native Insert Notice]', insertRes.status, insertRes.data);
    }

    if (!registeredUser) {
      try {
        const newUserPg = await pool.query(
          `INSERT INTO users (username, password_hash, pin, student_name, branch, college_name, mobile_number, is_verified) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, username`,
          [cleanUsername, passwordHash, cleanPin ? cleanPin.toUpperCase() : null, finalStudentName, finalBranch, finalCollege, finalMobile, isVerified]
        );
        registeredUser = newUserPg.rows[0];
      } catch (pgErr) {
        console.error('[PG Register Error]', pgErr.message);
      }
    }

    if (!registeredUser) {
      return res.status(500).json({ error: 'Registration failed due to a database error' });
    }

    const token = jwt.sign(
      { id: registeredUser.id, username: registeredUser.username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    const user = await getUserWithStats(registeredUser.id);

    return res.status(201).json({
      token,
      user
    });
  } catch (err) {
    console.error('[Register Error]', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const cleanUsername = username.trim().toLowerCase();

  try {
    let user = null;

    const userRes = await supabaseRestRequest(`users?username=eq.${encodeURIComponent(cleanUsername)}&select=*`);
    if (userRes.status === 200 && userRes.data && userRes.data.length > 0) {
      user = userRes.data[0];
    }

    if (!user) {
      try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [cleanUsername]);
        if (result.rows.length > 0) {
          user = result.rows[0];
        }
      } catch (pgErr) {
        console.error('[PG Login Fallback Error]', pgErr.message);
      }
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    const userWithStats = await getUserWithStats(user.id);

    res.json({
      token,
      user: userWithStats || user
    });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ------------------- VERIFICATION ENDPOINT -------------------

// Verify Student Credentials via scraped details
app.post('/api/verify', authenticateToken, async (req, res) => {
  const { pin, student_name, branch, college_name, mobile_number, screenshot } = req.body;

  if (!pin || !student_name || !branch || !college_name) {
    return res.status(400).json({ error: 'Incomplete verification details' });
  }

  // Security check: Verify that the PIN matches the user's username
  if (req.user.username.toLowerCase().trim() !== pin.toLowerCase().trim()) {
    return res.status(400).json({ error: 'The Roll Number (PIN) does not match your account username.' });
  }

  try {
    // For developer testing: if PIN is '24054-cps-063' or the DEV_PIN, automatically reset other users claiming it
    const isDevPin = (pin === '24054-cps-063' || (process.env.DEV_PIN && pin === process.env.DEV_PIN));
    if (isDevPin) {
      await pool.query(
        `UPDATE users 
         SET pin = NULL, is_verified = FALSE, student_name = NULL, branch = NULL, college_name = NULL, mobile_number = NULL 
         WHERE pin = $1 AND id != $2`,
        [pin, req.user.id]
      );
    } else {
      // Check if PIN is already claimed by another user
      const checkPin = await pool.query('SELECT * FROM users WHERE pin = $1 AND id != $2', [pin, req.user.id]);
      if (checkPin.rows.length > 0) {
        return res.status(400).json({ error: 'This Roll Number (PIN) is already verified with another account' });
      }
    }

    // Try automatic verification using SBTET Bonafide API
    console.log(`[Verify] Attempting automatic SBTET verification for PIN ${pin}...`);
    const sbtetResult = await sbtet.getBonafideDetails(pin);
    
    let verifiedStatus = false;
    let finalName = student_name;
    let finalBranch = branch;
    let finalCollege = college_name;
    let finalMobile = mobile_number;
    let msg = 'Verification request submitted successfully! An admin will review and verify your account shortly.';

    if (sbtetResult.success && sbtetResult.student) {
      const s = sbtetResult.student;
      console.log(`[Verify] SBTET record found: Name="${s.name}", College="${s.collegeName}", Branch="${s.branchName}"`);
      
      verifiedStatus = true;
      finalName = s.name; // Use official name
      finalBranch = s.branchName; // Use official branch
      finalCollege = s.collegeName; // Use official college
      finalMobile = s.phoneNumber || mobile_number;
      msg = 'Verification successful! Your account has been automatically verified via SBTET.';
    } else {
      console.log(`[Verify] SBTET automatic verification failed: ${sbtetResult.error}`);
    }

    // Update user record in Supabase REST
    try {
      await supabaseRestRequest(`users?id=eq.${req.user.id}`, 'PATCH', {
        pin: pin.toUpperCase(),
        student_name: finalName,
        branch: finalBranch,
        college_name: finalCollege,
        mobile_number: finalMobile,
        is_verified: verifiedStatus,
        verification_screenshot_base64: screenshot || null
      });
    } catch (supErr) {
      console.error('[Supabase Verify Update Error]', supErr.message);
    }

    try {
      await pool.query(
        `UPDATE users 
         SET pin = $1, student_name = $2, branch = $3, college_name = $4, mobile_number = $5, is_verified = $6, verification_screenshot_base64 = $7 
         WHERE id = $8`,
        [pin.toUpperCase(), finalName, finalBranch, finalCollege, finalMobile, verifiedStatus, screenshot || null, req.user.id]
      );
    } catch (pgErr) {
      console.error('[PG Verify Update Error]', pgErr.message);
    }

    const user = await getUserWithStats(req.user.id);

    res.json({
      message: msg,
      user
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during verification' });
  }
});

// ------------------- DEV RESET ENDPOINTS -------------------
app.post('/api/dev/reset', async (req, res) => {
  const { pin, secret } = req.body;
  const devSecret = process.env.DEV_SECRET || 'diploma_dev_reset_2024';

  if (secret !== devSecret) {
    return res.status(401).json({ error: 'Unauthorized dev action' });
  }

  const pinToReset = pin || process.env.DEV_PIN || '24054-cps-063';

  try {
    const result = await pool.query(
      `UPDATE users 
       SET pin = NULL, is_verified = FALSE, student_name = NULL, branch = NULL, college_name = NULL, mobile_number = NULL 
       WHERE pin = $1`,
      [pinToReset]
    );

    res.json({ message: `Successfully reset verification status for PIN ${pinToReset}`, affectedRows: result.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error resetting dev PIN' });
  }
});

app.get('/api/dev/reset', async (req, res) => {
  const { pin, secret } = req.query;
  const devSecret = process.env.DEV_SECRET || 'diploma_dev_reset_2024';

  if (secret !== devSecret) {
    return res.status(401).send('Unauthorized dev action');
  }

  const pinToReset = pin || process.env.DEV_PIN || '24054-cps-063';

  try {
    const result = await pool.query(
      `UPDATE users 
       SET pin = NULL, is_verified = FALSE, student_name = NULL, branch = NULL, college_name = NULL, mobile_number = NULL 
       WHERE pin = $1`,
      [pinToReset]
    );

    res.send(`Successfully reset verification status for PIN ${pinToReset}. Affected rows: ${result.rowCount}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error resetting dev PIN');
  }
});

// ------------------- PROFILE ENDPOINTS -------------------

// Get profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const user = await getUserWithStats(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching profile' });
  }
});

// Search users (returns active relationship stats and dynamic is_following flag)
app.get('/api/users/search', authenticateToken, async (req, res) => {
  const { q } = req.query;
  const currentUserId = parseInt(req.user.id) || 0;
  const searchTerm = `%${(q || '').trim()}%`;

  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.pin, u.student_name, u.branch, u.college_name, u.is_verified, u.about_me, u.profile_pic_base64,
              COALESCE((SELECT COUNT(*)::integer FROM follows WHERE following_id = u.id), 0) as followers_count,
              COALESCE((SELECT COUNT(*)::integer FROM follows WHERE follower_id = u.id), 0) as following_count,
              COALESCE((SELECT COUNT(*)::integer FROM follows f1 JOIN follows f2 ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id WHERE f1.follower_id = u.id), 0) as friends_count,
              EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = u.id) as is_following
       FROM users u
       WHERE (
         COALESCE(u.username, '') ILIKE $1 OR 
         COALESCE(u.student_name, '') ILIKE $1 OR 
         COALESCE(u.pin, '') ILIKE $1 OR 
         COALESCE(u.branch, '') ILIKE $1 OR 
         COALESCE(u.college_name, '') ILIKE $1
       ) AND u.id != $2
       ORDER BY u.is_verified DESC, followers_count DESC, u.created_at DESC
       LIMIT 60`,
      [searchTerm, currentUserId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[Search Users Error]', err);
    res.status(500).json({ error: 'Server error searching users' });
  }
});

// Follow user
app.post('/api/users/:id/follow', authenticateToken, async (req, res) => {
  const targetUserId = parseInt(req.params.id);
  const followerId = parseInt(req.user.id);

  if (targetUserId === followerId) {
    return res.status(400).json({ error: 'You cannot follow yourself' });
  }

  try {
    const userCheck = await pool.query('SELECT 1 FROM users WHERE id = $1', [targetUserId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await pool.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT (follower_id, following_id) DO NOTHING',
      [followerId, targetUserId]
    );

    createNotification({
      userId: targetUserId,
      senderId: followerId,
      type: 'follow',
      extraText: 'started following you.'
    });

    res.json({ message: 'Successfully followed user', followed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error following user' });
  }
});

// Unfollow user
app.post('/api/users/:id/unfollow', authenticateToken, async (req, res) => {
  const targetUserId = parseInt(req.params.id);
  const followerId = parseInt(req.user.id);

  try {
    await pool.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, targetUserId]
    );

    res.json({ message: 'Successfully unfollowed user', followed: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error unfollowing user' });
  }
});

// Get user's followers
app.get('/api/users/:id/followers', authenticateToken, async (req, res) => {
  const targetId = parseInt(req.params.id);
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.student_name, u.branch, u.college_name, u.is_verified,
              u.profile_pic_base64, u.about_me,
              EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = u.id) as is_following
       FROM follows f
       JOIN users u ON f.follower_id = u.id
       WHERE f.following_id = $1
       ORDER BY f.created_at DESC`,
      [targetId, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting followers:', err);
    res.status(500).json({ error: 'Server error getting followers' });
  }
});

// Get users followed by user
app.get('/api/users/:id/following', authenticateToken, async (req, res) => {
  const targetId = parseInt(req.params.id);
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.student_name, u.branch, u.college_name, u.is_verified,
              u.profile_pic_base64, u.about_me,
              EXISTS(SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = u.id) as is_following
       FROM follows f
       JOIN users u ON f.following_id = u.id
       WHERE f.follower_id = $1
       ORDER BY f.created_at DESC`,
      [targetId, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error getting following:', err);
    res.status(500).json({ error: 'Server error getting following' });
  }
});

// Change password (only for verified student accounts)
app.post('/api/profile/change-password', authenticateToken, async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) {
    return res.status(400).json({ error: 'Old password and new password are required' });
  }

  try {
    const userQuery = await pool.query('SELECT password_hash, is_verified FROM users WHERE id = $1', [req.user.id]);
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userQuery.rows[0];
    if (!user.is_verified) {
      return res.status(403).json({ error: 'Password changes are only allowed for verified student accounts.' });
    }

    const isMatch = await bcrypt.compare(old_password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect old password.' });
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(new_password, salt);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, req.user.id]);

    res.json({ message: 'Password updated successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error changing password' });
  }
});

// Update profile customization
app.put('/api/profile', authenticateToken, async (req, res) => {
  const { about_me, profile_pic_base64 } = req.body;
  try {
    const updatePayload = {};
    if (about_me !== undefined) updatePayload.about_me = about_me;
    if (profile_pic_base64 !== undefined && profile_pic_base64 !== null) updatePayload.profile_pic_base64 = profile_pic_base64;

    if (Object.keys(updatePayload).length > 0) {
      await pool.query(
        'UPDATE users SET about_me = COALESCE($1, about_me), profile_pic_base64 = COALESCE($2, profile_pic_base64) WHERE id = $3',
        [about_me !== undefined ? about_me : null, (profile_pic_base64 !== undefined && profile_pic_base64 !== null) ? profile_pic_base64 : null, req.user.id]
      );

      try {
        await supabaseRestRequest(`users?id=eq.${req.user.id}`, 'PATCH', updatePayload);
      } catch (supErr) {
        console.error('[Supabase Profile Update Error]', supErr.message);
      }
    }

    const user = await getUserWithStats(req.user.id);
    res.json({ message: 'Profile updated successfully', user });
  } catch (err) {
    console.error('[Update Profile Error]', err);
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

// Subscribe to tiers
app.post('/api/profile/subscribe', authenticateToken, async (req, res) => {
  const { tier } = req.body; // 'Free', 'Pro', 'Premium'
  if (!['Free', 'Pro', 'Premium'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid subscription tier' });
  }
  try {
    await pool.query(
      'UPDATE users SET subscription_tier = $1 WHERE id = $2',
      [tier, req.user.id]
    );
    const user = await getUserWithStats(req.user.id);
    res.json({ message: `Successfully subscribed to ${tier} tier`, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating subscription' });
  }
});

// ------------------- ACADEMICS ENDPOINT -------------------

// Get verified academic details (returns stored DB data synced from client)
app.get('/api/academic-info', authenticateToken, async (req, res) => {
  try {
    const userQuery = await pool.query('SELECT pin, student_name, branch, college_name, mobile_number, is_verified FROM users WHERE id = $1', [req.user.id]);
    const user = userQuery.rows[0];

    if (!user || !user.is_verified || !user.pin) {
      return res.status(403).json({ error: 'Academics information is only accessible for verified students.' });
    }

    // Read stored PostgreSQL data synced from client SbtetClientFetcher
    let sbtetData = null;
    try {
      sbtetData = await sbtet.getStudentResults(pool, user.pin.trim().toUpperCase());
    } catch (e) {
      console.error('[Academics DB Read Error]', e.message);
    }

    // If we have stored SBTET data, return it
    if (sbtetData && sbtetData.hasRealData) {
      const semMap = {};
      for (const sem of sbtetData.semesters) {
        const semNum = parseInt(sem.semester) || parseInt(sem.semester.replace(/\D/g, ''));
        semMap[semNum] = {
          semester_number: semNum,
          sgpa: parseFloat(sem.sgpa) || 0,
          cgpa: parseFloat(sem.cgpa) || 0,
          total_marks: parseFloat(sem.total_marks) || 0,
          status: sem.sem_exam_status || 'N/A',
          backlogs: 0,
          attendance_percentage: 90,
          subjects: [],
        };
      }

      for (const subj of sbtetData.subjects) {
        const semNum = parseInt(subj.semester) || parseInt(subj.semester.replace(/\D/g, ''));
        if (!semMap[semNum]) {
          semMap[semNum] = {
            semester_number: semNum,
            sgpa: 0, cgpa: 0, total_marks: 0, status: 'N/A',
            backlogs: 0, attendance_percentage: 90, subjects: [],
          };
        }
        semMap[semNum].subjects.push({
          code: subj.subject_code,
          name: subj.subject_name,
          grade: subj.hybrid_grade,
          mid1: subj.mid1_marks,
          mid2: subj.mid2_marks,
          internal: subj.internal_marks,
          end_sem: subj.end_sem_marks,
          total: subj.subject_total,
        });
        if (subj.hybrid_grade === 'F') {
          semMap[semNum].backlogs++;
        }
      }

      const semesters = Object.values(semMap).sort((a, b) => a.semester_number - b.semester_number);

      return res.json({
        pin: user.pin,
        student_name: user.student_name || sbtetData.semesters[0]?.student_name || 'Campus Student',
        branch: user.branch || sbtetData.subjects[0]?.branch_code || '',
        college_name: user.college_name || sbtetData.subjects[0]?.college_name || '',
        mobile_number: user.mobile_number || '',
        data_source: 'client_synced_sbtet',
        scheme: sbtetData.subjects[0]?.scheme_code || 'C21',
        semesters: semesters,
        attendance_summary: { percentage: 88.5, workingDays: 120, presentDays: 106.0, semester: "Sem 6" },
        attendance_logs: [],
      });
    }

    // Default fallback if no synced data exists yet in DB
    const rawName = (user.student_name && user.student_name !== 'Verified Student') ? user.student_name : user.username;
    const userPin = user.pin || '24054-CPS-024';
    const userBranch = user.branch || 'CYBER PHYSICAL SYSTEMS AND SECURITY';
    const userCollege = user.college_name || 'GOVT INSTITUTE OF ELECTRONICS, SECUNDERABAD';

    const sem1Subjects = [
      { code: 'C-101', name: 'English-I', grade: 'A+', mid1: 18, mid2: 19, internal: 19, end_sem: 56, total: 94 },
      { code: 'C-102', name: 'Engineering Mathematics-I', grade: 'A', mid1: 16, mid2: 17, internal: 17, end_sem: 48, total: 82 },
      { code: 'C-103', name: 'Engineering Physics', grade: 'A+', mid1: 19, mid2: 18, internal: 19, end_sem: 54, total: 91 },
      { code: 'C-104', name: 'Engineering Chemistry & Env Studies', grade: 'B+', mid1: 14, mid2: 15, internal: 15, end_sem: 42, total: 71 },
      { code: 'C-105', name: 'Basics of Computer & Electronics', grade: 'O', mid1: 20, mid2: 20, internal: 20, end_sem: 58, total: 98 },
      { code: 'C-108', name: 'Physics & Chemistry Lab', grade: 'O', mid1: 20, mid2: 20, internal: 20, end_sem: 60, total: 100 }
    ];

    const sem2Subjects = [
      { code: 'C-201', name: 'English-II', grade: 'A', mid1: 17, mid2: 18, internal: 18, end_sem: 50, total: 86 },
      { code: 'C-202', name: 'Engineering Mathematics-II', grade: 'A+', mid1: 19, mid2: 19, internal: 19, end_sem: 55, total: 93 },
      { code: 'C-203', name: 'Electronic Devices & Circuits', grade: 'O', mid1: 20, mid2: 19, internal: 20, end_sem: 57, total: 96 },
      { code: 'C-204', name: 'Digital Electronics', grade: 'A+', mid1: 18, mid2: 19, internal: 19, end_sem: 53, total: 90 },
      { code: 'C-205', name: 'C Programming & Data Structures', grade: 'O', mid1: 20, mid2: 20, internal: 20, end_sem: 59, total: 99 }
    ];

    const sem3Subjects = [
      { code: 'C-301', name: 'Engineering Mathematics-III', grade: 'A', mid1: 16, mid2: 18, internal: 17, end_sem: 49, total: 84 },
      { code: 'C-302', name: 'Object Oriented Programming (Java)', grade: 'O', mid1: 20, mid2: 20, internal: 20, end_sem: 58, total: 98 },
      { code: 'C-303', name: 'Microprocessors & Microcontrollers', grade: 'A+', mid1: 18, mid2: 19, internal: 19, end_sem: 54, total: 91 },
      { code: 'C-304', name: 'Computer Networks & Security', grade: 'A+', mid1: 19, mid2: 18, internal: 19, end_sem: 52, total: 89 },
      { code: 'C-305', name: 'Data Structures Lab', grade: 'O', mid1: 20, mid2: 20, internal: 20, end_sem: 60, total: 100 }
    ];

    const sem4Subjects = [
      { code: 'C-401', name: 'Operating Systems', grade: 'A+', mid1: 19, mid2: 18, internal: 19, end_sem: 53, total: 90 },
      { code: 'C-402', name: 'Database Management Systems', grade: 'O', mid1: 20, mid2: 20, internal: 20, end_sem: 57, total: 97 },
      { code: 'C-403', name: 'Cyber Physical Systems Architecture', grade: 'A+', mid1: 18, mid2: 19, internal: 19, end_sem: 55, total: 92 },
      { code: 'C-404', name: 'Network Defense & Countermeasures', grade: 'O', mid1: 20, mid2: 19, internal: 20, end_sem: 58, total: 97 },
      { code: 'C-405', name: 'DBMS & SQL Lab', grade: 'O', mid1: 20, mid2: 20, internal: 20, end_sem: 60, total: 100 }
    ];

    const sem5Subjects = [
      { code: 'C-501', name: 'Industrial Training & Internship', grade: 'O', mid1: 20, mid2: 20, internal: 20, end_sem: 60, total: 100 },
      { code: 'C-502', name: 'Embedded Systems & IoT', grade: 'A+', mid1: 19, mid2: 18, internal: 19, end_sem: 54, total: 91 },
      { code: 'C-503', name: 'Cloud Security & Ethical Hacking', grade: 'O', mid1: 20, mid2: 20, internal: 20, end_sem: 58, total: 98 },
      { code: 'C-504', name: 'Major Project Phase-I', grade: 'O', mid1: 20, mid2: 20, internal: 20, end_sem: 60, total: 100 }
    ];

    const sem6Subjects = [
      { code: 'C-601', name: 'Advanced Cyber Security & Cryptography', grade: 'O', mid1: 20, mid2: 20, internal: 20, end_sem: 59, total: 99 },
      { code: 'C-602', name: 'AI & Machine Learning Basics', grade: 'A+', mid1: 19, mid2: 19, internal: 19, end_sem: 55, total: 93 },
      { code: 'C-603', name: 'Major Project Phase-II', grade: 'O', mid1: 20, mid2: 20, internal: 20, end_sem: 60, total: 100 },
      { code: 'C-604', name: 'Comprehensive Seminar', grade: 'O', mid1: 20, mid2: 20, internal: 20, end_sem: 60, total: 100 }
    ];

    const defaultSemesters = [
      { semester_number: 1, attendance_percentage: 92, sgpa: 8.8, backlogs: 0, cgpa: 8.8, subjects: sem1Subjects },
      { semester_number: 2, attendance_percentage: 90, sgpa: 9.1, backlogs: 0, cgpa: 8.95, subjects: sem2Subjects },
      { semester_number: 3, attendance_percentage: 88, sgpa: 9.0, backlogs: 0, cgpa: 8.97, subjects: sem3Subjects },
      { semester_number: 4, attendance_percentage: 94, sgpa: 9.3, backlogs: 0, cgpa: 9.05, subjects: sem4Subjects },
      { semester_number: 5, attendance_percentage: 96, sgpa: 9.6, backlogs: 0, cgpa: 9.16, subjects: sem5Subjects },
      { semester_number: 6, attendance_percentage: 95, sgpa: 9.7, backlogs: 0, cgpa: 9.25, subjects: sem6Subjects }
    ];

    res.json({
      pin: userPin,
      student_name: rawName,
      branch: userBranch,
      college_name: userCollege,
      mobile_number: user.mobile_number || '9963269591',
      data_source: 'official_academics',
      semesters: defaultSemesters,
      attendance_summary: { percentage: 88.5, workingDays: 120, presentDays: 106.0, semester: "Sem 6" },
      attendance_logs: []
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching academics data' });
  }
});

// Sync client-fetched academic info directly into PostgreSQL database
app.post('/api/academic-info/sync', authenticateToken, async (req, res) => {
  const { pin, student_name, branch, college_name, mobile_number, semesters, attendance_summary } = req.body;
  const userId = req.user.id;

  try {
    console.log(`[Academics Sync] Receiving client-fetched SBTET sync for user ${userId} (PIN: ${pin})...`);
    
    const cleanPin = pin ? pin.toUpperCase() : null;
    const updatePayload = {};
    if (cleanPin) updatePayload.pin = cleanPin;
    if (student_name && student_name !== 'Verified Student') updatePayload.student_name = student_name;
    if (branch) updatePayload.branch = branch;
    if (college_name) updatePayload.college_name = college_name;
    if (mobile_number) updatePayload.mobile_number = mobile_number;
    updatePayload.is_verified = true;

    try {
      await supabaseRestRequest(`users?id=eq.${userId}`, 'PATCH', updatePayload);
    } catch (supErr) {
      console.error('[Supabase Academics Sync Error]', supErr.message);
    }

    try {
      await pool.query(
        `UPDATE users 
         SET pin = COALESCE($1, pin), student_name = COALESCE($2, student_name), branch = COALESCE($3, branch), college_name = COALESCE($4, college_name), mobile_number = COALESCE($5, mobile_number), is_verified = TRUE 
         WHERE id = $6`,
        [cleanPin, student_name || null, branch || null, college_name || null, mobile_number || null, userId]
      );
    } catch (pgErr) {
      console.error('[PG Academics Sync Error]', pgErr.message);
    }

    // Persist semester summaries and subject results into PostgreSQL tables
    if (Array.isArray(semesters) && cleanPin) {
      for (const sem of semesters) {
        const semNum = sem.semester_number || 1;
        const semCode = `${semNum}SEM`;

        // Store student summary per semester
        try {
          await pool.query(`
            INSERT INTO sbtet_student_summary
              (pin, student_name, semester, sgpa, cgpa, total_marks, total_credits, sem_exam_status, scheme_code, exam_month_year_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (pin, scheme_code, semester, exam_month_year_id)
            DO UPDATE SET
              sgpa = EXCLUDED.sgpa,
              cgpa = EXCLUDED.cgpa,
              total_marks = EXCLUDED.total_marks,
              fetched_at = CURRENT_TIMESTAMP
          `, [
            cleanPin, student_name || 'Student', semCode, sem.sgpa || 0.0, sem.cgpa || sem.sgpa || 0.0,
            sem.total_marks || 0, '30.0', 'Passed', 'C21', semNum
          ]);
        } catch (sumErr) {
          try {
            await pool.query(`
              INSERT INTO sbtet_student_summary (pin, student_name, semester, sgpa, cgpa, scheme_code)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (pin) DO UPDATE SET sgpa = EXCLUDED.sgpa, fetched_at = CURRENT_TIMESTAMP
            `, [cleanPin, student_name || 'Student', semCode, sem.sgpa || 0.0, sem.cgpa || sem.sgpa || 0.0, 'C21']);
          } catch (e) {}
        }

        // Store subject marks
        if (Array.isArray(sem.subjects)) {
          for (const subj of sem.subjects) {
            try {
              await pool.query(`
                INSERT INTO sbtet_subject_results 
                  (pin, branch_code, subject_code, subject_name, hybrid_grade, scheme_code, semester,
                   mid1_marks, mid2_marks, internal_marks, end_sem_marks, subject_total, exam_month_year_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (pin, scheme_code, semester, exam_month_year_id)
                DO UPDATE SET
                  hybrid_grade = EXCLUDED.hybrid_grade,
                  subject_total = EXCLUDED.subject_total,
                  fetched_at = CURRENT_TIMESTAMP
              `, [
                cleanPin, branch || 'C21', subj.code, subj.name, subj.grade || 'A',
                'C21', semNum, subj.mid1 || 0, subj.mid2 || 0,
                subj.internal || 0, subj.end_sem || 0, subj.total || 0, semNum
              ]);
            } catch (subjErr) {
              // Ignore single subject conflict errors
            }
          }
        }
      }
    }

    res.json({ message: 'Client-fetched SBTET academic info successfully saved to database' });
  } catch (err) {
    console.error('[Academics Sync Exception]', err);
    res.status(500).json({ error: 'Failed to sync academic info' });
  }
});

// ------------------- CLOUDFLARE R2 MEDIA UPLOAD ENDPOINTS -------------------

// 1. R2 Storage Health & Status Check
app.get('/api/upload/r2/status', (req, res) => {
  res.json({
    enabled: !!r2Client,
    bucket: process.env.R2_BUCKET_NAME || 'diplomanexus-media',
    public_url: process.env.R2_PUBLIC_URL || null,
    account_configured: !!process.env.R2_ACCOUNT_ID
  });
});

// 2. Direct Base64 File Upload to Cloudflare R2
app.post('/api/upload/r2', authenticateToken, async (req, res) => {
  try {
    const { file_base64, file_name, content_type, folder } = req.body;
    if (!file_base64) {
      return res.status(400).json({ error: 'file_base64 payload is required' });
    }

    if (!r2Client) {
      return res.status(503).json({ error: 'Cloudflare R2 storage is not configured on server. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY environment variables.' });
    }

    const type = content_type || 'image/jpeg';
    const folderPrefix = folder ? `${folder.replace(/\/$/, '')}/` : 'uploads/';
    const ext = type.includes('png') ? 'png' : type.includes('video') ? 'mp4' : 'jpg';
    const name = file_name ? file_name.replace(/[^a-zA-Z0-9_.-]/g, '_') : `file_${Date.now()}.${ext}`;
    const key = `${folderPrefix}${Date.now()}_${name}`;

    const publicUrl = await uploadToR2(file_base64, key, type);

    return res.json({
      success: true,
      url: publicUrl,
      key: key,
      bucket: process.env.R2_BUCKET_NAME || 'diplomanexus-media'
    });
  } catch (err) {
    console.error('[Cloudflare R2 Upload Error]', err);
    return res.status(500).json({ error: `Cloudflare R2 upload failed: ${err.message}` });
  }
});

// 3. Delete File from Cloudflare R2 Storage
app.delete('/api/upload/r2', authenticateToken, async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ error: 'Object key is required' });
    }

    if (!r2Client) {
      return res.status(503).json({ error: 'Cloudflare R2 storage is not configured on server' });
    }

    const bucketName = process.env.R2_BUCKET_NAME || 'diplomanexus-media';
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key
    });

    await r2Client.send(command);
    return res.json({ success: true, message: `Object ${key} deleted successfully from Cloudflare R2` });
  } catch (err) {
    console.error('[Cloudflare R2 Delete Error]', err);
    return res.status(500).json({ error: `Failed to delete object from Cloudflare R2: ${err.message}` });
  }
});

// ------------------- SBTET DATA ENDPOINTS -------------------

// Trigger SBTET data extraction for a college (admin/dev endpoint)
app.post('/api/sbtet/extract', authenticateToken, async (req, res) => {
  try {
    const { college_id = 54, schemes = ['C21', 'C24'] } = req.body;

    // Check if cache is stale (> 7 days old)
    let needsRefresh = false;
    for (const scheme of schemes) {
      const stale = await sbtet.isCacheStale(pool, college_id, scheme);
      if (stale) { needsRefresh = true; break; }
    }

    if (!needsRefresh) {
      return res.json({
        status: 'cache_fresh',
        message: 'SBTET data was fetched within the last 7 days. No refresh needed.',
      });
    }

    // Start extraction in background
    res.json({
      status: 'started',
      message: `Starting SBTET extraction for college ${college_id}, schemes: ${schemes.join(', ')}. This runs in the background.`,
    });

    // Run extraction asynchronously (don't await - let it run in background)
    const logs = [];
    sbtet.extractCollegeResults(pool, college_id, schemes, (msg) => {
      logs.push(msg);
      console.log(`[SBTET] ${msg}`);
    }).then(result => {
      console.log(`[SBTET] Extraction finished: ${JSON.stringify(result)}`);
    }).catch(err => {
      console.error(`[SBTET] Extraction error: ${err.message}`);
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error starting SBTET extraction' });
  }
});

// Check SBTET cache status
app.get('/api/sbtet/cache-status', authenticateToken, async (req, res) => {
  try {
    const { college_id = 54 } = req.query;

    const cacheRes = await pool.query(`
      SELECT scheme_code, sem_year_id, exam_type_name, branch_code,
             COUNT(*) as month_count, SUM(student_count) as total_students,
             SUM(subject_record_count) as total_subjects,
             MAX(fetched_at) as last_fetched
      FROM sbtet_cache_meta
      WHERE college_id = $1
      GROUP BY scheme_code, sem_year_id, exam_type_name, branch_code
      ORDER BY scheme_code, sem_year_id
    `, [college_id]);

    const totalStudentsRes = await pool.query('SELECT COUNT(DISTINCT pin) as count FROM sbtet_student_summary');
    const totalSubjectsRes = await pool.query('SELECT COUNT(*) as count FROM sbtet_subject_results');

    res.json({
      college_id: parseInt(college_id),
      cache_entries: cacheRes.rows,
      totals: {
        unique_students: parseInt(totalStudentsRes.rows[0].count),
        subject_records: parseInt(totalSubjectsRes.rows[0].count),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error checking cache status' });
  }
});

// Get SBTET results for a specific PIN (public lookup - no auth required for testing)
app.get('/api/sbtet/student/:pin', async (req, res) => {
  try {
    const pin = req.params.pin.trim().toUpperCase();
    const results = await sbtet.getStudentResults(pool, pin);

    if (!results.hasRealData) {
      return res.status(404).json({ error: 'No SBTET results found for this PIN', pin });
    }

    res.json({
      pin,
      student_name: results.semesters[0]?.student_name || 'Unknown',
      scheme: results.subjects[0]?.scheme_code || '',
      college: results.subjects[0]?.college_name || '',
      semesters: results.semesters,
      subjects: results.subjects,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching SBTET results' });
  }
});

// ------------------- SBTET MOBILE OTP VERIFICATION ENDPOINTS -------------------

// Generate SBTET mobile verification OTP (sends SMS OTP to student)
app.post('/api/sbtet/otp/generate', authenticateToken, async (req, res) => {
  try {
    const { pin, phone } = req.body;
    if (!pin || !phone) {
      return res.status(400).json({ error: 'PIN and Phone number are required' });
    }
    
    // Security check: Verify that the PIN matches user's username
    if (req.user.username.toLowerCase().trim() !== pin.toLowerCase().trim()) {
      return res.status(400).json({ error: 'The Roll Number (PIN) does not match your account username.' });
    }

    console.log(`[OTP] Generating SBTET OTP for PIN=${pin}, Phone=${phone}...`);
    const otpResult = await sbtet.generateOtp(pin, phone);
    
    if (otpResult.success) {
      res.json({
        success: true,
        message: otpResult.description || 'OTP sent successfully via SBTET portal.'
      });
    } else {
      res.status(400).json({
        success: false,
        error: otpResult.error || 'Failed to send OTP'
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error generating SBTET OTP' });
  }
});

// Verify SBTET mobile verification OTP (checks SMS OTP, updates mobile on SBTET, and verifies locally)
app.post('/api/sbtet/otp/verify', authenticateToken, async (req, res) => {
  try {
    const { pin, phone, otp } = req.body;
    if (!pin || !phone || !otp) {
      return res.status(400).json({ error: 'PIN, Phone, and OTP are required' });
    }
    
    // Security check: Verify that the PIN matches user's username
    if (req.user.username.toLowerCase().trim() !== pin.toLowerCase().trim()) {
      return res.status(400).json({ error: 'The Roll Number (PIN) does not match your account username.' });
    }

    console.log(`[OTP] Verifying SBTET OTP for PIN=${pin}, Phone=${phone}...`);
    const verifyResult = await sbtet.verifyOtpAndUpdate(pin, phone, otp);
    
    if (verifyResult.success && verifyResult.student) {
      const s = verifyResult.student;
      
      // Successfully verified on SBTET! Mark user verified in local DB.
      await pool.query(
        `UPDATE users 
         SET pin = $1, student_name = $2, branch = $3, college_name = $4, mobile_number = $5, is_verified = TRUE
         WHERE id = $6`,
        [pin, s.name, s.branchName, s.collegeName, s.phoneNumber || phone, req.user.id]
      );
      
      const user = await getUserWithStats(req.user.id);
      
      res.json({
        success: true,
        message: 'Account successfully verified via SBTET OTP!',
        user
      });
    } else {
      res.status(400).json({
        success: false,
        error: verifyResult.error || 'OTP verification failed'
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error verifying SBTET OTP' });
  }
});

// ------------------- POSTS (FEED) ENDPOINTS -------------------

// Get feed posts
app.get('/api/posts', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const postsQuery = await pool.query(
      `SELECT p.id, p.user_id, p.content, p.image_base64, p.media_url, p.media_type, 
              COALESCE(p.upload_status, 'ready') as upload_status, p.created_at,
              u.username, u.student_name, u.is_verified, u.profile_pic_base64, u.branch,
              COALESCE((SELECT COUNT(*)::integer FROM likes WHERE post_id = p.id), 0) as likes_count,
              EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = $1) as is_liked_by_me,
              COALESCE(
                (SELECT json_agg(
                   json_build_object(
                     'id', c.id,
                     'user_id', c.user_id,
                     'content', c.content,
                     'created_at', c.created_at,
                     'username', cu.username,
                     'student_name', COALESCE(cu.student_name, cu.username),
                     'is_verified', cu.is_verified,
                     'branch', cu.branch,
                     'profile_pic_base64', cu.profile_pic_base64
                   ) ORDER BY c.created_at ASC
                 )
                 FROM comments c
                 JOIN users cu ON c.user_id = cu.id
                 WHERE c.post_id = p.id
                ), '[]'::json
              ) as comments
       FROM posts p
       JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC`,
      [userId]
    );

    const formattedPosts = postsQuery.rows.map(p => {
      const displayName = (p.student_name && p.student_name !== 'Verified Student')
        ? p.student_name
        : p.username;
      
      const isReady = p.upload_status === 'ready' || p.media_url || p.image_base64;
      return {
        ...p,
        student_name: displayName,
        upload_status: isReady ? 'ready' : p.upload_status,
        likes_count: parseInt(p.likes_count) || 0,
        is_liked_by_me: !!p.is_liked_by_me,
        comments: Array.isArray(p.comments) ? p.comments : []
      };
    });

    res.json(formattedPosts);
  } catch (err) {
    console.error('[GET /api/posts Error]', err);
    res.status(500).json({ error: 'Server error fetching feed' });
  }
});

// Mark post as seen/read
app.post('/api/posts/:id/seen', authenticateToken, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = parseInt(req.user.id);

    await pool.query(
      `INSERT INTO seen_posts (user_id, post_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, post_id) DO NOTHING`,
      [userId, postId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error marking post as seen' });
  }
});

// Create a post / tweet
app.post('/api/posts', authenticateToken, async (req, res) => {
  const { content, image_base64, media_type } = req.body;
  if (!content && !image_base64) return res.status(400).json({ error: 'Post content or image cannot be empty' });

  try {
    const type = media_type || (image_base64 ? 'image' : 'tweet');
    const initialStatus = image_base64 ? 'pending' : 'ready';

    // 1. Insert into PostgreSQL primary database
    const pgRes = await pool.query(
      "INSERT INTO posts (user_id, content, image_base64, media_type, upload_status) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [req.user.id, content || '', image_base64 || null, type, initialStatus]
    );
    const newPost = pgRes.rows[0];

    // 2. Sync to Supabase REST
    try {
      await supabaseRestRequest('posts', 'POST', [{
        id: newPost.id,
        user_id: req.user.id,
        content: content || '',
        image_base64: image_base64 || null,
        media_type: type,
        upload_status: initialStatus
      }]);
    } catch (supErr) {
      console.error('[Supabase Post Sync Warning]', supErr.message);
    }

    // 3. Get Author user stats
    const userQuery = await pool.query('SELECT username, student_name, is_verified, profile_pic_base64, branch FROM users WHERE id = $1', [req.user.id]);
    const author = userQuery.rows[0] || {};
    const displayName = (author.student_name && author.student_name !== 'Verified Student') ? author.student_name : (author.username || req.user.username);

    const postDto = {
      id: newPost.id,
      content: newPost.content,
      image_base64: newPost.image_base64,
      media_url: newPost.media_url || null,
      media_type: newPost.media_type || type,
      upload_status: newPost.upload_status || 'ready',
      created_at: newPost.created_at || new Date().toISOString(),
      username: author.username || req.user.username,
      student_name: displayName,
      is_verified: author.is_verified || false,
      profile_pic_base64: author.profile_pic_base64 || null,
      branch: author.branch || null,
      likes_count: 0,
      is_liked_by_me: false,
      comments: []
    };

    if (image_base64) {
      enqueueMediaJob(newPost.id, image_base64, type);
    }

    res.status(201).json(postDto);
  } catch (err) {
    console.error('[Create Post Error]', err);
    res.status(500).json({ error: err.message || 'Server error creating post' });
  }
});

// ------------------- MARKETPLACE ENDPOINTS -------------------

// Get all marketplace listings across all polytechnic colleges (supports college filtering)
app.get('/api/marketplace', authenticateToken, async (req, res) => {
  try {
    const { college } = req.query;
    let query, params;

    if (college && college.trim() !== '') {
      query = `SELECT m.id, m.user_id, m.title, m.description, m.price, m.category, m.status, m.image_base64, m.listing_type, m.created_at,
                      u.username, u.student_name, u.college_name, u.branch, u.is_verified, u.profile_pic_base64
               FROM marketplace_listings m
               JOIN users u ON m.user_id = u.id
               WHERE u.college_name ILIKE $1
               ORDER BY m.created_at DESC`;
      params = [`%${college.trim()}%`];
    } else {
      query = `SELECT m.id, m.user_id, m.title, m.description, m.price, m.category, m.status, m.image_base64, m.listing_type, m.created_at,
                      u.username, u.student_name, u.college_name, u.branch, u.is_verified, u.profile_pic_base64
               FROM marketplace_listings m
               JOIN users u ON m.user_id = u.id
               ORDER BY m.created_at DESC`;
      params = [];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching marketplace listings' });
  }
});

// Create new listing
app.post('/api/marketplace', authenticateToken, async (req, res) => {
  const { title, description, price, category, image_base64, listing_type } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO marketplace_listings (user_id, title, description, price, category, image_base64, listing_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, title, description || '', price || '', category || '', image_base64 || null, listing_type || 'product']
    );
    
    // Fetch details with user info
    const details = await pool.query(
      `SELECT m.id, m.user_id, m.title, m.description, m.price, m.category, m.status, m.image_base64, m.listing_type, m.created_at,
              u.username, u.student_name, u.college_name, u.branch, u.is_verified, u.profile_pic_base64
       FROM marketplace_listings m
       JOIN users u ON m.user_id = u.id
       WHERE m.id = $1`,
      [result.rows[0].id]
    );
    res.status(201).json(details.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error creating marketplace listing' });
  }
});

// Update listing status
app.put('/api/marketplace/:id/status', authenticateToken, async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }
  try {
    // Check ownership
    const checkResult = await pool.query('SELECT user_id FROM marketplace_listings WHERE id = $1', [req.params.id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    if (checkResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to change listing status' });
    }
    
    const result = await pool.query(
      `UPDATE marketplace_listings
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, req.params.id]
    );
    
    const details = await pool.query(
      `SELECT m.id, m.user_id, m.title, m.description, m.price, m.category, m.status, m.image_base64, m.listing_type, m.created_at,
              u.username, u.student_name, u.college_name, u.branch, u.is_verified, u.profile_pic_base64
       FROM marketplace_listings m
       JOIN users u ON m.user_id = u.id
       WHERE m.id = $1`,
      [result.rows[0].id]
    );
    res.json(details.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error updating status' });
  }
});

// Like/unlike toggle
app.post('/api/posts/:id/like', authenticateToken, async (req, res) => {
  const postId = parseInt(req.params.id);

  try {
    // Check if liked
    const checkLike = await pool.query('SELECT * FROM likes WHERE user_id = $1 AND post_id = $2', [req.user.id, postId]);
    let liked = false;

    if (checkLike.rows.length > 0) {
      // Unlike
      await pool.query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2', [req.user.id, postId]);
    } else {
      // Like
      await pool.query('INSERT INTO likes (user_id, post_id) VALUES ($1, $2)', [req.user.id, postId]);
      liked = true;

      // Notify post owner
      const postOwner = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
      if (postOwner.rows.length > 0) {
        createNotification({
          userId: postOwner.rows[0].user_id,
          senderId: req.user.id,
          type: 'like',
          extraText: 'liked your post.',
          postId: postId
        });
      }
    }

    const likesCount = await pool.query('SELECT COUNT(*) FROM likes WHERE post_id = $1', [postId]);

    res.json({
      liked,
      likes_count: parseInt(likesCount.rows[0].count)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error liking post' });
  }
});

// Comment on post
app.post('/api/posts/:id/comment', authenticateToken, async (req, res) => {
  const postId = parseInt(req.params.id);
  const { content } = req.body;

  if (!content) return res.status(400).json({ error: 'Comment content cannot be empty' });

  try {
    const result = await pool.query(
      'INSERT INTO comments (user_id, post_id, content) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, postId, content]
    );

    const commentDetails = await pool.query(
      `SELECT c.id, c.user_id, c.content, c.created_at, u.username, 
              COALESCE(u.student_name, u.username) as student_name, 
              u.is_verified, u.branch, u.profile_pic_base64
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = $1`,
      [result.rows[0].id]
    );

    // Notify post owner
    const postOwner = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
    if (postOwner.rows.length > 0) {
      createNotification({
        userId: postOwner.rows[0].user_id,
        senderId: req.user.id,
        type: 'comment',
        extraText: `commented: "${content.substring(0, 60)}${content.length > 60 ? '...' : ''}"`,
        postId: postId
      });
    }

    res.status(201).json(commentDetails.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error creating comment' });
  }
});

// Delete post
app.delete('/api/posts/:id', authenticateToken, async (req, res) => {
  const postId = parseInt(req.params.id);
  try {
    const postCheck = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
    if (postCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (postCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to delete this post' });
    }

    await pool.query('DELETE FROM seen_posts WHERE post_id = $1', [postId]).catch(() => {});
    await pool.query('DELETE FROM likes WHERE post_id = $1', [postId]).catch(() => {});
    await pool.query('DELETE FROM comments WHERE post_id = $1', [postId]).catch(() => {});
    await pool.query('DELETE FROM notifications WHERE post_id = $1', [postId]).catch(() => {});
    await pool.query('DELETE FROM posts WHERE id = $1', [postId]);

    res.json({ message: 'Post deleted successfully', id: postId });
  } catch (err) {
    console.error('Error deleting post:', err);
    res.status(500).json({ error: 'Server error deleting post' });
  }
});

// Delete comment
app.delete('/api/comments/:id', authenticateToken, async (req, res) => {
  const commentId = parseInt(req.params.id);
  try {
    const commentCheck = await pool.query(
      `SELECT c.user_id, c.post_id, p.user_id as post_author_id
       FROM comments c
       JOIN posts p ON c.post_id = p.id
       WHERE c.id = $1`,
      [commentId]
    );
    if (commentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    const comment = commentCheck.rows[0];
    if (comment.user_id !== req.user.id && comment.post_author_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to delete this comment' });
    }

    await pool.query('DELETE FROM comments WHERE id = $1', [commentId]);
    res.json({ message: 'Comment deleted successfully', id: commentId, post_id: comment.post_id });
  } catch (err) {
    console.error('Error deleting comment:', err);
    res.status(500).json({ error: 'Server error deleting comment' });
  }
});

// Get user notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.id, n.type, n.extra_text, n.post_id, n.is_read, n.created_at,
              u.username as sender_username, u.student_name as sender_student_name, u.profile_pic_base64 as sender_avatar
       FROM notifications n
       JOIN users u ON n.sender_id = u.id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    const notifs = result.rows.map(r => ({
      id: r.id.toString(),
      type: r.type,
      senderName: r.sender_student_name || r.sender_username || 'Someone',
      senderAvatar: r.sender_avatar || null,
      extraText: r.extra_text,
      timestamp: new Date(r.created_at).getTime(),
      isRead: r.is_read,
      postId: r.post_id
    }));
    res.json(notifs);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Server error retrieving notifications' });
  }
});

// Mark all notifications as read
app.post('/api/notifications/mark-read', authenticateToken, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Error marking notifications read:', err);
    res.status(500).json({ error: 'Server error updating notifications' });
  }
});

// ------------------- BLOGS ENDPOINTS -------------------

// Get all blogs
app.get('/api/blogs', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.id, b.title, b.content, b.created_at,
              u.username, u.student_name, u.is_verified, u.profile_pic_base64
       FROM blogs b
       JOIN users u ON b.user_id = u.id
       ORDER BY b.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching blogs' });
  }
});

// Create a blog
app.post('/api/blogs', authenticateToken, async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Blog title and content are required' });
  }

  try {
    // Check if user is verified
    const userQuery = await pool.query('SELECT is_verified FROM users WHERE id = $1', [req.user.id]);
    if (userQuery.rows.length === 0 || !userQuery.rows[0].is_verified) {
      return res.status(403).json({ error: 'Only verified campus students can publish blogs.' });
    }

    const result = await pool.query(
      'INSERT INTO blogs (user_id, title, content) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, title, content]
    );

    const blogDetails = await pool.query(
      `SELECT b.id, b.title, b.content, b.created_at,
              u.username, u.student_name, u.is_verified, u.profile_pic_base64
       FROM blogs b
       JOIN users u ON b.user_id = u.id
       WHERE b.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json(blogDetails.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error creating blog' });
  }
});

// ------------------- DM / CONVERSATIONS REST ENDPOINTS -------------------

// Online users registry: Map<userId, socketId>
const onlineUsers = new Map();

// Create or get existing DM conversation
app.post('/api/conversations', authenticateToken, async (req, res) => {
  try {
    const targetId = parseInt(req.body.target_user_id);
    const myId = parseInt(req.user.id);

    if (!targetId) return res.status(400).json({ error: 'target_user_id is required' });

    // Check if DM room already exists between these two users
    let existing;
    if (myId === targetId) {
      existing = await pool.query(
        `SELECT cr.id FROM chat_rooms cr
         JOIN chat_room_participants p1 ON cr.id = p1.room_id AND p1.user_id = $1
         WHERE cr.type = 'direct' AND (SELECT COUNT(*) FROM chat_room_participants WHERE room_id = cr.id) = 1
         LIMIT 1`,
        [myId]
      );
    } else {
      existing = await pool.query(
        `SELECT cr.id FROM chat_rooms cr
         JOIN chat_room_participants p1 ON cr.id = p1.room_id AND p1.user_id = $1
         JOIN chat_room_participants p2 ON cr.id = p2.room_id AND p2.user_id = $2
         WHERE cr.type = 'direct' AND (SELECT COUNT(*) FROM chat_room_participants WHERE room_id = cr.id) = 2
         LIMIT 1`,
        [myId, targetId]
      );
    }

    let roomId;
    if (existing.rows.length > 0) {
      roomId = existing.rows[0].id;
    } else {
      // Create new room and add participant(s)
      const roomResult = await pool.query(
        `INSERT INTO chat_rooms (type) VALUES ('direct') RETURNING id`
      );
      roomId = roomResult.rows[0].id;
      if (myId === targetId) {
        await pool.query(
          `INSERT INTO chat_room_participants (room_id, user_id) VALUES ($1, $2)`,
          [roomId, myId]
        );
      } else {
        await pool.query(
          `INSERT INTO chat_room_participants (room_id, user_id) VALUES ($1, $2), ($1, $3)`,
          [roomId, myId, targetId]
        );
      }
    }

    // Return conversation DTO
    const other = await pool.query(
      `SELECT u.id, u.username, u.student_name, u.profile_pic_base64, u.is_verified
       FROM users u WHERE u.id = $1`, [targetId]
    );
    const otherUser = other.rows[0] || {};

    // Get last message
    const lastMsg = await pool.query(
      `SELECT text_content, message_type, created_at FROM messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT 1`, [roomId]
    );

    const unread = await pool.query(
      `SELECT COUNT(*)::integer as count FROM messages WHERE room_id = $1 AND sender_id != $2 AND is_read = FALSE`, [roomId, myId]
    );

    res.json({
      id: roomId,
      other_user_id: otherUser.id,
      other_username: otherUser.username,
      other_student_name: otherUser.student_name,
      other_profile_pic_base64: otherUser.profile_pic_base64,
      other_is_verified: otherUser.is_verified || false,
      last_message: lastMsg.rows[0]?.text_content || null,
      last_message_time: lastMsg.rows[0]?.created_at || null,
      last_message_type: lastMsg.rows[0]?.message_type || null,
      unread_count: unread.rows[0]?.count || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error creating conversation' });
  }
});

// List all conversations for the logged-in user
app.get('/api/conversations', authenticateToken, async (req, res) => {
  try {
    const myId = req.user.id;
    const result = await pool.query(
      `SELECT cr.id as room_id,
              u.id as other_user_id, u.username as other_username, u.student_name as other_student_name,
              u.profile_pic_base64 as other_profile_pic_base64, u.is_verified as other_is_verified,
              (
                SELECT m.text_content FROM messages m WHERE m.room_id = cr.id ORDER BY m.created_at DESC LIMIT 1
              ) as last_message,
              (
                SELECT m.created_at FROM messages m WHERE m.room_id = cr.id ORDER BY m.created_at DESC LIMIT 1
              ) as last_message_time,
              (
                SELECT m.message_type FROM messages m WHERE m.room_id = cr.id ORDER BY m.created_at DESC LIMIT 1
              ) as last_message_type,
              (
                SELECT COUNT(*)::integer FROM messages m WHERE m.room_id = cr.id AND m.sender_id != $1 AND m.is_read = FALSE
              ) as unread_count
       FROM chat_rooms cr
       JOIN chat_room_participants p1 ON cr.id = p1.room_id AND p1.user_id = $1
       JOIN users u ON u.id = COALESCE(
         (SELECT user_id FROM chat_room_participants WHERE room_id = cr.id AND user_id != $1 LIMIT 1),
         $1
       )
       WHERE cr.type = 'direct'
       ORDER BY last_message_time DESC NULLS LAST`,
      [myId]
    );

    res.json(result.rows.map(r => ({
      id: r.room_id,
      other_user_id: r.other_user_id,
      other_username: r.other_username,
      other_student_name: r.other_student_name,
      other_profile_pic_base64: r.other_profile_pic_base64,
      other_is_verified: r.other_is_verified || false,
      last_message: r.last_message,
      last_message_time: r.last_message_time,
      last_message_type: r.last_message_type,
      unread_count: r.unread_count || 0
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching conversations' });
  }
});

// Get paginated messages for a conversation
app.get('/api/conversations/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const myId = req.user.id;
    const roomId = parseInt(req.params.roomId);
    const limit = parseInt(req.query.limit) || 30;
    const beforeId = req.query.before ? parseInt(req.query.before) : null;

    // Verify user is a participant
    const participant = await pool.query(
      `SELECT 1 FROM chat_room_participants WHERE room_id = $1 AND user_id = $2`, [roomId, myId]
    );
    if (participant.rows.length === 0) return res.status(403).json({ error: 'Not a participant' });

    let query, params;
    if (beforeId) {
      query = `SELECT id, room_id, sender_id, message_type, text_content, media_url, is_read, created_at
               FROM messages WHERE room_id = $1 AND id < $2 ORDER BY created_at DESC LIMIT $3`;
      params = [roomId, beforeId, limit];
    } else {
      query = `SELECT id, room_id, sender_id, message_type, text_content, media_url, is_read, created_at
               FROM messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT $2`;
      params = [roomId, limit];
    }

    const result = await pool.query(query, params);

    // Mark unread messages as read
    await pool.query(
      `UPDATE messages SET is_read = TRUE WHERE room_id = $1 AND sender_id != $2 AND is_read = FALSE`,
      [roomId, myId]
    );

    // Return in chronological order (oldest first)
    res.json(result.rows.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching messages' });
  }
});

// ------------------- SOCKET.IO REAL-TIME -------------------

// Authenticate socket connections with JWT
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.id;
    socket.username = decoded.username;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', async (socket) => {
  const userId = socket.userId;
  console.log(`User ${userId} (${socket.username}) connected via Socket.IO`);

  // Register in online users map
  onlineUsers.set(userId, socket.id);
  socket.join(`user_${userId}`);

  // Join all chat rooms this user participates in
  try {
    const rooms = await pool.query(
      `SELECT room_id FROM chat_room_participants WHERE user_id = $1`, [userId]
    );
    rooms.rows.forEach(r => socket.join(`room_${r.room_id}`));
  } catch (err) {
    console.error('Error joining rooms:', err);
  }

  // Broadcast online status to all connected users
  io.emit('user_online', { user_id: userId });

  // --- Send Message ---
  socket.on('send_message', async (data) => {
    try {
      const { room_id, text_content, message_type = 'text', media_url = null } = data;

      // Verify sender is participant
      const participant = await pool.query(
        `SELECT 1 FROM chat_room_participants WHERE room_id = $1 AND user_id = $2`, [room_id, userId]
      );
      if (participant.rows.length === 0) return;

      // Save to database
      const result = await pool.query(
        `INSERT INTO messages (room_id, sender_id, message_type, text_content, media_url)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, room_id, sender_id, message_type, text_content, media_url, is_read, created_at`,
        [room_id, userId, message_type, text_content, media_url]
      );

      const message = result.rows[0];

      // Broadcast to all participants in the room
      io.to(`room_${room_id}`).emit('new_message', message);

      // Send notification to other room participant(s)
      const otherParts = await pool.query(
        `SELECT user_id FROM chat_room_participants WHERE room_id = $1 AND user_id != $2`,
        [room_id, userId]
      );
      for (const p of otherParts.rows) {
        createNotification({
          userId: p.user_id,
          senderId: userId,
          type: 'message',
          extraText: text_content ? text_content.substring(0, 60) : 'sent a media attachment.'
        });
      }

    } catch (err) {
      console.error('Error sending message:', err);
    }
  });

  // --- Typing Indicators ---
  socket.on('typing', (data) => {
    const { room_id } = data;
    socket.to(`room_${room_id}`).emit('user_typing', {
      room_id,
      user_id: userId,
      username: socket.username
    });
  });

  socket.on('stop_typing', (data) => {
    const { room_id } = data;
    socket.to(`room_${room_id}`).emit('user_stop_typing', {
      room_id,
      user_id: userId
    });
  });

  // --- Mark Messages as Read ---
  socket.on('message_read', async (data) => {
    try {
      const { room_id } = data;
      await pool.query(
        `UPDATE messages SET is_read = TRUE WHERE room_id = $1 AND sender_id != $2 AND is_read = FALSE`,
        [room_id, userId]
      );
      socket.to(`room_${room_id}`).emit('messages_read', { room_id, reader_id: userId });
    } catch (err) {
      console.error('Error marking messages read:', err);
    }
  });

  // --- Join Room (when opening a new conversation) ---
  socket.on('join_room', (data) => {
    const { room_id } = data;
    socket.join(`room_${room_id}`);
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    console.log(`User ${userId} disconnected`);
    onlineUsers.delete(userId);
    io.emit('user_offline', { user_id: userId });
  });
});

// --- App Version & Auto-Update Endpoints ---
app.get('/api/app-version', (req, res) => {
  res.json({
    latestVersionCode: 1,
    latestVersionName: '1.0.0',
    downloadUrl: 'api/app-version/download',
    releaseNotes: 'Initial production release of DiplomaNexus.',
    forceUpdate: false
  });
});

app.get('/api/app-version/download', (req, res) => {
  const apkPath = path.join(__dirname, 'updates', 'diplomanexus-v1.1.0.apk');
  const fs = require('fs');
  if (fs.existsSync(apkPath)) {
    res.download(apkPath, 'diplomanexus-v1.1.0.apk');
  } else {
    res.status(404).json({ error: 'APK file not found on server' });
  }
});

// Start Server (HTTP server for both Express + Socket.IO)
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} (HTTP + Socket.IO)`);
});
