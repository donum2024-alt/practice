import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir: string | null = null;
let originalCwd: string | null = null;

export function setupTestDb(): void {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-retire-'));
  fs.copyFileSync(path.join(originalCwd, 'schema.sql'), path.join(tmpDir, 'schema.sql'));
  process.chdir(tmpDir);
}

export async function teardownTestDb(): Promise<void> {
  const { closeDB } = await import('@/lib/db');
  closeDB();
  if (originalCwd) process.chdir(originalCwd);
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
  originalCwd = null;
}
