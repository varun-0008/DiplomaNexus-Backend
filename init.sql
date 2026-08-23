-- Initialize Database Schema for DiplomaConnect

-- Drop tables if they exist (for easy recreation)
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS likes;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS blogs;
DROP TABLE IF EXISTS mock_student_data;
DROP TABLE IF EXISTS users;

-- Users Table
CREATE TABLE users (
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Posts Table
CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_base64 TEXT,
    media_url TEXT,
    media_type VARCHAR(20) DEFAULT 'image',
    upload_status VARCHAR(20) DEFAULT 'ready',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Likes Table (Join Table for Posts & Users)
CREATE TABLE likes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    UNIQUE(user_id, post_id)
);

-- Comments Table
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Blogs Table
CREATE TABLE blogs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mock Student Data Table (Contains pre-populated data for results / attendance verification)
CREATE TABLE mock_student_data (
    pin VARCHAR(50) PRIMARY KEY,
    student_name VARCHAR(255) NOT NULL,
    branch VARCHAR(100) NOT NULL,
    college_name VARCHAR(255) NOT NULL,
    mobile_number VARCHAR(50) NOT NULL,
    attendance_percentage INTEGER NOT NULL,
    sgpa NUMERIC(4, 2) NOT NULL,
    backlogs INTEGER DEFAULT 0
);

-- Seed Mock Student Data
-- Standard SBTET PIN formats: e.g., 23001-CM-001 (Year 23, College 001, Branch CM - Comp. Eng, Serial 001)
INSERT INTO mock_student_data (pin, student_name, branch, college_name, mobile_number, attendance_percentage, sgpa, backlogs) VALUES
('23001-CM-001', 'Rahul Kumar', 'Computer Engineering', 'Government Polytechnic, Masab Tank', '9876543210', 87, 8.92, 0),
('23001-CM-002', 'Sneha Reddy', 'Computer Engineering', 'Government Polytechnic, Masab Tank', '9123456789', 74, 7.80, 1),
('23023-EC-045', 'Karthik Rao', 'Electronics & Communication', 'S.G. Government Polytechnic, Adilabad', '9012345678', 92, 9.15, 0),
('23084-EE-012', 'Ananya Vyas', 'Electrical & Electronics', 'Government Polytechnic, Warangal', '9898989898', 81, 8.10, 0),
('23001-ME-102', 'Mohammed Ali', 'Mechanical Engineering', 'Government Polytechnic, Masab Tank', '8765432109', 65, 6.50, 3),
-- Developer test account
('24054-cps-063', 'Developer', 'Cyber Physical Systems and Security', 'Government Polytechnic, Hyderabad', '9999999999', 91, 9.20, 0);

-- Semester Data Table for Results and Attendance (6 semesters)
CREATE TABLE IF NOT EXISTS student_semester_data (
    pin VARCHAR(50) REFERENCES mock_student_data(pin) ON DELETE CASCADE,
    semester_number INTEGER NOT NULL,
    attendance_percentage INTEGER NOT NULL,
    sgpa NUMERIC(4, 2) NOT NULL,
    backlogs INTEGER DEFAULT 0,
    PRIMARY KEY (pin, semester_number)
);

-- Seed Semester Data for main mock accounts
-- 24054-cps-063 (Developer)
INSERT INTO student_semester_data (pin, semester_number, attendance_percentage, sgpa, backlogs) VALUES
('24054-cps-063', 1, 88, 8.50, 0),
('24054-cps-063', 2, 92, 8.90, 0),
('24054-cps-063', 3, 90, 9.10, 0),
('24054-cps-063', 4, 94, 9.20, 0),
('24054-cps-063', 5, 91, 9.30, 0),
('24054-cps-063', 6, 93, 9.50, 0);

-- 23001-CM-001 (Rahul Kumar)
INSERT INTO student_semester_data (pin, semester_number, attendance_percentage, sgpa, backlogs) VALUES
('23001-CM-001', 1, 85, 8.20, 0),
('23001-CM-001', 2, 86, 8.40, 0),
('23001-CM-001', 3, 89, 8.70, 0),
('23001-CM-001', 4, 88, 8.92, 0),
('23001-CM-001', 5, 90, 9.10, 0),
('23001-CM-001', 6, 91, 9.30, 0);

-- 23001-CM-002 (Sneha Reddy)
INSERT INTO student_semester_data (pin, semester_number, attendance_percentage, sgpa, backlogs) VALUES
('23001-CM-002', 1, 75, 7.20, 1),
('23001-CM-002', 2, 78, 7.50, 0),
('23001-CM-002', 3, 72, 7.10, 2),
('23001-CM-002', 4, 80, 7.80, 0),
('23001-CM-002', 5, 76, 7.40, 1),
('23001-CM-002', 6, 79, 7.90, 0);

