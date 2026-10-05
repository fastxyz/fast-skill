#!/usr/bin/env node
// Print the latest published version of every @fastxyz package the docs name,
// to compare with `metadata.verified_against` in SKILL.md.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

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

const names = new Set();
for (const filePath of walk(root)) {
  for (const match of fs.readFileSync(filePath, 'utf8').matchAll(/@fastxyz\/[a-z0-9-]+/g)) names.add(match[0]);
}

console.log('# FAST package inventory (latest on npm)');
console.log('');
for (const name of [...names].sort()) {
  let version;
  try {
    // npm is npm.cmd on Windows, which only starts through a shell; name is a package name.
    version = execFileSync('npm', ['view', name, 'version'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
  } catch {
    version = '(not published)';
  }
  console.log(`- ${name}@${version}`);
}
