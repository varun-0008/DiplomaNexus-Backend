require('dotenv').config();
const { Pool } = require('pg');

// Parse argument or read from env
const argPin = process.argv[2];
const devPin = process.env.DEV_PIN || '24054-cps-063';
const pinToReset = argPin || devPin;

console.log(`Initializing database reset for PIN: ${pinToReset}...`);

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.query(
  `UPDATE users 
   SET pin = NULL, is_verified = FALSE, student_name = NULL, branch = NULL, college_name = NULL, mobile_number = NULL 
   WHERE pin = $1`,
  [pinToReset],
  (err, res) => {
    if (err) {
      console.error('Error executing reset query:', err);
      process.exit(1);
    } else {
      console.log(`Reset successful! Affected rows: ${res.rowCount}`);
      pool.end(() => {
        console.log('Database connection closed.');
        process.exit(0);
      });
    }
  }
);
