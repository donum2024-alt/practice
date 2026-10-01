import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { fakeSpawn, resetSpawnStub, getSpawnCalls, lastSpawnCall } from './helpers/spawn-stub';
import { readSSE } from './helpers/sse';
import { SUMMARY_ITEM_KEYS } from '@/types';

vi.mock('child_process', () => ({ spawn: (...args: Parameters<typeof fakeSpawn>) => fakeSpawn(...args) }));

beforeEach(() => {
  setupTestDb();
  vi.resetModules();
  resetSpawnStub();
});

afterEach(async () => {
  await teardownTestDb();
});

async function createCompetitor(name: string): Promise<{ id: number; name: string }> {
  const { POST } = await import('@/app/api/competitors/route');
  const res = await POST(
    new Request('http://localhost/api/competitors', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  );
  return res.json();
}

async function insertMaterial(
  competitorId: number,
  overrides: Partial<{
    content: string;
    source_type: string;
    source_name: string | null;
    source_url: string | null;
    topic: string | null;
  }> = {},
): Promise<void> {
  const { getDB } = await import('@/lib/db');
  const db = getDB();
  const material = {
    content: '기본 수집 내용',
    source_type: '직접입력',
    source_name: null,
    source_url: null,
    topic: null,
    ...overrides,
  };
  db.prepare(
    `INSERT INTO collected_materials (competitor_id, content, source_type, source_name, source_url, topic)
     VALUES (@competitor_id, @content, @source_type, @source_name, @source_url, @topic)`,
  ).run({ competitor_id: competitorId, ...material });
}

function draftRequest(body: unknown, init: RequestInit = {}): Request {
  return new Request('http://localhost/api/ai/draft-summary', {
    method: 'POST',
    body: JSON.stringify(body),
    ...init,
  });
}

function promptOf(call: ReturnType<typeof lastSpawnCall>): string {
  const idx = call.args.indexOf('-p');
  if (idx === -1 || !call.args[idx + 1]) {
    throw new Error('spawn 호출 args에서 -p 다음 prompt를 찾지 못했습니다.');
  }
  return call.args[idx + 1];
}

describe('jeongni-ai-choan: 항목별 정리 초안 AI 생성 (SSE 스트리밍)', () => {
  it('IMPL-4a: 존재하지 않는 competitorId면 404와 "경쟁사를 찾을 수 없습니다." 에러를 반환한다', async () => {
    const { POST } = await import('@/app/api/ai/draft-summary/route');

    const res = await POST(draftRequest({ competitorId: 999999 }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('경쟁사를 찾을 수 없습니다.');
  });

  it('IMPL-4b/US10: 경쟁사는 있지만 collected_materials가 0건이면 400과 "수집된 자료가 없습니다." 에러를 반환한다', async () => {
    const competitor = await createCompetitor('자료없음경쟁사');
    const { POST } = await import('@/app/api/ai/draft-summary/route');

    const res = await POST(draftRequest({ competitorId: competitor.id }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('수집된 자료가 없습니다.');
  });

  it('IMPL-5: topic이 SKU수인 자료와 topic이 null인 자료가 함께 있으면 prompt에 [SKU수]와 [기타] 섹션이 모두 있고 null 자료는 기타에 포함된다', async () => {
    const competitor = await createCompetitor('혼합토픽경쟁사');
    await insertMaterial(competitor.id, { content: 'SKU 100개 보유', topic: 'SKU수' });
    await insertMaterial(competitor.id, { content: '분류되지 않은 내용', topic: null });
    const { POST } = await import('@/app/api/ai/draft-summary/route');

    await POST(draftRequest({ competitorId: competitor.id }));

    const prompt = promptOf(lastSpawnCall());
    expect(prompt).toContain('[SKU수]');
    expect(prompt).toContain('[기타]');
    const otherSectionIndex = prompt.indexOf('[기타]');
    expect(prompt.slice(otherSectionIndex)).toContain('분류되지 않은 내용');
  });

  it('US2: prompt에는 DB에서 조회한 자료의 content/source_name만 포함되고 spawn은 competitorId당 1회만 호출된다', async () => {
    const competitor = await createCompetitor('단일호출경쟁사');
    await insertMaterial(competitor.id, {
      content: '고유콘텐츠내용123',
      source_name: '고유출처이름456',
      topic: '강점',
    });
    const { POST } = await import('@/app/api/ai/draft-summary/route');

    await POST(draftRequest({ competitorId: competitor.id }));

    expect(getSpawnCalls()).toHaveLength(1);
    const prompt = promptOf(lastSpawnCall());
    expect(prompt).toContain('고유콘텐츠내용123');
    expect(prompt).toContain('고유출처이름456');
  });

  it('IMPL-7: prompt에 명시된 5개 항목 키가 SUMMARY_ITEM_KEYS와 순서·값 모두 정확히 일치한다', async () => {
    const competitor = await createCompetitor('항목키경쟁사');
    await insertMaterial(competitor.id, { content: '내용', topic: '강점' });
    const { POST } = await import('@/app/api/ai/draft-summary/route');

    await POST(draftRequest({ competitorId: competitor.id }));

    const prompt = promptOf(lastSpawnCall());
    const jsonPart = prompt.slice(prompt.indexOf('"items"'));
    const keyRegex = /"([^"]+)":\s*\{\s*"draft"/g;
    const foundKeys: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = keyRegex.exec(jsonPart)) !== null) {
      foundKeys.push(match[1]);
    }
    expect(foundKeys).toEqual(SUMMARY_ITEM_KEYS);
  });

  it('IMPL-9/US3/US1: stdout data 이벤트가 여러 번 나뉘어 발생하면 각 청크가 버퍼링 없이 별도 message 이벤트로 전달된다', async () => {
    const competitor = await createCompetitor('스트리밍경쟁사');
    await insertMaterial(competitor.id, { content: '내용', topic: '강점' });
    const { POST } = await import('@/app/api/ai/draft-summary/route');
    const res = await POST(draftRequest({ competitorId: competitor.id }));
    const { child } = lastSpawnCall();

    const readPromise = readSSE(res);
    child.stdout.emit('data', Buffer.from('첫번째청크 '));
    child.stdout.emit('data', Buffer.from('두번째청크 '));
    child.stdout.emit('data', Buffer.from('세번째청크'));
    child.emit('close', 0);
    const events = await readPromise;

    const messageEvents = events.filter((e) => e.event === 'message');
    expect(messageEvents).toHaveLength(3);
    expect(messageEvents.map((e) => e.data)).toEqual(['첫번째청크 ', '두번째청크 ', '세번째청크']);
  });

  it('IMPL-11/US12: req.signal이 abort되면 child.kill()이 호출된다', async () => {
    const competitor = await createCompetitor('취소경쟁사');
    await insertMaterial(competitor.id, { content: '내용', topic: '강점' });
    const { POST } = await import('@/app/api/ai/draft-summary/route');
    const controller = new AbortController();
    await POST(draftRequest({ competitorId: competitor.id }, { signal: controller.signal }));
    const { child } = lastSpawnCall();

    controller.abort();
    await Promise.resolve();

    expect(child.kill).toHaveBeenCalled();
  });

  it('IMPL-12a/US11: spawn이 ENOENT 에러를 내면 SSE error 이벤트에 "claude CLI를 찾을 수 없습니다" 메시지가 담긴다', async () => {
    const competitor = await createCompetitor('ENOENT경쟁사');
    await insertMaterial(competitor.id, { content: '내용', topic: '강점' });
    const { POST } = await import('@/app/api/ai/draft-summary/route');
    const res = await POST(draftRequest({ competitorId: competitor.id }));
    const { child } = lastSpawnCall();

    const readPromise = readSSE(res);
    child.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }));
    const events = await readPromise;

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.data).toContain('claude CLI를 찾을 수 없습니다');
  });

  it('IMPL-12b/US11: stderr에 내용이 있고 종료 코드 1이면 error 이벤트에 그 stderr 내용이 담긴다', async () => {
    const competitor = await createCompetitor('stderr있음경쟁사');
    await insertMaterial(competitor.id, { content: '내용', topic: '강점' });
    const { POST } = await import('@/app/api/ai/draft-summary/route');
    const res = await POST(draftRequest({ competitorId: competitor.id }));
    const { child } = lastSpawnCall();

    const readPromise = readSSE(res);
    child.stderr.emit('data', Buffer.from('claude 실행 중 오류가 발생했습니다'));
    child.emit('close', 1);
    const events = await readPromise;

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.data).toBe('claude 실행 중 오류가 발생했습니다');
  });

  it('IMPL-12b/US11: stderr가 비어 있고 종료 코드 1이면 error 이벤트에 "종료 코드 1" 메시지가 담긴다', async () => {
    const competitor = await createCompetitor('stderr없음경쟁사');
    await insertMaterial(competitor.id, { content: '내용', topic: '강점' });
    const { POST } = await import('@/app/api/ai/draft-summary/route');
    const res = await POST(draftRequest({ competitorId: competitor.id }));
    const { child } = lastSpawnCall();

    const readPromise = readSSE(res);
    child.emit('close', 1);
    const events = await readPromise;

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.data).toBe('claude가 종료 코드 1로 종료되었습니다.');
  });

  it('IMPL-16/US6: 정상 처리 전후로 summaries 테이블의 해당 competitor_id 행이 생성되거나 변경되지 않는다', async () => {
    const competitor = await createCompetitor('summary불변경쟁사');
    await insertMaterial(competitor.id, { content: '내용', topic: '강점' });
    const { getDB } = await import('@/lib/db');
    const db = getDB();
    const before = db.prepare('SELECT * FROM summaries WHERE competitor_id = ?').get(competitor.id);
    expect(before).toBeUndefined();

    const { POST } = await import('@/app/api/ai/draft-summary/route');
    const res = await POST(draftRequest({ competitorId: competitor.id }));
    const { child } = lastSpawnCall();
    const readPromise = readSSE(res);
    child.stdout.emit('data', Buffer.from('임시 응답'));
    child.emit('close', 0);
    await readPromise;

    const after = db.prepare('SELECT * FROM summaries WHERE competitor_id = ?').get(competitor.id);
    expect(after).toBeUndefined();
  });

  it('US9: 동일 competitorId로 두 번 연속 POST하면 매 요청마다 spawn이 새로 호출되고 두 번째 요청에는 새로 추가된 자료가 반영된다', async () => {
    const competitor = await createCompetitor('연속요청경쟁사');
    await insertMaterial(competitor.id, { content: '첫번째자료', topic: '강점' });
    const { POST } = await import('@/app/api/ai/draft-summary/route');

    await POST(draftRequest({ competitorId: competitor.id }));
    expect(getSpawnCalls()).toHaveLength(1);

    await insertMaterial(competitor.id, { content: '두번째로추가된자료', topic: '차별화요소' });
    await POST(draftRequest({ competitorId: competitor.id }));

    expect(getSpawnCalls()).toHaveLength(2);
    const secondPrompt = promptOf(lastSpawnCall());
    expect(secondPrompt).toContain('두번째로추가된자료');
  });

  it('IMPL-1: 유효한 요청의 응답 헤더는 Content-Type: text/event-stream, Cache-Control: no-cache이다', async () => {
    const competitor = await createCompetitor('헤더경쟁사');
    await insertMaterial(competitor.id, { content: '내용', topic: '강점' });
    const { POST } = await import('@/app/api/ai/draft-summary/route');

    const res = await POST(draftRequest({ competitorId: competitor.id }));

    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });
});
