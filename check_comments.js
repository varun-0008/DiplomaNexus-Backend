const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function run() {
  try {
    const comments = await pool.query('SELECT * FROM comments');
    console.log('Comments in DB:', comments.rows);
    const posts = await pool.query('SELECT id, content FROM posts LIMIT 5');
    console.log('Posts in DB:', posts.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
