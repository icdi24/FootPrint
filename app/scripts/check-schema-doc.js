// 校验：db.js 里 CREATE TABLE 的表名集合 == 《数据库设计实现文档》§3 标记块里的表名集合。
// 只读、无新增依赖、无副作用。加表忘改文档时以非零码退出。
// 用法：cd app && npm run check:schema-doc
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DB_FILE = path.join(ROOT, 'app', 'src', 'db.js');
const DOC_FILE = path.join(ROOT, '数据库设计实现文档.md');

function fail(msg) {
  console.error('[check-schema-doc] ' + msg);
  process.exitCode = 1;
}

for (const f of [DB_FILE, DOC_FILE]) {
  if (!fs.existsSync(f)) {
    fail('找不到文件：' + f);
    process.exit(1);
  }
}

const dbSrc = fs.readFileSync(DB_FILE, 'utf8');
const docSrc = fs.readFileSync(DOC_FILE, 'utf8');

const START = '<!-- SCHEMA_TABLES:START -->';
const END = '<!-- SCHEMA_TABLES:END -->';
const s = docSrc.indexOf(START);
const e = docSrc.indexOf(END);

if (s < 0 || e < 0 || e <= s) {
  fail('文档里找不到 SCHEMA_TABLES:START / END 标记块（§3 表清单），无法校验');
  process.exit(1);
}

const block = docSrc.slice(s + START.length, e);
const docTables = [...block.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((m) => m[1]);
const codeTables = [...dbSrc.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z][a-z0-9_]*)/gi)].map((m) => m[1]);

const docSet = new Set(docTables);
const codeSet = new Set(codeTables);
const missing = codeTables.filter((t) => !docSet.has(t));
const extra = docTables.filter((t) => !codeSet.has(t));
const dupDoc = [...new Set(docTables.filter((t, i) => docTables.indexOf(t) !== i))];
const dupCode = [...new Set(codeTables.filter((t, i) => codeTables.indexOf(t) !== i))];

if (missing.length || extra.length || dupDoc.length || dupCode.length) {
  if (missing.length) fail('代码里有表、文档没列：' + missing.join(', '));
  if (extra.length) fail('文档里列了、代码里没有的表：' + extra.join(', '));
  if (dupDoc.length) fail('文档标记块里重复的表名：' + dupDoc.join(', '));
  if (dupCode.length) fail('db.js 里重复建表：' + dupCode.join(', '));
  fail('请同步《数据库设计实现文档.md》的 §3 / §4 / §6 / §11 后重跑');
} else {
  console.log(`[check-schema-doc] OK：db.js 与文档均为 ${codeTables.length} 张表，清单一致`);
}
