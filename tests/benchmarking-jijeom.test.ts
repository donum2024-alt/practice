import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers/db';

beforeEach(() => {
  setupTestDb();
  vi.resetModules();
});

afterEach(async () => {
  await teardownTestDb();
});

type JsonBody = Record<string, unknown>;

async function postCompetitor(body: JsonBody) {
  const { POST } = await import('@/app/api/competitors/route');
  const res = await POST(
    new Request('http://localhost/api/competitors', { method: 'POST', body: JSON.stringify(body) }),
  );
  return { status: res.status, body: await res.json() };
}

async function getCompetitor(id: number) {
  const { GET } = await import('@/app/api/competitors/[id]/route');
  const res = await GET(new Request(`http://localhost/api/competitors/${id}`), {
    params: Promise.resolve({ id: String(id) }),
  });
  return { status: res.status, body: await res.json() };
}

async function patchCompetitor(id: number, body: JsonBody) {
  const { PATCH } = await import('@/app/api/competitors/[id]/route');
  const res = await PATCH(
    new Request(`http://localhost/api/competitors/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: String(id) }) },
  );
  return { status: res.status, body: await res.json() };
}

async function postBenchmarkPoint(competitorId: number, body: JsonBody) {
  const { POST } = await import('@/app/api/competitors/[id]/benchmark-points/route');
  const res = await POST(
    new Request(`http://localhost/api/competitors/${competitorId}/benchmark-points`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(competitorId) }) },
  );
  return { status: res.status, body: await res.json() };
}

async function getBenchmarkPointsByCompetitor(competitorId: number) {
  const { GET } = await import('@/app/api/competitors/[id]/benchmark-points/route');
  const res = await GET(new Request(`http://localhost/api/competitors/${competitorId}/benchmark-points`), {
    params: Promise.resolve({ id: String(competitorId) }),
  });
  return { status: res.status, body: await res.json() };
}

async function patchBenchmarkPoint(pointId: number, body: JsonBody) {
  const { PATCH } = await import('@/app/api/benchmark-points/[pointId]/route');
  const res = await PATCH(
    new Request(`http://localhost/api/benchmark-points/${pointId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ pointId: String(pointId) }) },
  );
  return { status: res.status, body: await res.json() };
}

async function deleteBenchmarkPoint(pointId: number) {
  const { DELETE } = await import('@/app/api/benchmark-points/[pointId]/route');
  const res = await DELETE(new Request(`http://localhost/api/benchmark-points/${pointId}`, { method: 'DELETE' }), {
    params: Promise.resolve({ pointId: String(pointId) }),
  });
  return { status: res.status };
}

async function getAllBenchmarkPoints(query?: string) {
  const { GET } = await import('@/app/api/benchmark-points/route');
  const url = query ? `http://localhost/api/benchmark-points?${query}` : 'http://localhost/api/benchmark-points';
  const res = await GET(new Request(url));
  return { status: res.status, body: await res.json() };
}

describe('benchmarking-jijeom: 벤치마킹 지점 CRUD + 상태 + 경쟁사 상태 사이드이펙트', () => {
  it('US-1/API-POST-ok: 유효한 입력으로 등록하면 201과 함께 입력값이 그대로 저장되고 reflection_status 기본값은 검토중이다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;

    const { status, body } = await postBenchmarkPoint(competitor.id, {
      source_item: 'SKU수',
      description: '다품종 소량 운영',
      rationale: '재고 효율 개선',
    });

    expect(status).toBe(201);
    expect(body.competitor_id).toBe(competitor.id);
    expect(body.source_item).toBe('SKU수');
    expect(body.description).toBe('다품종 소량 운영');
    expect(body.rationale).toBe('재고 효율 개선');
    expect(body.reflection_status).toBe('검토중');
  });

  it('US-2/source_item-invalid: source_item이 5개 값에 없으면 400이다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;

    const invalid = await postBenchmarkPoint(competitor.id, {
      source_item: '기타',
      description: '설명',
    });
    expect(invalid.status).toBe(400);

    const missing = await postBenchmarkPoint(competitor.id, {
      description: '설명',
    });
    expect(missing.status).toBe(400);
  });

  it('US-3/description-required: description이 빈 문자열이거나 공백만이면 400이다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;

    const empty = await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '' });
    expect(empty.status).toBe(400);

    const blank = await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '   ' });
    expect(blank.status).toBe(400);
  });

  it('US-3/rationale-optional: rationale을 생략하면 201 응답에서 rationale이 null이다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;

    const { status, body } = await postBenchmarkPoint(competitor.id, {
      source_item: 'SKU수',
      description: '다품종 소량 운영',
    });

    expect(status).toBe(201);
    expect(body.rationale).toBeNull();
  });

  it('US-4/multiple-points: 같은 경쟁사에 두 번 등록하면 두 레코드 모두 저장되고 목록에 둘 다 나타난다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;

    const first = await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '설명1' });
    const second = await postBenchmarkPoint(competitor.id, { source_item: '물류운영', description: '설명2' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const list = await getBenchmarkPointsByCompetitor(competitor.id);
    expect(list.body).toHaveLength(2);
    const ids = list.body.map((p: { id: number }) => p.id);
    expect(ids).toContain(first.body.id);
    expect(ids).toContain(second.body.id);
  });

  it('US-5/GET-by-competitor-order: 한 경쟁사의 benchmark point 목록은 created_at DESC, id DESC 순서다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;

    const p1 = (await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '설명1' })).body;
    const p2 = (await postBenchmarkPoint(competitor.id, { source_item: '물류운영', description: '설명2' })).body;
    const p3 = (await postBenchmarkPoint(competitor.id, { source_item: '가격책정', description: '설명3' })).body;

    const { getDB } = await import('@/lib/db');
    const db = getDB();
    db.prepare('UPDATE benchmark_points SET created_at = ? WHERE id = ?').run('2024-01-01 00:00:00', p1.id);
    db.prepare('UPDATE benchmark_points SET created_at = ? WHERE id = ?').run('2024-01-02 00:00:00', p2.id);
    db.prepare('UPDATE benchmark_points SET created_at = ? WHERE id = ?').run('2024-01-03 00:00:00', p3.id);

    const list = await getBenchmarkPointsByCompetitor(competitor.id);
    expect(list.body.map((p: { id: number }) => p.id)).toEqual([p3.id, p2.id, p1.id]);
  });

  it('US-6/PATCH-fields: 일부 필드만 PATCH하면 해당 필드만 갱신되고 나머지는 그대로다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;
    const created = (
      await postBenchmarkPoint(competitor.id, {
        source_item: 'SKU수',
        description: '초기 설명',
        rationale: '초기 근거',
      })
    ).body;

    const { status, body } = await patchBenchmarkPoint(created.id, { description: '수정된 설명' });

    expect(status).toBe(200);
    expect(body.description).toBe('수정된 설명');
    expect(body.source_item).toBe('SKU수');
    expect(body.rationale).toBe('초기 근거');
  });

  it('US-7/DELETE-204: 존재하는 pointId를 삭제하면 204이고 이후 GET 목록에서 찾을 수 없다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;
    const created = (await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '설명' })).body;

    const del = await deleteBenchmarkPoint(created.id);
    expect(del.status).toBe(204);

    const list = await getBenchmarkPointsByCompetitor(competitor.id);
    expect(list.body.map((p: { id: number }) => p.id)).not.toContain(created.id);
  });

  it('Out-of-Scope/delete-cascade-strategy_steps: benchmark point를 삭제하면 연관된 strategy_steps도 즉시 모두 삭제된다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;
    const created = (await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '설명' })).body;

    const { getDB } = await import('@/lib/db');
    const db = getDB();
    db.prepare('INSERT INTO strategy_steps (benchmark_point_id, step_order, description) VALUES (?, ?, ?)').run(
      created.id,
      1,
      '1단계',
    );
    db.prepare('INSERT INTO strategy_steps (benchmark_point_id, step_order, description) VALUES (?, ?, ?)').run(
      created.id,
      2,
      '2단계',
    );

    const del = await deleteBenchmarkPoint(created.id);
    expect(del.status).toBe(204);

    const remainingPoint = db.prepare('SELECT * FROM benchmark_points WHERE id = ?').get(created.id);
    const remainingSteps = db
      .prepare('SELECT * FROM strategy_steps WHERE benchmark_point_id = ?')
      .all(created.id);

    expect(remainingPoint).toBeUndefined();
    expect(remainingSteps).toHaveLength(0);
  });

  it('US-8/reflection_status-update: reflection_status를 PATCH하면 갱신된 레코드가 반환된다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;
    const created = (await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '설명' })).body;

    const { status, body } = await patchBenchmarkPoint(created.id, { reflection_status: '전략수립됨' });

    expect(status).toBe(200);
    expect(body.reflection_status).toBe('전략수립됨');
  });

  it('US-8/reflection_status-invalid: reflection_status가 4개 값 외의 문자열이면 400이다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;
    const created = (await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '설명' })).body;

    const { status } = await patchBenchmarkPoint(created.id, { reflection_status: '완료' });

    expect(status).toBe(400);
  });

  it('US-9/status-free-transition: 검토중→보류, 전략수립됨→검토중 전이가 중간 단계 없이 모두 성공한다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;
    const created = (await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '설명' })).body;
    expect(created.reflection_status).toBe('검토중');

    const toBoryu = await patchBenchmarkPoint(created.id, { reflection_status: '보류' });
    expect(toBoryu.status).toBe(200);
    expect(toBoryu.body.reflection_status).toBe('보류');

    const toStrategy = await patchBenchmarkPoint(created.id, { reflection_status: '전략수립됨' });
    expect(toStrategy.status).toBe(200);
    expect(toStrategy.body.reflection_status).toBe('전략수립됨');

    const backToReview = await patchBenchmarkPoint(created.id, { reflection_status: '검토중' });
    expect(backToReview.status).toBe(200);
    expect(backToReview.body.reflection_status).toBe('검토중');
  });

  it('US-10/result_note-free-text: result_note를 PATCH하면 그대로 저장되어 응답에 포함된다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;
    const created = (await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '설명' })).body;

    const { status, body } = await patchBenchmarkPoint(created.id, {
      result_note: '2024-06 적용, 재고 15% 감소',
    });

    expect(status).toBe(200);
    expect(body.result_note).toBe('2024-06 적용, 재고 15% 감소');
  });

  it('API-contract/updated_at-always-bumped: 허용 필드 하나만 바꿔도 updated_at이 기존 값보다 이후 시각으로 갱신된다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;
    const created = (await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '설명' })).body;

    const { getDB } = await import('@/lib/db');
    const db = getDB();
    db.prepare('UPDATE benchmark_points SET updated_at = ? WHERE id = ?').run('2000-01-01 00:00:00', created.id);

    const { status, body } = await patchBenchmarkPoint(created.id, { description: '수정된 설명' });

    expect(status).toBe(200);
    expect(body.updated_at > '2000-01-01 00:00:00').toBe(true);
  });

  it('US-11/auto-advance-on-first-point: 벤치마킹도출 이전 상태의 경쟁사에 첫 benchmark point를 등록하면 상태가 벤치마킹도출로 바뀐다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;
    const prepared = await patchCompetitor(competitor.id, { status: '정리완료' });
    expect(prepared.body.status).toBe('정리완료');

    const created = await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '설명' });
    expect(created.status).toBe(201);

    const after = await getCompetitor(competitor.id);
    expect(after.body.status).toBe('벤치마킹도출');
  });

  it('US-11/no-regress-on-second-point: 이미 1개가 있고 상태가 벤치마킹도출인 상태에서 추가 등록해도 상태가 그대로 유지된다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;
    await patchCompetitor(competitor.id, { status: '정리완료' });

    const firstPoint = await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '설명1' });
    expect(firstPoint.status).toBe(201);

    const afterFirst = await getCompetitor(competitor.id);
    expect(afterFirst.body.status).toBe('벤치마킹도출');

    const secondPoint = await postBenchmarkPoint(competitor.id, { source_item: '물류운영', description: '설명2' });
    expect(secondPoint.status).toBe(201);

    const afterSecond = await getCompetitor(competitor.id);
    expect(afterSecond.body.status).toBe('벤치마킹도출');
  });

  it('US-12/US-13/GET-all-with-competitor_name: 전체 목록은 competitor_name을 포함하고 updated_at DESC, id DESC 순서다', async () => {
    const competitorA = (await postCompetitor({ name: '경쟁사A' })).body;
    const competitorB = (await postCompetitor({ name: '경쟁사B' })).body;

    const p1 = (await postBenchmarkPoint(competitorA.id, { source_item: 'SKU수', description: '설명1' })).body;
    const p2 = (await postBenchmarkPoint(competitorB.id, { source_item: '물류운영', description: '설명2' })).body;
    const p3 = (await postBenchmarkPoint(competitorA.id, { source_item: '가격책정', description: '설명3' })).body;

    const { getDB } = await import('@/lib/db');
    const db = getDB();
    db.prepare('UPDATE benchmark_points SET updated_at = ? WHERE id = ?').run('2024-01-01 00:00:00', p1.id);
    db.prepare('UPDATE benchmark_points SET updated_at = ? WHERE id = ?').run('2024-01-02 00:00:00', p2.id);
    db.prepare('UPDATE benchmark_points SET updated_at = ? WHERE id = ?').run('2024-01-03 00:00:00', p3.id);

    const { status, body } = await getAllBenchmarkPoints();

    expect(status).toBe(200);
    expect(body.map((p: { id: number }) => p.id)).toEqual([p3.id, p2.id, p1.id]);
    const byId = new Map(body.map((p: { id: number; competitor_name: string }) => [p.id, p.competitor_name]));
    expect(byId.get(p1.id)).toBe('경쟁사A');
    expect(byId.get(p2.id)).toBe('경쟁사B');
    expect(byId.get(p3.id)).toBe('경쟁사A');
  });

  it('US-13/GET-status-filter: ?status=전략수립됨이면 응답에 해당 상태만 포함된다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;

    const p1 = (await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '설명1' })).body;
    const p2 = (await postBenchmarkPoint(competitor.id, { source_item: '물류운영', description: '설명2' })).body;
    const p3 = (await postBenchmarkPoint(competitor.id, { source_item: '가격책정', description: '설명3' })).body;

    await patchBenchmarkPoint(p1.id, { reflection_status: '전략수립됨' });
    await patchBenchmarkPoint(p2.id, { reflection_status: '보류' });
    await patchBenchmarkPoint(p3.id, { reflection_status: '전략수립됨' });

    const { status, body } = await getAllBenchmarkPoints('status=전략수립됨');

    expect(status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body.map((p: { id: number }) => p.id).sort()).toEqual([p1.id, p3.id].sort());
    for (const point of body) {
      expect(point.reflection_status).toBe('전략수립됨');
    }
  });

  it('US-16/timestamps-present: 등록 직후 created_at이 유지되고 PATCH 이후 updated_at이 응답에 포함된다', async () => {
    const competitor = (await postCompetitor({ name: '경쟁사A' })).body;
    const created = (await postBenchmarkPoint(competitor.id, { source_item: 'SKU수', description: '설명' })).body;

    expect(typeof created.created_at).toBe('string');
    expect(created.created_at.length).toBeGreaterThan(0);
    expect(typeof created.updated_at).toBe('string');
    expect(created.updated_at.length).toBeGreaterThan(0);

    const patched = await patchBenchmarkPoint(created.id, { description: '수정된 설명' });

    expect(patched.status).toBe(200);
    expect(patched.body.created_at).toBe(created.created_at);
    expect(typeof patched.body.updated_at).toBe('string');
    expect(patched.body.updated_at.length).toBeGreaterThan(0);
  });
});
