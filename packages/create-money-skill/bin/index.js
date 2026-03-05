#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const HOST = 'https://fast-api-xi-seven.vercel.app';
const INSTALL_DIR = path.join(process.env.HOME, '.money');

const files = [
  { name: 'SKILL.md', url: `${HOST}/skill.md` },
  { name: 'money.bundle.js', url: `${HOST}/money.bundle.js` },
];

const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function fetch(url) {
  return new Promise((resolve, reject) => {
    const request = (url) => {
      https.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    request(url);
  });
}

async function main() {
  console.log();
  console.log(colors.bold('🦞 Money Skill Installer'));
  console.log(colors.cyan('   Universal payments for AI agents'));
  console.log();

  // Create install directory
  if (!fs.existsSync(INSTALL_DIR)) {
    fs.mkdirSync(INSTALL_DIR, { recursive: true });
    console.log(`📁 Created ${INSTALL_DIR}`);
  }

  // Download files
  for (const file of files) {
    process.stdout.write(`📥 Downloading ${file.name}...`);
    try {
      const data = await fetch(file.url);
      fs.writeFileSync(path.join(INSTALL_DIR, file.name), data);
      console.log(colors.green(' ✓'));
    } catch (err) {
      console.log(colors.red(` ✗ ${err.message}`));
      process.exit(1);
    }
  }

  // Verify SHA256
  process.stdout.write('🔒 Verifying integrity...');
  try {
    const sha256Url = `${HOST}/money.bundle.js.sha256`;
    const sha256Data = (await fetch(sha256Url)).toString().trim();
    const expectedHash = sha256Data.split(/\s+/)[0];
    
    const bundlePath = path.join(INSTALL_DIR, 'money.bundle.js');
    const bundleData = fs.readFileSync(bundlePath);
    const actualHash = crypto.createHash('sha256').update(bundleData).digest('hex');
    
    if (actualHash === expectedHash) {
      console.log(colors.green(' ✓'));
    } else {
      console.log(colors.red(' ✗ SHA256 mismatch!'));
      process.exit(1);
    }
  } catch (err) {
    console.log(colors.yellow(` ⚠ Could not verify (${err.message})`));
  }

  // Success message
  console.log();
  console.log(colors.green('✅ Money skill installed successfully!'));
  console.log();
  console.log(colors.bold('Quickstart:'));
  console.log();
  console.log(colors.cyan(`  const { money } = await import(\`\${process.env.HOME}/.money/money.bundle.js\`);`));
  console.log(colors.cyan(`  await money.setup({ chain: "fast" });`));
  console.log(colors.cyan(`  await money.balance({ chain: "fast" });`));
  console.log();
  console.log(`📖 Full docs: ${INSTALL_DIR}/SKILL.md`);
  console.log(`🔗 13 chains supported: Fast, Base, Ethereum, Arbitrum, Polygon, and more`);
  console.log();
}

main().catch((err) => {
  console.error(colors.red(`Error: ${err.message}`));
  process.exit(1);
});
