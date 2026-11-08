// 重置密码：node scripts/reset-password.js <用户名> [新密码]
// 不带新密码时用隐藏输入；重置后登出该用户全部设备。
const path = require('path');
const readline = require('readline');
const { openDb } = require('../src/db');
const { hashPassword, destroyAllSessions } = require('../src/auth');
const logMod = require('../src/log');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:footprint_dev_pw@localhost:5432/footprint';

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const muted = (s) => {
      const out = s === '\n' || s === '\r\n' ? '\n' : '';
      process.stdout.write(out);
    };
    rl._writeToOutput = muted;
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

(async () => {
  const username = process.argv[2];
  let password = process.argv[3];
  if (!username) {
    console.error('用法：node scripts/reset-password.js <用户名> [新密码]');
    process.exit(1);
  }
  if (!password) {
    password = await promptHidden(`为「${username}」设置新密码（至少 8 位，输入不回显）: `);
  }
  if (password.length < 8) {
    console.error('密码至少 8 位');
    process.exit(1);
  }
  const db = await openDb(DATABASE_URL);
  logMod.init(path.join(DATA_DIR, 'logs'));
  const user = await db.get('SELECT * FROM users WHERE login_name = ?', [username]);
  if (!user) {
    console.error(`找不到用户名为「${username}」的账号`);
    process.exit(1);
  }
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(password), user.id]);
  await destroyAllSessions(db, user.id);
  logMod.log('reset_password', `管理员重置了 ${username} 的密码`);
  console.log(`已重置「${username}」的密码，全部设备已登出。`);
  process.exit(0);
})();
