import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function normalizePath(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/') || input.startsWith('~\\')) {
    return path.join(os.homedir(), input.slice(2));
  }
  return path.resolve(input);
}

async function canUseDir(dir: string): Promise<boolean> {
  try {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const probe = path.join(dir, `.fast-probe-${process.pid}-${Date.now()}`);
    await fs.writeFile(probe, 'ok', { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
    await fs.rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

export async function ensureFastConfigDir(): Promise<string> {
  const candidates: string[] = [];
  const envDir = process.env.FAST_CONFIG_DIR?.trim();

  if (envDir) {
    candidates.push(normalizePath(envDir));
  }

  candidates.push(path.join(process.cwd(), '.fast-runtime'));
  candidates.push(path.join(os.tmpdir(), '.fast-runtime'));

  for (const candidate of candidates) {
    if (await canUseDir(candidate)) {
      process.env.FAST_CONFIG_DIR = candidate;
      return candidate;
    }
  }

  throw new Error('Unable to initialize FAST_CONFIG_DIR');
}
