const { Pool } = require('pg');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ANSI color codes for premium CLI experience
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  bgCyan: "\x1b[46m",
  bgBlack: "\x1b[40m"
};

// Check environment variables
if (!process.env.DB_USER || !process.env.DB_NAME || !process.env.DB_HOST) {
  console.log(`${colors.red}${colors.bright}Error: Database environment variables are missing in .env!${colors.reset}`);
  process.exit(1);
}

// PostgreSQL Connection Pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

function clearConsole() {
  process.stdout.write('\x1Bc');
}

function printHeader(title) {
  const line = "═".repeat(60);
  console.log(`\n${colors.cyan}${colors.bright}${line}`);
  console.log(`  ${title.toUpperCase()}`);
  console.log(`${line}${colors.reset}\n`);
}

async function showMainMenu() {
  while (true) {
    clearConsole();
    printHeader("DiplomaConnect Admin Terminal");
    console.log(`${colors.yellow}${colors.bright}1.${colors.reset} List All Users`);
    console.log(`${colors.yellow}${colors.bright}2.${colors.reset} Inspect User & Export Screenshot`);
    console.log(`${colors.yellow}${colors.bright}3.${colors.reset} Verify / Unverify User`);
    console.log(`${colors.yellow}${colors.bright}4.${colors.reset} Database Console (SQL Exec)`);
    console.log(`${colors.yellow}${colors.bright}5.${colors.reset} Exit`);
    console.log(`\n${colors.cyan}═`.repeat(60) + colors.reset);

    const choice = await question(`\n${colors.bright}Select an option (1-5): ${colors.reset}`);
    
    switch (choice.trim()) {
      case '1':
        await listUsers();
        break;
      case '2':
        await inspectUser();
        break;
      case '3':
        await toggleVerification();
        break;
      case '4':
        await databaseConsole();
        break;
      case '5':
        console.log(`\n${colors.green}Goodbye!${colors.reset}`);
        pool.end();
        rl.close();
        return;
      default:
        console.log(`${colors.red}Invalid option, try again.${colors.reset}`);
        await question(`\nPress Enter to continue...`);
    }
  }
}

async function listUsers() {
  clearConsole();
  printHeader("List of Registered Users");
  try {
    const query = `
      SELECT 
        id, 
        username, 
        pin, 
        student_name, 
        is_verified, 
        subscription_tier, 
        (verification_screenshot_base64 IS NOT NULL) AS has_screenshot 
      FROM users 
      ORDER BY id ASC
    `;
    const res = await pool.query(query);
    
    if (res.rows.length === 0) {
      console.log(`${colors.yellow}No users registered yet.${colors.reset}`);
    } else {
      // Map rows for nice console.table representation without full objects
      const displayRows = res.rows.map(row => ({
        "ID": row.id,
        "Username": row.username,
        "PIN (Roll No)": row.pin || "N/A",
        "Student Name": row.student_name || "N/A",
        "Verified": row.is_verified ? "YES ✓" : "NO ✗",
        "Subscription": row.subscription_tier,
        "Screenshot": row.has_screenshot ? "UPLOADED ✓" : "MISSING ✗"
      }));
      console.table(displayRows);
    }
  } catch (err) {
    console.error(`${colors.red}Error fetching users:`, err.message, colors.reset);
  }
  await question(`\nPress Enter to return to main menu...`);
}

async function inspectUser() {
  clearConsole();
  printHeader("Inspect User Details");
  const identifier = await question(`${colors.bright}Enter username or User ID to inspect: ${colors.reset}`);
  
  if (!identifier.trim()) {
    console.log(`${colors.red}Identifier cannot be empty.${colors.reset}`);
    await question(`\nPress Enter to continue...`);
    return;
  }

  try {
    // Check if ID or Username
    const query = isNaN(identifier) 
      ? 'SELECT * FROM users WHERE username = $1' 
      : 'SELECT * FROM users WHERE id = $1';
    
    const params = isNaN(identifier) ? [identifier.trim()] : [parseInt(identifier.trim())];
    const res = await pool.query(query, params);

    if (res.rows.length === 0) {
      console.log(`${colors.red}User not found.${colors.reset}`);
    } else {
      const user = res.rows[0];
      console.log(`\n${colors.cyan}--- Profile Information ---${colors.reset}`);
      console.log(`${colors.bright}User ID:       ${colors.reset}${user.id}`);
      console.log(`${colors.bright}Username:      ${colors.reset}${user.username}`);
      console.log(`${colors.bright}Subscription:  ${colors.reset}${user.subscription_tier}`);
      console.log(`${colors.bright}Created At:    ${colors.reset}${user.created_at}`);

      console.log(`\n${colors.cyan}--- Verification Details ---${colors.reset}`);
      console.log(`${colors.bright}Is Verified:   ${colors.reset}${user.is_verified ? `${colors.green}YES ✓${colors.reset}` : `${colors.red}NO ✗${colors.reset}`}`);
      console.log(`${colors.bright}PIN (Roll No): ${colors.reset}${user.pin || 'N/A'}`);
      console.log(`${colors.bright}Student Name:  ${colors.reset}${user.student_name || 'N/A'}`);
      console.log(`${colors.bright}Branch:        ${colors.reset}${user.branch || 'N/A'}`);
      console.log(`${colors.bright}College:       ${colors.reset}${user.college_name || 'N/A'}`);
      console.log(`${colors.bright}Mobile Number: ${colors.reset}${user.mobile_number || 'N/A'}`);

      if (user.verification_screenshot_base64) {
        console.log(`\n${colors.green}${colors.bright}Verification Screenshot Found! Decoding...${colors.reset}`);
        try {
          const base64Data = user.verification_screenshot_base64.replace(/^data:\w+\/\w+;base64,/, "");
          const buffer = Buffer.from(base64Data, 'base64');
          
          const filename = `screenshot_${user.username.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`;
          const filepath = path.join(__dirname, filename);
          
          fs.writeFileSync(filepath, buffer);
          console.log(`${colors.green}✓ Screenshot exported successfully to file:${colors.reset}`);
          console.log(`${colors.cyan}${colors.underline}file:///${filepath.replace(/\\/g, '/')}${colors.reset}`);
          console.log(`${colors.italic}Double click the link above or open the file in the directory to inspect the verification page.${colors.reset}`);
        } catch (e) {
          console.error(`${colors.red}Failed to decode and save screenshot:`, e.message, colors.reset);
        }
      } else {
        console.log(`\n${colors.yellow}No verification screenshot uploaded for this user.${colors.reset}`);
      }
    }
  } catch (err) {
    console.error(`${colors.red}Error executing query:`, err.message, colors.reset);
  }
  await question(`\nPress Enter to return to main menu...`);
}

async function toggleVerification() {
  clearConsole();
  printHeader("Manually Verify / Unverify User");
  const identifier = await question(`${colors.bright}Enter username or User ID: ${colors.reset}`);
  
  if (!identifier.trim()) {
    console.log(`${colors.red}Identifier cannot be empty.${colors.reset}`);
    await question(`\nPress Enter to continue...`);
    return;
  }

  try {
    const checkQuery = isNaN(identifier) 
      ? 'SELECT id, username, is_verified FROM users WHERE username = $1' 
      : 'SELECT id, username, is_verified FROM users WHERE id = $1';
    
    const params = isNaN(identifier) ? [identifier.trim()] : [parseInt(identifier.trim())];
    const checkRes = await pool.query(checkQuery, params);

    if (checkRes.rows.length === 0) {
      console.log(`${colors.red}User not found.${colors.reset}`);
      await question(`\nPress Enter to continue...`);
      return;
    }

    const user = checkRes.rows[0];
    console.log(`User ${colors.cyan}${user.username}${colors.reset} is currently ${user.is_verified ? `${colors.green}VERIFIED` : `${colors.red}NOT VERIFIED`}${colors.reset}.`);
    
    const action = await question(`${colors.bright}Type 'V' to verify, 'U' to unverify, or 'C' to cancel: ${colors.reset}`);
    let newStatus = null;
    
    if (action.trim().toUpperCase() === 'V') {
      newStatus = true;
    } else if (action.trim().toUpperCase() === 'U') {
      newStatus = false;
    }

    if (newStatus !== null) {
      const updateQuery = 'UPDATE users SET is_verified = $1 WHERE id = $2 RETURNING username, is_verified';
      const updateRes = await pool.query(updateQuery, [newStatus, user.id]);
      const updated = updateRes.rows[0];
      console.log(`${colors.green}Successfully updated ${updated.username} verification status to: ${updated.is_verified ? 'VERIFIED' : 'UNVERIFIED'}${colors.reset}`);
    } else {
      console.log(`${colors.yellow}Action cancelled.${colors.reset}`);
    }
  } catch (err) {
    console.error(`${colors.red}Error toggling status:`, err.message, colors.reset);
  }
  await question(`\nPress Enter to return to main menu...`);
}

async function databaseConsole() {
  clearConsole();
  printHeader("Database Console (SQL Repl)");
  console.log(`${colors.italic}Type standard PostgreSQL queries. Type 'exit' or press Ctrl+C to return to main menu.${colors.reset}\n`);

  while (true) {
    const queryStr = await question(`${colors.blue}${colors.bright}SQL> ${colors.reset}`);
    
    if (!queryStr.trim()) continue;
    if (queryStr.trim().toLowerCase() === 'exit') break;

    try {
      const res = await pool.query(queryStr);
      console.log(`\n${colors.green}Query executed successfully. Result rowcount: ${res.rowCount}${colors.reset}`);
      if (res.rows && res.rows.length > 0) {
        // Truncate base64 strings in output so table doesn't get messed up
        const formattedRows = res.rows.map(row => {
          const copy = { ...row };
          for (let key in copy) {
            if (typeof copy[key] === 'string' && copy[key].length > 50) {
              copy[key] = copy[key].substring(0, 47) + '...';
            }
          }
          return copy;
        });
        console.table(formattedRows);
      } else {
        console.log(`${colors.yellow}No rows returned.${colors.reset}`);
      }
      console.log();
    } catch (err) {
      console.error(`\n${colors.red}Database Error: ${err.message}${colors.reset}\n`);
    }
  }
}

// Start
showMainMenu();
