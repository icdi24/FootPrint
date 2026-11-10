// 校验：agent/tools.js 的工具清单 / 白名单工作流清单 == 《Agent工作流实现文档》标记块里的清单。
// 只读、无新增依赖、无副作用。增删工具或工作流却忘改文档时以非零码退出。
// 用法：node app/scripts/check-agent-doc.js（在仓库根目录执行）
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TOOLS_FILE = path.join(ROOT, 'app', 'src', 'agent', 'tools.js');
const DOC_FILE = path.join(ROOT, 'Agent工作流实现文档.md');

function fail(msg) {
  console.error('[check-agent-doc] ' + msg);
  process.exitCode = 1;
}

for (const f of [TOOLS_FILE, DOC_FILE]) {
  if (!fs.existsSync(f)) {
    fail('找不到文件：' + f);
    process.exit(1);
  }
}

const toolsSrc = fs.readFileSync(TOOLS_FILE, 'utf8');
const docSrc = fs.readFileSync(DOC_FILE, 'utf8');

// 取文档里 <!-- NAME:START --> ... <!-- NAME:END --> 之间的内容
function block(name) {
  const start = `<!-- ${name}:START -->`;
  const end = `<!-- ${name}:END -->`;
  const s = docSrc.indexOf(start);
  const e = docSrc.indexOf(end);
  if (s < 0 || e < 0 || e <= s) {
    fail(`文档里找不到 ${name}:START / END 标记块，无法校验`);
    process.exit(1);
  }
  return docSrc.slice(s + start.length, e);
}

function names(text) {
  return [...text.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((m) => m[1]);
}

// 取 tools.js 里某个顶层对象常量的源码片段
function section(header) {
  const s = toolsSrc.indexOf(header);
  if (s < 0) return '';
  const e = toolsSrc.indexOf('\n};', s);
  return e < 0 ? toolsSrc.slice(s) : toolsSrc.slice(s, e);
}

// IMPLEMENTATIONS 里形如 "  read_my_goals: {" 的键（两空格缩进，排除嵌套字段）
const codeTools = [...section('const IMPLEMENTATIONS = {')
  .matchAll(/^  ([a-z][a-z0-9_]*): \{/gm)].map((m) => m[1]);

// WHITELIST 里形如 "  plan: [" 的键
const codeWorkflows = [...section('const WHITELIST = {')
  .matchAll(/^  ([a-z][a-z0-9_]*): \[/gm)].map((m) => m[1]);

if (!codeTools.length) {
  fail('没从 tools.js 解析到工具，检查 IMPLEMENTATIONS 格式');
  process.exit(1);
}
if (!codeWorkflows.length) {
  fail('没从 tools.js 解析到工作流，检查 WHITELIST 格式');
  process.exit(1);
}

let bad = false;
function compare(label, code, doc) {
  const codeSet = new Set(code);
  const docSet = new Set(doc);
  const missing = code.filter((x) => !docSet.has(x));
  const extra = doc.filter((x) => !codeSet.has(x));
  const dupCode = [...new Set(code.filter((x, i) => code.indexOf(x) !== i))];
  const dupDoc = [...new Set(doc.filter((x, i) => doc.indexOf(x) !== i))];
  if (missing.length || extra.length || dupCode.length || dupDoc.length) {
    bad = true;
    if (missing.length) fail(`${label}：代码里有、文档没列：${missing.join(', ')}`);
    if (extra.length) fail(`${label}：文档里列了、代码里没有：${extra.join(', ')}`);
    if (dupCode.length) fail(`${label}：代码里重复：${dupCode.join(', ')}`);
    if (dupDoc.length) fail(`${label}：文档标记块里重复：${dupDoc.join(', ')}`);
  } else {
    console.log(`[check-agent-doc] OK：${label} ${code.length} 项一致`);
  }
}

compare('工具清单', codeTools, names(block('AGENT_TOOLS')));
compare('工作流清单', codeWorkflows, names(block('AGENT_WORKFLOWS')));

if (bad) {
  fail('请同步《Agent工作流实现文档.md》的 §0 / §3 / §5.3 / §5.4 / §9 / §12 后重跑');
}
