import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { fakeSpawn, resetSpawnStub, lastSpawnCall } from './helpers/spawn-stub';
import { readSSE, joinMessageData } from './helpers/sse';
import type { Competitor, CollectedMaterial } from '@/types';

vi.mock('child_process', () => ({ spawn: (...args: Parameters<typeof fakeSpawn>) => fakeSpawn(...args) }));

beforeEach(() => {
  setupTestDb();
  vi.resetModules();
  resetSpawnStub();
});

afterEach(async () => {
  await teardownTestDb();
});

async function createCompetitor(name = '테스트경쟁사'): Promise<Competitor> {
  const { POST } = await import('@/app/api/competitors/route');
  const res = await POST(
    new Request('http://localhost/api/competitors', { method: 'POST', body: JSON.stringify({ name }) }),
  );
  return (await res.json()) as Competitor;
}

function materialsParams(competitorId: number) {
  return { params: Promise.resolve({ id: String(competitorId) }) };
}

function materialParams(materialId: number) {
  return { params: Promise.resolve({ materialId: String(materialId) }) };
}

async function postMaterial(
  competitorId: number,
  body: Record<string, unknown>,
): Promise<{ status: number; body: CollectedMaterial | { error: string } }> {
  const { POST } = await import('@/app/api/competitors/[id]/materials/route');
  const res = await POST(
    new Request('http://localhost/api/competitors/x/materials', { method: 'POST', body: JSON.stringify(body) }),
    materialsParams(competitorId),
  );
  return { status: res.status, body: await res.json() };
}

async function getMaterials(competitorId: number, query?: Record<string, string>) {
  const { GET } = await import('@/app/api/competitors/[id]/materials/route');
  const url = new URL('http://localhost/api/competitors/x/materials');
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  const res = await GET(new Request(url), materialsParams(competitorId));
  return { status: res.status, body: await res.json() };
}

describe('jaryo-suchip: AI 자료 수집 라우트 (app/api/ai/collect-materials)', () => {
  it('AI-404: competitorId가 가리키는 경쟁사가 DB에 없으면 404와 안내 메시지를 반환한다', async () => {
    const { POST } = await import('@/app/api/ai/collect-materials/route');
    const res = await POST(
      new Request('http://localhost/api/ai/collect-materials', {
        method: 'POST',
        body: JSON.stringify({ competitorId: 999999 }),
      }),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: '경쟁사를 찾을 수 없습니다.' });
  });

  it('Impl-스트리밍전달: claude stdout에 들어온 여러 줄이 순서대로 data: 로 스트리밍된다', async () => {
    const competitor = await createCompetitor();
    const { POST } = await import('@/app/api/ai/collect-materials/route');
    const res = await POST(
      new Request('http://localhost/api/ai/collect-materials', {
        method: 'POST',
        body: JSON.stringify({ competitorId: competitor.id }),
      }),
    );

    const child = lastSpawnCall().child;
    child.stdout.emit('data', Buffer.from('첫째 줄\n둘째 줄\n셋째 줄'));
    child.emit('close', 0);

    const events = await readSSE(res);
    expect(events.every((e) => e.event === 'message')).toBe(true);
    expect(joinMessageData(events)).toBe('첫째 줄\n둘째 줄\n셋째 줄');
  });

  it('Impl-정상종료: claude가 code 0으로 종료되면 스트림에 에러 이벤트가 없다', async () => {
    const competitor = await createCompetitor();
    const { POST } = await import('@/app/api/ai/collect-materials/route');
    const res = await POST(
      new Request('http://localhost/api/ai/collect-materials', {
        method: 'POST',
        body: JSON.stringify({ competitorId: competitor.id }),
      }),
    );

    const child = lastSpawnCall().child;
    child.stdout.emit('data', Buffer.from('{"materials":[]}'));
    child.emit('close', 0);

    const events = await readSSE(res);
    expect(events.some((e) => e.event === 'error')).toBe(false);
  });

  it('Impl-비정상종료: claude가 stderr를 출력하고 code 1로 종료되면 에러 이벤트에 그 내용이 담긴다', async () => {
    const competitor = await createCompetitor();
    const { POST } = await import('@/app/api/ai/collect-materials/route');
    const res = await POST(
      new Request('http://localhost/api/ai/collect-materials', {
        method: 'POST',
        body: JSON.stringify({ competitorId: competitor.id }),
      }),
    );

    const child = lastSpawnCall().child;
    child.stderr.emit('data', Buffer.from('네트워크 오류로 실패했습니다'));
    child.emit('close', 1);

    const events = await readSSE(res);
    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.data).toContain('네트워크 오류로 실패했습니다');
  });

  it('Impl-ENOENT: spawn이 ENOENT 에러를 emit하면 claude CLI를 찾을 수 없다는 메시지가 전달된다', async () => {
    const competitor = await createCompetitor();
    const { POST } = await import('@/app/api/ai/collect-materials/route');
    const res = await POST(
      new Request('http://localhost/api/ai/collect-materials', {
        method: 'POST',
        body: JSON.stringify({ competitorId: competitor.id }),
      }),
    );

    const child = lastSpawnCall().child;
    child.emit('error', Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }));

    const events = await readSSE(res);
    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.data).toContain('claude CLI를 찾을 수 없습니다');
  });

  it('Impl-stdin종료: POST 처리 중 spawn된 child의 stdin.end()가 호출된다', async () => {
    const competitor = await createCompetitor();
    const { POST } = await import('@/app/api/ai/collect-materials/route');
    await POST(
      new Request('http://localhost/api/ai/collect-materials', {
        method: 'POST',
        body: JSON.stringify({ competitorId: competitor.id }),
      }),
    );

    const child = lastSpawnCall().child;
    expect(child.stdin.end).toHaveBeenCalled();
  });

  it('US-13: 요청이 abort되면 spawn된 child에 kill()이 호출된다', async () => {
    const competitor = await createCompetitor();
    const { POST } = await import('@/app/api/ai/collect-materials/route');
    const controller = new AbortController();
    const req = new Request('http://localhost/api/ai/collect-materials', {
      method: 'POST',
      body: JSON.stringify({ competitorId: competitor.id }),
      signal: controller.signal,
    });

    await POST(req);
    const child = lastSpawnCall().child;
    expect(child.kill).not.toHaveBeenCalled();

    controller.abort();
    expect(child.kill).toHaveBeenCalled();
  });

  it('US-14/Out-of-Scope-자동저장없음: claude가 유효한 JSON을 출력하고 code 0으로 종료해도 자동 저장되지 않는다', async () => {
    const competitor = await createCompetitor();
    const { POST } = await import('@/app/api/ai/collect-materials/route');
    const res = await POST(
      new Request('http://localhost/api/ai/collect-materials', {
        method: 'POST',
        body: JSON.stringify({ competitorId: competitor.id }),
      }),
    );

    const child = lastSpawnCall().child;
    const validJson = JSON.stringify({
      materials: [{ content: '요지', source_name: '출처', source_url: 'https://example.com', topic: 'SKU수' }],
      gaps: [],
    });
    child.stdout.emit('data', Buffer.from(validJson));
    child.emit('close', 0);
    await readSSE(res);

    const { getDB } = await import('@/lib/db');
    const db = getDB();
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM collected_materials').get() as { c: number };
    expect(c).toBe(0);
  });

  it('Impl-웹검색허용: spawn 인자에 -p 프롬프트와 웹 검색을 허용하는 플래그가 포함된다', async () => {
    const competitor = await createCompetitor();
    const { POST } = await import('@/app/api/ai/collect-materials/route');
    await POST(
      new Request('http://localhost/api/ai/collect-materials', {
        method: 'POST',
        body: JSON.stringify({ competitorId: competitor.id }),
      }),
    );

    const call = lastSpawnCall();
    expect(call.args).toContain('-p');
    expect(call.args).toContain('--allowedTools');
    expect(call.args).toContain('WebSearch,WebFetch');
  });

  it('Impl-재실행허용: 이미 자료가 있는 경쟁사에도 AI 수집 요청이 차단되지 않는다', async () => {
    const competitor = await createCompetitor();
    const { status } = await postMaterial(competitor.id, { content: '기존 자료', source_type: '웹검색' });
    expect(status).toBe(201);

    const { POST } = await import('@/app/api/ai/collect-materials/route');
    const res = await POST(
      new Request('http://localhost/api/ai/collect-materials', {
        method: 'POST',
        body: JSON.stringify({ competitorId: competitor.id }),
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
  });
});

describe('jaryo-suchip: POST /api/competitors/[id]/materials', () => {
  it('US-7/8/9/API계약-POST자료추가: content와 유효한 source_type, topic으로 POST하면 201과 생성된 자료를 반환한다', async () => {
    const competitor = await createCompetitor();
    const { status, body } = await postMaterial(competitor.id, {
      content: '내용',
      source_type: '직접입력',
      topic: '강점',
    });

    expect(status).toBe(201);
    const material = body as CollectedMaterial;
    expect(material.content).toBe('내용');
    expect(material.source_type).toBe('직접입력');
    expect(material.topic).toBe('강점');
    expect(material.competitor_id).toBe(competitor.id);
  });

  it('API계약-POST자료추가: topic을 생략해도 201로 생성되고 topic은 null이다', async () => {
    const competitor = await createCompetitor();
    const { status, body } = await postMaterial(competitor.id, { content: '내용', source_type: '웹검색' });

    expect(status).toBe(201);
    expect((body as CollectedMaterial).topic).toBeNull();
  });

  it('API계약-POST자료추가: content가 없으면 400을 반환한다', async () => {
    const competitor = await createCompetitor();
    const { status } = await postMaterial(competitor.id, { source_type: '웹검색' });
    expect(status).toBe(400);
  });

  it('API계약-POST자료추가: source_type이 올바르지 않으면 400을 반환한다', async () => {
    const competitor = await createCompetitor();
    const { status } = await postMaterial(competitor.id, { content: '내용', source_type: '없는출처' });
    expect(status).toBe(400);
  });

  it('API계약-POST자료추가: topic이 올바르지 않으면 400을 반환한다', async () => {
    const competitor = await createCompetitor();
    const { status } = await postMaterial(competitor.id, {
      content: '내용',
      source_type: '웹검색',
      topic: '없는항목',
    });
    expect(status).toBe(400);
  });

  it('US-6/Impl-재실행/Out-of-Scope-중복: 같은 내용을 두 번 POST해도 중복 제거나 덮어쓰기 없이 둘 다 남는다', async () => {
    const competitor = await createCompetitor();
    const body = { content: '동일한 내용', source_type: '웹검색' };
    await postMaterial(competitor.id, body);
    await postMaterial(competitor.id, body);

    const { status, body: list } = await getMaterials(competitor.id);
    expect(status).toBe(200);
    const rows = list as CollectedMaterial[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.content === '동일한 내용')).toBe(true);
  });

  it('US-15/Impl-상태연동: 자료가 0건이던 경쟁사에 POST하면 상태가 자료수집됨으로 바뀐다', async () => {
    const competitor = await createCompetitor();
    expect(competitor.status).toBe('조사중');

    await postMaterial(competitor.id, { content: '자료', source_type: '웹검색' });

    const { GET } = await import('@/app/api/competitors/[id]/route');
    const res = await GET(new Request('http://localhost/api/competitors/x'), materialsParams(competitor.id));
    const updated = (await res.json()) as Competitor;
    expect(updated.status).toBe('자료수집됨');
  });

  it('US-15/Impl-상태연동: 이미 자료가 있는 경쟁사에 추가 POST해도 상태는 더 바뀌지 않는다', async () => {
    const competitor = await createCompetitor();
    await postMaterial(competitor.id, { content: '자료1', source_type: '웹검색' });
    await postMaterial(competitor.id, { content: '자료2', source_type: '직접입력' });

    const { GET } = await import('@/app/api/competitors/[id]/route');
    const res = await GET(new Request('http://localhost/api/competitors/x'), materialsParams(competitor.id));
    const updated = (await res.json()) as Competitor;
    expect(updated.status).toBe('자료수집됨');
  });

  it('US-15/Impl-상태연동: 이미 더 앞선 상태(정리완료)였다면 추가 POST에도 상태가 유지된다', async () => {
    const competitor = await createCompetitor();
    const { PATCH } = await import('@/app/api/competitors/[id]/route');
    await PATCH(
      new Request('http://localhost/api/competitors/x', { method: 'PATCH', body: JSON.stringify({ status: '정리완료' }) }),
      materialsParams(competitor.id),
    );

    await postMaterial(competitor.id, { content: '자료', source_type: '웹검색' });

    const { GET } = await import('@/app/api/competitors/[id]/route');
    const res = await GET(new Request('http://localhost/api/competitors/x'), materialsParams(competitor.id));
    const updated = (await res.json()) as Competitor;
    expect(updated.status).toBe('정리완료');
  });
});

describe('jaryo-suchip: PATCH/DELETE /api/materials/[materialId]', () => {
  it('US-10/API계약-PATCH: 허용된 필드만 갱신되고 source_type을 같이 보내도 그대로 유지된다', async () => {
    const competitor = await createCompetitor();
    const { body: created } = await postMaterial(competitor.id, {
      content: '원본',
      source_type: '웹검색',
      topic: '강점',
    });
    const materialId = (created as CollectedMaterial).id;

    const { PATCH } = await import('@/app/api/materials/[materialId]/route');
    const res = await PATCH(
      new Request('http://localhost/api/materials/x', {
        method: 'PATCH',
        body: JSON.stringify({
          content: '수정됨',
          source_name: '출처이름',
          source_url: 'https://example.com',
          topic: '가격책정',
          source_type: '지인회의',
        }),
      }),
      materialParams(materialId),
    );

    expect(res.status).toBe(200);
    const updated = (await res.json()) as CollectedMaterial;
    expect(updated.content).toBe('수정됨');
    expect(updated.source_name).toBe('출처이름');
    expect(updated.source_url).toBe('https://example.com');
    expect(updated.topic).toBe('가격책정');
    expect(updated.source_type).toBe('웹검색');
  });

  it('US-10/API계약-PATCH: 존재하지 않는 materialId는 404를 반환한다', async () => {
    const { PATCH } = await import('@/app/api/materials/[materialId]/route');
    const res = await PATCH(
      new Request('http://localhost/api/materials/x', { method: 'PATCH', body: JSON.stringify({ content: '수정' }) }),
      materialParams(999999),
    );
    expect(res.status).toBe(404);
  });

  it('US-10/API계약-PATCH: 허용 필드가 하나도 없으면 400을 반환한다', async () => {
    const competitor = await createCompetitor();
    const { body: created } = await postMaterial(competitor.id, { content: '원본', source_type: '웹검색' });
    const materialId = (created as CollectedMaterial).id;

    const { PATCH } = await import('@/app/api/materials/[materialId]/route');
    const res = await PATCH(
      new Request('http://localhost/api/materials/x', { method: 'PATCH', body: JSON.stringify({}) }),
      materialParams(materialId),
    );
    expect(res.status).toBe(400);
  });

  it('US-10-DELETE: 존재하는 materialId를 DELETE하면 204 후 GET 목록에서 사라진다', async () => {
    const competitor = await createCompetitor();
    const { body: created } = await postMaterial(competitor.id, { content: '지울 자료', source_type: '웹검색' });
    const materialId = (created as CollectedMaterial).id;

    const { DELETE } = await import('@/app/api/materials/[materialId]/route');
    const delRes = await DELETE(new Request('http://localhost/api/materials/x', { method: 'DELETE' }), materialParams(materialId));
    expect(delRes.status).toBe(204);

    const { status, body: list } = await getMaterials(competitor.id);
    expect(status).toBe(200);
    expect(list).toEqual([]);
  });

  it('US-10-DELETE: 존재하지 않는 materialId는 404를 반환한다', async () => {
    const { DELETE } = await import('@/app/api/materials/[materialId]/route');
    const res = await DELETE(new Request('http://localhost/api/materials/x', { method: 'DELETE' }), materialParams(999999));
    expect(res.status).toBe(404);
  });
});

describe('jaryo-suchip: GET /api/competitors/[id]/materials 필터·정렬', () => {
  it('US-11/API계약-GET필터정렬: source로 필터링되고 created_at DESC, id DESC로 정렬된다', async () => {
    const competitor = await createCompetitor();
    const m1 = ((await postMaterial(competitor.id, { content: '1', source_type: '웹검색', topic: '강점' })).body as CollectedMaterial);
    await postMaterial(competitor.id, { content: '2', source_type: '직접입력', topic: '강점' });
    const m3 = ((await postMaterial(competitor.id, { content: '3', source_type: '웹검색', topic: '가격책정' })).body as CollectedMaterial);

    const { status, body } = await getMaterials(competitor.id, { source: '웹검색' });
    expect(status).toBe(200);
    const rows = body as CollectedMaterial[];
    expect(rows.map((r) => r.id)).toEqual([m3.id, m1.id]);
  });

  it('US-11/API계약-GET필터정렬: topic으로 필터링되고 created_at DESC, id DESC로 정렬된다', async () => {
    const competitor = await createCompetitor();
    const m1 = ((await postMaterial(competitor.id, { content: '1', source_type: '웹검색', topic: '강점' })).body as CollectedMaterial);
    const m2 = ((await postMaterial(competitor.id, { content: '2', source_type: '직접입력', topic: '강점' })).body as CollectedMaterial);
    await postMaterial(competitor.id, { content: '3', source_type: '웹검색', topic: '가격책정' });

    const { status, body } = await getMaterials(competitor.id, { topic: '강점' });
    expect(status).toBe(200);
    const rows = body as CollectedMaterial[];
    expect(rows.map((r) => r.id)).toEqual([m2.id, m1.id]);
  });

  it('US-11/API계약-GET필터정렬: source 값이 잘못되면 400을 반환한다', async () => {
    const competitor = await createCompetitor();
    const { status } = await getMaterials(competitor.id, { source: '없는출처' });
    expect(status).toBe(400);
  });

  it('US-11/API계약-GET필터정렬: topic 값이 잘못되면 400을 반환한다', async () => {
    const competitor = await createCompetitor();
    const { status } = await getMaterials(competitor.id, { topic: '없는항목' });
    expect(status).toBe(400);
  });
});
