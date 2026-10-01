import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdd-setup-smoke-'));
  fs.copyFileSync(path.join(originalCwd, 'schema.sql'), path.join(tmpDir, 'schema.sql'));
  process.chdir(tmpDir);
  vi.resetModules();
});

afterEach(async () => {
  const { closeDB } = await import('@/lib/db');
  closeDB();
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('smoke: 테스트 환경이 route 핸들러를 직접 호출해 격리된 DB로 검증할 수 있다', () => {
  it('등록된 경쟁사가 없으면 GET /api/competitors는 빈 배열을 반환한다', async () => {
    const { GET } = await import('@/app/api/competitors/route');

    const res = await GET(new Request('http://localhost/api/competitors'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it('POST /api/competitors로 등록하면 같은 경쟁사가 GET 응답에 나타난다', async () => {
    const { GET, POST } = await import('@/app/api/competitors/route');

    const postRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: '테스트경쟁사' }),
      }),
    );
    expect(postRes.status).toBe(201);

    const getRes = await GET(new Request('http://localhost/api/competitors'));
    const body = await getRes.json();

    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('테스트경쟁사');
    expect(body[0].status).toBe('조사중');
  });
});
