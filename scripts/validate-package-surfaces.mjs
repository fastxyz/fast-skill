#!/usr/bin/env node
// Check the docs against the packages agents actually install.
//
// 1. Every `@fastxyz/*` package named in a Markdown file must be published on npm.
// 2. Every value imported from `@fastxyz/*` in a ```ts / ```js code block must be a
//    runtime export of the latest published version of that entrypoint.
// 3. Every ```ts code block must type-check against those packages.
//
// The latest versions are installed into a temporary directory, so this catches
// drift when a package is published without the skill being updated. Set
// FAST_SKILL_KEEP_TMP=1 to keep that directory for debugging.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(fullPath);
  }
  return files;
}

const packageName = (specifier) => specifier.split('/').slice(0, 2).join('/');

const markdownFiles = walk(root);
const mentioned = new Set();
const codeBlocks = []; // { file, index, lang, code }

for (const filePath of markdownFiles) {
  const relativePath = path.relative(root, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  for (const match of content.matchAll(/@fastxyz\/[a-z0-9-]+/g)) mentioned.add(match[0]);
  let index = 0;
  for (const match of content.matchAll(/```(ts|typescript|js|javascript)\n([\s\S]*?)```/g)) {
    index += 1;
    codeBlocks.push({ file: relativePath, index, lang: match[1], code: match[2] });
  }
}

// Value imports: `import { a, b as c, type T } from '@fastxyz/...'` and default/namespace imports.
const imports = []; // { file, index, specifier, names }
for (const block of codeBlocks) {
  for (const match of block.code.matchAll(/import\s+(type\s+)?([^;'"]*?)\s+from\s+['"](@fastxyz\/[^'"]+)['"]/g)) {
    if (match[1]) continue; // `import type { ... }`
    const clause = match[2];
    const names = [];
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      for (const raw of braces[1].split(',')) {
        const item = raw.trim();
        if (!item || item.startsWith('type ')) continue;
        names.push(item.split(/\s+as\s+/)[0].trim());
      }
    }
    const defaultImport = clause.replace(/\{[\s\S]*\}/, '').split(',')[0].trim();
    if (defaultImport && !defaultImport.startsWith('*')) names.push('default');
    imports.push({ file: block.file, index: block.index, specifier: match[3], names });
  }
}

// 1. Mentioned packages are published.
const versions = {};
for (const name of [...mentioned].sort()) {
  try {
    versions[name] = execFileSync('npm', ['view', name, 'version'], { encoding: 'utf8' }).trim();
  } catch {
    failures.push(`${name} is mentioned in the docs but is not published on npm`);
  }
}

const imported = [...new Set(imports.map((entry) => packageName(entry.specifier)))].filter((name) => versions[name]);
const tsBlocks = codeBlocks.filter((block) => block.lang === 'ts' || block.lang === 'typescript');
const needsExpress = tsBlocks.some((block) => /from ['"]express['"]/.test(block.code));
const needsViem = tsBlocks.some((block) => /from ['"]viem/.test(block.code));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-skill-validate-'));
try {
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'fast-skill-validate', private: true, type: 'module' }));
  const install = [
    ...imported.map((name) => `${name}@${versions[name]}`),
    'typescript@5',
    `@types/node@${process.versions.node.split('.')[0]}`, // type-check against the Node.js running this check
    ...(needsExpress ? ['express@5', '@types/express@5'] : []),
    ...(needsViem ? ['viem'] : []),
  ];
  console.log(`Installing ${install.join(', ')}`);
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', ...install], { cwd: tmp, stdio: 'inherit' });

  // 2. Imported names are runtime exports.
  const bySpecifier = new Map();
  for (const entry of imports) {
    if (!versions[packageName(entry.specifier)]) continue;
    const list = bySpecifier.get(entry.specifier) ?? [];
    list.push(entry);
    bySpecifier.set(entry.specifier, list);
  }
  const checker = `
const results = {};
for (const specifier of ${JSON.stringify([...bySpecifier.keys()])}) {
  try { results[specifier] = Object.keys(await import(specifier)); }
  catch (error) { results[specifier] = { error: String(error.message ?? error).split('\\n')[0] }; }
}
console.log(JSON.stringify(results));
`;
  fs.writeFileSync(path.join(tmp, 'check-exports.mjs'), checker);
  const exportsBySpecifier = JSON.parse(execFileSync('node', ['check-exports.mjs'], { cwd: tmp, encoding: 'utf8' }));
  for (const [specifier, entries] of bySpecifier) {
    const exported = exportsBySpecifier[specifier];
    for (const entry of entries) {
      const where = `${entry.file} (code block ${entry.index})`;
      if (!Array.isArray(exported)) {
        failures.push(`${where} imports from ${specifier}, which cannot be imported: ${exported.error}`);
        continue;
      }
      for (const name of entry.names) {
        if (!exported.includes(name)) {
          failures.push(`${where} imports ${name} from ${specifier}, which ${packageName(specifier)}@${versions[packageName(specifier)]} does not export`);
        }
      }
    }
  }

  // 3. TypeScript examples type-check.
  const examplesDir = path.join(tmp, 'examples');
  fs.mkdirSync(examplesDir);
  const exampleFiles = {};
  for (const block of tsBlocks) {
    const fileName = `${block.file.replace(/[\\/]/g, '__').replace(/\.md$/, '')}__${block.index}.ts`;
    exampleFiles[fileName] = `${block.file} (code block ${block.index})`;
    // `export {}` makes each example its own module so top-level await is allowed.
    fs.writeFileSync(path.join(examplesDir, fileName), `${block.code}\nexport {};\n`);
  }
  fs.writeFileSync(
    path.join(tmp, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'es2022',
        module: 'nodenext',
        moduleResolution: 'nodenext',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: ['node'],
      },
      include: ['examples/*.ts'],
    }),
  );
  if (tsBlocks.length > 0) {
    try {
      execFileSync(path.join(tmp, 'node_modules', '.bin', 'tsc'), ['-p', 'tsconfig.json'], { cwd: tmp, encoding: 'utf8' });
    } catch (error) {
      const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
      const lines = output.split('\n').filter(Boolean);
      for (const line of lines) {
        const fileName = line.match(/examples\/([^(]+)\(/)?.[1];
        failures.push(fileName ? `${exampleFiles[fileName]}: ${line.slice(line.indexOf(':') + 1).trim()}` : line);
      }
      // A failure without diagnostics (tsc missing, killed, ...) must not pass as success.
      if (lines.length === 0) failures.push(`TypeScript check failed without diagnostics: ${error.message}`);
    }
  }
} finally {
  if (process.env.FAST_SKILL_KEEP_TMP === '1') console.log(`Kept ${tmp}`);
  else fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('Package surface validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Validated ${mentioned.size} FAST package names, ${imports.length} imports and ${tsBlocks.length} TypeScript examples across ${markdownFiles.length} markdown files against: ${imported.map((name) => `${name}@${versions[name]}`).join(', ')}.`,
);
