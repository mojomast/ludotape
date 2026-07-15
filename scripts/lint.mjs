// Zero-dependency lint: syntax-checks every .mjs file under the source roots and greps
// authoring surfaces (src/, devkit/, examples/) for non-deterministic patterns.
// Usage: node scripts/lint.mjs
import {readdirSync, statSync, readFileSync, existsSync} from 'node:fs';
import {join, relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// Directories walked for syntax checking. Missing directories (owned by sibling
// work streams that have not landed yet) are skipped silently.
const SYNTAX_ROOTS = ['src', 'bin', 'test', 'examples', 'scripts', 'bench', 'devkit', 'studio'];
// Directories scanned for forbidden non-deterministic patterns. Narrower than the
// syntax roots: only game/core authoring surfaces are held to the determinism rule.
const GREP_ROOTS = ['src', 'devkit', 'examples'];
const SKIP_DIR_NAMES = new Set(['dist', 'node_modules', '.git']);

const FORBIDDEN_PATTERNS = [
  {name: 'Math.random()', re: /\bMath\.random\s*\(/g},
  {name: 'Date.now()', re: /\bDate\.now\s*\(/g},
  {name: 'new Date()', re: /new Date\s*\(\s*\)/g}
];
const ALLOW_COMMENT = /\/\/\s*ludotape-lint:\s*allow/;

function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir, {withFileTypes: true}); }
  catch { return out; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { walk(full, out); continue; }
    if (entry.isFile() && entry.name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

function collect(roots) {
  const files = [];
  for (const rel of roots) {
    const dir = join(root, rel);
    if (!existsSync(dir)) continue;
    if (!statSync(dir).isDirectory()) continue;
    walk(dir, files);
  }
  return [...new Set(files)].sort();
}

let failed = false;
const problems = [];

// --- syntax check ---------------------------------------------------------
const syntaxFiles = collect(SYNTAX_ROOTS);
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
  if (result.status !== 0) {
    failed = true;
    problems.push(`${relative(root, file)}: syntax error\n${(result.stderr || result.stdout || '').trim()}`);
  }
}

// --- forbidden pattern grep ------------------------------------------------
const grepFiles = collect(GREP_ROOTS);
let hits = 0;
for (const file of grepFiles) {
  const relPath = relative(root, file);
  // Test files are exempt (determinism rule applies to shipped authoring code).
  if (relPath.includes('.test.mjs') || relPath.split('/').includes('test')) continue;
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ALLOW_COMMENT.test(line)) continue;
    for (const pattern of FORBIDDEN_PATTERNS) {
      pattern.re.lastIndex = 0;
      if (pattern.re.test(line)) {
        hits++;
        failed = true;
        problems.push(`${relPath}:${i + 1}: forbidden non-deterministic pattern ${pattern.name}`);
      }
    }
  }
}

for (const problem of problems) console.error(problem);

console.log(JSON.stringify({
  format: 'ludotape/lint@1',
  syntaxChecked: syntaxFiles.length,
  grepScanned: grepFiles.length,
  forbiddenPatternHits: hits,
  ok: !failed
}, null, 2));

process.exit(failed ? 1 : 0);
