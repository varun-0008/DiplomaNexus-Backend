require('dotenv').config();
const { Pool } = require('pg');

const pinToReset = process.argv[2] || '24054-cps-063';

console.log(`Clearing user database entry for PIN/Username: ${pinToReset}...`);

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || 'diplomaconnect',
  password: process.env.DB_PASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
});

async function clearUser() {
  try {
    const res = await pool.query(
      `DELETE FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(pin) = LOWER($1)`,
      [pinToReset]
    );
    console.log(`Successfully deleted user entry! Deleted rows: ${res.rowCount}`);
  } catch (err) {
    console.error('Error clearing user database entry:', err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

clearUser();
