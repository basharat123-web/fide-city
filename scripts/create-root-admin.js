'use strict';
// Create (or promote) a ROOT ADMIN account from the command line.
//   npm run create-root-admin -- <username> <email>
// The password is typed at a hidden prompt (or read from ADMIN_PASSWORD for automation).
const readline = require('node:readline');
const { db, audit } = require('../lib/db');
const sec = require('../lib/security');

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = false;
    rl._writeToOutput = function (s) {
      if (rl.stdoutMuted && s !== '\r\n' && s !== '\n') rl.output.write('*');
      else rl.output.write(s);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    rl.stdoutMuted = true;
  });
}

(async () => {
  const [username, emailRaw] = process.argv.slice(2);
  if (!username || !emailRaw) {
    console.error('Usage: npm run create-root-admin -- <username> <email>');
    process.exit(1);
  }
  const email = emailRaw.toLowerCase();
  const uErr = sec.validUsername(username);
  const eErr = sec.validEmail(email);
  if (uErr || eErr) {
    console.error(uErr || eErr);
    process.exit(1);
  }

  const existing = db.prepare('SELECT id, role FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    db.prepare("UPDATE users SET role = 'root_admin', staff_title = COALESCE(staff_title, 'Project Management'), banned = 0 WHERE id = ?").run(existing.id);
    audit(existing.id, 'cli_promote_root_admin', username, 'cli');
    console.log(`\n👑 SUCCESS: Account "${username}" is now a ROOT ADMIN with full privileges.`);
    return;
  }

  const password = process.env.ADMIN_PASSWORD || (await askHidden('Password (min 10 characters): '));
  const err = sec.validPassword(password, username);
  if (err) {
    console.error(err);
    process.exit(1);
  }
  const hash = await sec.hashPassword(password);
  const id = Number(
    db
      .prepare("INSERT INTO users (username, email, password_hash, role, staff_title, created_at) VALUES (?, ?, ?, 'root_admin', 'Project Management', ?)")
      .run(username, email, hash, Date.now()).lastInsertRowid
  );
  audit(id, 'cli_create_root_admin', username, 'cli');
  console.log(`\n👑 SUCCESS: Root Admin account "${username}" created! Sign in at /login.`);
})().then(() => process.exit(0), (e) => {
  console.error(e);
  process.exit(1);
});
