import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { fakeSpawn, resetSpawnStub, lastSpawnCall } from './helpers/spawn-stub';
import { readSSE } from './helpers/sse';

vi.mock('child_process', () => ({ spawn: (...args: Parameters<typeof fakeSpawn>) => fakeSpawn(...args) }));

beforeEach(() => {
  setupTestDb();
  vi.resetModules();
  resetSpawnStub();
});

afterEach(async () => {
  await teardownTestDb();
});

type Json = Record<string, any>;

async function createCompetitor(name: string): Promise<Json> {
  const { POST } = await import('@/app/api/competitors/route');
  const res = await POST(
    new Request('http://localhost/api/competitors', { method: 'POST', body: JSON.stringify({ name }) }),
  );
  expect(res.status).toBe(201);
  return res.json();
}

async function createBenchmarkPoint(competitorId: number, body: Json = {}): Promise<Json> {
  const { POST } = await import('@/app/api/competitors/[id]/benchmark-points/route');
  const res = await POST(
    new Request(`http://localhost/api/competitors/${competitorId}/benchmark-points`, {
      method: 'POST',
      body: JSON.stringify({ source_item: 'SKU수', description: '지점 설명', ...body }),
    }),
    { params: Promise.resolve({ id: String(competitorId) }) },
  );
  expect(res.status).toBe(201);
  return res.json();
}

async function postStep(pointId: number, body: unknown): Promise<Response> {
  const { POST } = await import('@/app/api/benchmark-points/[pointId]/steps/route');
  return POST(
    new Request(`http://localhost/api/benchmark-points/${pointId}/steps`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ pointId: String(pointId) }) },
  );
}

async function getSteps(pointId: number | string): Promise<Response> {
  const { GET } = await import('@/app/api/benchmark-points/[pointId]/steps/route');
  return GET(new Request(`http://localhost/api/benchmark-points/${pointId}/steps`), {
    params: Promise.resolve({ pointId: String(pointId) }),
  });
}

async function patchStep(stepId: number, body: unknown): Promise<Response> {
  const { PATCH } = await import('@/app/api/strategy-steps/[stepId]/route');
  return PATCH(
    new Request(`http://localhost/api/strategy-steps/${stepId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ stepId: String(stepId) }) },
  );
}

async function deleteStep(stepId: number): Promise<Response> {
  const { DELETE } = await import('@/app/api/strategy-steps/[stepId]/route');
  return DELETE(new Request(`http://localhost/api/strategy-steps/${stepId}`, { method: 'DELETE' }), {
    params: Promise.resolve({ stepId: String(stepId) }),
  });
}

async function postDraftStrategy(body: Json, signal?: AbortSignal): Promise<Response> {
  const { POST } = await import('@/app/api/ai/draft-strategy/route');
  return POST(
    new Request('http://localhost/api/ai/draft-strategy', {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    }),
  );
}

async function deleteCompetitor(id: number, force = false): Promise<Response> {
  const { DELETE } = await import('@/app/api/competitors/[id]/route');
  return DELETE(
    new Request(`http://localhost/api/competitors/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

async function deleteBenchmarkPoint(pointId: number): Promise<Response> {
  const { DELETE } = await import('@/app/api/benchmark-points/[pointId]/route');
  return DELETE(new Request(`http://localhost/api/benchmark-points/${pointId}`, { method: 'DELETE' }), {
    params: Promise.resolve({ pointId: String(pointId) }),
  });
}

async function insertMaterial(competitorId: number, content: string, topic: string): Promise<void> {
  const { getDB } = await import('@/lib/db');
  getDB()
    .prepare(
      `INSERT INTO collected_materials (competitor_id, content, source_type, topic) VALUES (?, ?, ?, ?)`,
    )
    .run(competitorId, content, '직접입력', topic);
}

async function readRawBody(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe('siljeon-jeonryak: 단계별 실행 전략 (CRUD + AI 초안 제안 + 캐스케이드 삭제)', () => {
  it('step-order-auto-first: 단계가 하나도 없는 지점에 POST하면 생성된 단계의 step_order가 1이다', async () => {
    const competitor = await createCompetitor('A사');
    const point = await createBenchmarkPoint(competitor.id);

    const res = await postStep(point.id, { description: '첫 단계' });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.step_order).toBe(1);
  });

  it('step-order-auto-increment: step_order 1,2가 이미 있는 지점에 POST하면 새 단계의 step_order가 3이다', async () => {
    const competitor = await createCompetitor('B사');
    const point = await createBenchmarkPoint(competitor.id);
    await postStep(point.id, { description: '단계1' });
    await postStep(point.id, { description: '단계2' });

    const res = await postStep(point.id, { description: '단계3' });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.step_order).toBe(3);
  });

  it('step-order-client-ignored: body에 step_order:999를 보내도 서버 계산값이 사용되고 999는 무시된다', async () => {
    const competitor = await createCompetitor('C사');
    const point = await createBenchmarkPoint(competitor.id);
    await postStep(point.id, { description: '단계1' });

    const res = await postStep(point.id, { description: '단계2', step_order: 999 });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.step_order).toBe(2);
    expect(body.step_order).not.toBe(999);
  });

  it('description-required: description이 빈 문자열이거나 누락이면 400이다', async () => {
    const competitor = await createCompetitor('D사');
    const point = await createBenchmarkPoint(competitor.id);

    const emptyRes = await postStep(point.id, { description: '' });
    expect(emptyRes.status).toBe(400);
    const emptyBody = await emptyRes.json();
    expect(emptyBody.error).toBeTruthy();

    const missingRes = await postStep(point.id, {});
    expect(missingRes.status).toBe(400);
    const missingBody = await missingRes.json();
    expect(missingBody.error).toBeTruthy();
  });

  it('steps-order-asc: step_order 1,2,3인 단계들을 GET하면 배열이 1,2,3 순서로 반환된다', async () => {
    const competitor = await createCompetitor('E사');
    const point = await createBenchmarkPoint(competitor.id);
    await postStep(point.id, { description: '단계1' });
    await postStep(point.id, { description: '단계2' });
    await postStep(point.id, { description: '단계3' });

    const res = await getSteps(point.id);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.map((s: Json) => s.step_order)).toEqual([1, 2, 3]);
  });

  it('point-not-found-404: 존재하지 않는 pointId로 GET/POST하면 404다', async () => {
    const getRes = await getSteps(999999);
    expect(getRes.status).toBe(404);
    const getBody = await getRes.json();
    expect(getBody.error).toBeTruthy();

    const postRes = await postStep(999999, { description: '단계' });
    expect(postRes.status).toBe(404);
    const postBody = await postRes.json();
    expect(postBody.error).toBeTruthy();
  });

  it('patch-description-update: description을 PATCH하면 200과 함께 description이 변경된다', async () => {
    const competitor = await createCompetitor('F사');
    const point = await createBenchmarkPoint(competitor.id);
    const created = await (await postStep(point.id, { description: '원래 설명' })).json();

    const res = await patchStep(created.id, { description: '새 설명' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.description).toBe('새 설명');
  });

  it('patch-description-empty-400: description을 빈 문자열로 PATCH하면 400이다', async () => {
    const competitor = await createCompetitor('G사');
    const point = await createBenchmarkPoint(competitor.id);
    const created = await (await postStep(point.id, { description: '원래 설명' })).json();

    const res = await patchStep(created.id, { description: '' });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('patch-direction-swap: order 2인 단계를 up하면 order 1,2가 맞교환되고 order 3은 그대로다', async () => {
    const competitor = await createCompetitor('H사');
    const point = await createBenchmarkPoint(competitor.id);
    const s1 = await (await postStep(point.id, { description: '단계1' })).json();
    const s2 = await (await postStep(point.id, { description: '단계2' })).json();
    const s3 = await (await postStep(point.id, { description: '단계3' })).json();

    const res = await patchStep(s2.id, { direction: 'up' });
    expect(res.status).toBe(200);
    const patchedS2 = await res.json();

    expect(patchedS2.step_order).toBe(1);

    const stepsRes = await getSteps(point.id);
    const steps = await stepsRes.json();
    const byId = new Map(steps.map((s: Json) => [s.id, s.step_order]));

    expect(byId.get(s2.id)).toBe(1);
    expect(byId.get(s1.id)).toBe(2);
    expect(byId.get(s3.id)).toBe(3);
  });

  it('patch-direction-no-neighbor-400: order 1인 단계를 up하면 이동할 단계가 없어 400이다', async () => {
    const competitor = await createCompetitor('I사');
    const point = await createBenchmarkPoint(competitor.id);
    const s1 = await (await postStep(point.id, { description: '단계1' })).json();

    const res = await patchStep(s1.id, { direction: 'up' });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('patch-direction-invalid-400: direction이 left이면 400이다', async () => {
    const competitor = await createCompetitor('J사');
    const point = await createBenchmarkPoint(competitor.id);
    const s1 = await (await postStep(point.id, { description: '단계1' })).json();

    const res = await patchStep(s1.id, { direction: 'left' });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('patch-empty-body-400: body가 {}이면 400이다', async () => {
    const competitor = await createCompetitor('K사');
    const point = await createBenchmarkPoint(competitor.id);
    const s1 = await (await postStep(point.id, { description: '단계1' })).json();

    const res = await patchStep(s1.id, {});

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('step-not-found-404: 존재하지 않는 stepId로 PATCH/DELETE하면 404다', async () => {
    const patchRes = await patchStep(999999, { description: '설명' });
    expect(patchRes.status).toBe(404);
    const patchBody = await patchRes.json();
    expect(patchBody.error).toBeTruthy();

    const deleteRes = await deleteStep(999999);
    expect(deleteRes.status).toBe(404);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.error).toBeTruthy();
  });

  it('delete-renumber: order 2인 단계를 삭제하면 남은 단계들이 1,2,3으로 빈 번호 없이 재정렬된다', async () => {
    const competitor = await createCompetitor('L사');
    const point = await createBenchmarkPoint(competitor.id);
    const s1 = await (await postStep(point.id, { description: '단계1' })).json();
    const s2 = await (await postStep(point.id, { description: '단계2' })).json();
    const s3 = await (await postStep(point.id, { description: '단계3' })).json();
    const s4 = await (await postStep(point.id, { description: '단계4' })).json();

    const res = await deleteStep(s2.id);
    expect(res.status).toBe(204);

    const stepsRes = await getSteps(point.id);
    const steps = await stepsRes.json();

    expect(steps.map((s: Json) => s.step_order)).toEqual([1, 2, 3]);
    const byId = new Map(steps.map((s: Json) => [s.id, s.step_order]));
    expect(byId.get(s1.id)).toBe(1);
    expect(byId.get(s3.id)).toBe(2);
    expect(byId.get(s4.id)).toBe(3);
    expect(byId.has(s2.id)).toBe(false);
  });

  it('draft-point-not-found-404: benchmarkPointId가 없거나 존재하지 않으면 404다', async () => {
    const missingRes = await postDraftStrategy({});
    expect(missingRes.status).toBe(404);
    const missingBody = await missingRes.json();
    expect(missingBody.error).toBeTruthy();

    const notFoundRes = await postDraftStrategy({ benchmarkPointId: 999999 });
    expect(notFoundRes.status).toBe(404);
    const notFoundBody = await notFoundRes.json();
    expect(notFoundBody.error).toBeTruthy();
  });

  it('draft-materials-filtered: point.source_item과 일치하는 topic의 자료 content만 prompt에 포함된다', async () => {
    const competitor = await createCompetitor('M사');
    const point = await createBenchmarkPoint(competitor.id, { source_item: '강점' });
    await insertMaterial(competitor.id, '일치자료내용', '강점');
    await insertMaterial(competitor.id, '불일치자료내용', '가격책정');

    await postDraftStrategy({ benchmarkPointId: point.id });

    const call = lastSpawnCall();
    const prompt = call.args[1];

    expect(prompt).toContain('일치자료내용');
    expect(prompt).not.toContain('불일치자료내용');
  });

  it('draft-sse-framing: stdout의 hello\\nworld가 각 줄 data: 프리픽스로 전달된다', async () => {
    const competitor = await createCompetitor('N사');
    const point = await createBenchmarkPoint(competitor.id);

    const res = await postDraftStrategy({ benchmarkPointId: point.id });
    const { child } = lastSpawnCall();

    child.stdout.emit('data', Buffer.from('hello\nworld'));
    child.emit('close', 0);

    const raw = await readRawBody(res);

    expect(raw).toContain('data: hello');
    expect(raw).toContain('data: world');
  });

  it('draft-abort-kills-child: 요청이 abort되면 child.kill()이 호출된다', async () => {
    const competitor = await createCompetitor('O사');
    const point = await createBenchmarkPoint(competitor.id);
    const controller = new AbortController();

    await postDraftStrategy({ benchmarkPointId: point.id }, controller.signal);
    const { child } = lastSpawnCall();

    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(child.kill).toHaveBeenCalled();
  });

  it("draft-enoent-error: spawn이 ENOENT 에러를 내면 'claude CLI를 찾을 수 없습니다' 메시지의 error 이벤트가 발생한다", async () => {
    const competitor = await createCompetitor('P사');
    const point = await createBenchmarkPoint(competitor.id);

    const res = await postDraftStrategy({ benchmarkPointId: point.id });
    const { child } = lastSpawnCall();

    const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
    child.emit('error', err);

    const events = await readSSE(res);
    const errorEvent = events.find((e) => e.event === 'error');

    expect(errorEvent).toBeDefined();
    expect(errorEvent!.data).toContain('claude CLI를 찾을 수 없습니다');
  });

  it("draft-nonzero-exit-error: 0이 아닌 종료 코드일 때 stderr 내용이 error 이벤트 data에 포함된다", async () => {
    const competitor = await createCompetitor('Q사');
    const point = await createBenchmarkPoint(competitor.id);

    const res = await postDraftStrategy({ benchmarkPointId: point.id });
    const { child } = lastSpawnCall();

    child.stderr.emit('data', Buffer.from('failure detail'));
    child.emit('close', 1);

    const events = await readSSE(res);
    const errorEvent = events.find((e) => e.event === 'error');

    expect(errorEvent).toBeDefined();
    expect(errorEvent!.data).toContain('failure detail');
  });

  it('draft-selected-save-order: B, A 순으로 저장을 호출하면 B가 1, A가 2가 된다', async () => {
    const competitor = await createCompetitor('R사');
    const point = await createBenchmarkPoint(competitor.id);

    const bRes = await postStep(point.id, { description: 'B안' });
    const bBody = await bRes.json();
    const aRes = await postStep(point.id, { description: 'A안' });
    const aBody = await aRes.json();

    expect(bBody.step_order).toBe(1);
    expect(aBody.step_order).toBe(2);
  });

  it('competitor-delete-cascade-counts-steps: 경쟁사 삭제 응답의 counts.strategy_steps에 손자 단계 수가 합산된다', async () => {
    const competitor = await createCompetitor('S사');
    const point1 = await createBenchmarkPoint(competitor.id);
    const point2 = await createBenchmarkPoint(competitor.id);
    await postStep(point1.id, { description: '단계1' });
    await postStep(point1.id, { description: '단계2' });
    await postStep(point2.id, { description: '단계1' });

    const res = await deleteCompetitor(competitor.id, false);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.counts.strategy_steps).toBe(3);
    expect(body.total).toBe(body.counts.strategy_steps + body.counts.benchmark_points);
  });

  it('competitor-delete-cascade-removes-steps: force=1로 삭제하면 strategy_steps, benchmark_points, competitor가 모두 제거된다', async () => {
    const competitor = await createCompetitor('T사');
    const point = await createBenchmarkPoint(competitor.id);
    const step = await (await postStep(point.id, { description: '단계1' })).json();

    const res = await deleteCompetitor(competitor.id, true);
    expect(res.status).toBe(204);

    const { getDB } = await import('@/lib/db');
    const db = getDB();

    expect(db.prepare('SELECT * FROM strategy_steps WHERE id = ?').get(step.id)).toBeUndefined();
    expect(db.prepare('SELECT * FROM benchmark_points WHERE id = ?').get(point.id)).toBeUndefined();
    expect(db.prepare('SELECT * FROM competitors WHERE id = ?').get(competitor.id)).toBeUndefined();
  });

  it('benchmark-point-delete-cascade-removes-steps: 지점을 삭제하면 해당 지점의 strategy_steps가 모두 삭제된다', async () => {
    const competitor = await createCompetitor('U사');
    const point = await createBenchmarkPoint(competitor.id);
    const s1 = await (await postStep(point.id, { description: '단계1' })).json();
    const s2 = await (await postStep(point.id, { description: '단계2' })).json();

    const res = await deleteBenchmarkPoint(point.id);
    expect(res.status).toBe(204);

    const { getDB } = await import('@/lib/db');
    const db = getDB();

    expect(db.prepare('SELECT * FROM strategy_steps WHERE id = ?').get(s1.id)).toBeUndefined();
    expect(db.prepare('SELECT * FROM strategy_steps WHERE id = ?').get(s2.id)).toBeUndefined();
    expect(db.prepare('SELECT * FROM strategy_steps WHERE benchmark_point_id = ?').all(point.id)).toEqual([]);
  });
});
