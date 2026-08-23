-- ====================================================================
-- DiplomaNexus Clean Production PostgreSQL Schema (No Mock Data)
-- ====================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    pin VARCHAR(50) UNIQUE,
    student_name VARCHAR(255),
    branch VARCHAR(100),
    college_name VARCHAR(255),
    mobile_number VARCHAR(50),
    is_verified BOOLEAN DEFAULT FALSE,
    about_me TEXT,
    profile_pic_base64 TEXT,
    verification_screenshot_base64 TEXT,
    subscription_tier VARCHAR(50) DEFAULT 'Free',
    birth_date VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. POSTS TABLE
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_base64 TEXT,
    media_url TEXT,
    media_type VARCHAR(20) DEFAULT 'image',
    upload_status VARCHAR(20) DEFAULT 'ready',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. LIKES TABLE
CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    UNIQUE(user_id, post_id)
);

-- 4. COMMENTS TABLE
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. BLOGS TABLE
CREATE TABLE IF NOT EXISTS blogs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. FOLLOWS TABLE
CREATE TABLE IF NOT EXISTS follows (
    id SERIAL PRIMARY KEY,
    follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, following_id)
);

-- 7. CHAT ROOMS TABLE
CREATE TABLE IF NOT EXISTS chat_rooms (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) DEFAULT 'direct',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. CHAT ROOM PARTICIPANTS TABLE
CREATE TABLE IF NOT EXISTS chat_room_participants (
    room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (room_id, user_id)
);

-- 9. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message_type VARCHAR(20) DEFAULT 'text',
    text_content TEXT,
    media_url TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. SEEN POSTS TABLE
CREATE TABLE IF NOT EXISTS seen_posts (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id)
);

-- 11. MARKETPLACE LISTINGS TABLE
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

-- 12. MOCK STUDENT DATA TABLE (FOR ACADEMIC PIN BINDINGS)
CREATE TABLE IF NOT EXISTS mock_student_data (
    pin VARCHAR(50) PRIMARY KEY,
    student_name VARCHAR(255) NOT NULL,
    branch VARCHAR(100) NOT NULL,
    college_name VARCHAR(255) NOT NULL,
    mobile_number VARCHAR(50) NOT NULL,
    attendance_percentage INTEGER NOT NULL,
    sgpa NUMERIC(4, 2) NOT NULL,
    backlogs INTEGER DEFAULT 0
);

-- 13. STUDENT SEMESTER DATA TABLE
CREATE TABLE IF NOT EXISTS student_semester_data (
    pin VARCHAR(50) NOT NULL,
    semester_number INTEGER NOT NULL,
    attendance_percentage INTEGER NOT NULL,
    sgpa NUMERIC(4, 2) NOT NULL,
    backlogs INTEGER DEFAULT 0,
    PRIMARY KEY (pin, semester_number)
);

-- 14. SBTET SUBJECT RESULTS TABLE
CREATE TABLE IF NOT EXISTS sbtet_subject_results (
    id SERIAL PRIMARY KEY,
    pin VARCHAR(50) NOT NULL,
    branch_code VARCHAR(10),
    subject_code VARCHAR(30),
    subject_name TEXT,
    hybrid_grade VARCHAR(5),
    scheme_code VARCHAR(10),
    semester VARCHAR(10),
    mid1_marks VARCHAR(10),
    mid2_marks VARCHAR(10),
    internal_marks VARCHAR(10),
    end_sem_marks VARCHAR(10),
    subject_total VARCHAR(10),
    exam_type VARCHAR(30),
    college_code VARCHAR(10),
    college_name TEXT,
    exam_month_year VARCHAR(30),
    exam_month_year_id INTEGER,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pin, subject_code, scheme_code, semester, exam_month_year_id)
);

-- 15. SBTET STUDENT SUMMARY TABLE
CREATE TABLE IF NOT EXISTS sbtet_student_summary (
    id SERIAL PRIMARY KEY,
    pin VARCHAR(50) NOT NULL,
    student_name TEXT,
    semester VARCHAR(10),
    total_marks NUMERIC(8, 2),
    total_credits VARCHAR(10),
    sgpa VARCHAR(10),
    cgpa VARCHAR(10),
    sem_exam_status VARCHAR(30),
    total_grade_points VARCHAR(10),
    scheme_code VARCHAR(10),
    exam_month_year VARCHAR(30),
    exam_month_year_id INTEGER,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pin, scheme_code, semester, exam_month_year_id)
);

-- 16. SBTET CACHE META TABLE
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

-- HIGH-PERFORMANCE PRODUCTION INDEXES
CREATE INDEX IF NOT EXISTS idx_sbtet_subject_pin ON sbtet_subject_results(pin);
CREATE INDEX IF NOT EXISTS idx_sbtet_subject_scheme_sem ON sbtet_subject_results(scheme_code, semester);
CREATE INDEX IF NOT EXISTS idx_sbtet_summary_pin ON sbtet_student_summary(pin);
CREATE INDEX IF NOT EXISTS idx_sbtet_cache_college ON sbtet_cache_meta(college_id, scheme_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_pin ON users(pin);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
