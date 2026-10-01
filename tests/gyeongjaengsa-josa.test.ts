import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers/db';
import { COMPETITOR_STATUSES, advanceStatus, isCompetitorStatus } from '@/types';

describe('gyeongjaengsa-josa: /api/competitors 라우트', () => {
  beforeEach(() => {
    setupTestDb();
    vi.resetModules();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it('POST-name-blank: 공백/trim 후 빈 이름은 400이며 레코드가 생성되지 않는다', async () => {
    const { GET, POST } = await import('@/app/api/competitors/route');

    const postRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: '   ' }),
      }),
    );
    expect(postRes.status).toBe(400);

    const getRes = await GET(new Request('http://localhost/api/competitors'));
    const body = await getRes.json();
    expect(body).toEqual([]);
  });

  it('POST-duplicate: 대소문자/공백만 다른 이름은 409이며 기존 레코드를 반환하고 새로 생성하지 않는다', async () => {
    const { GET, POST } = await import('@/app/api/competitors/route');

    const firstRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: 'ABC' }),
      }),
    );
    expect(firstRes.status).toBe(201);
    const first = await firstRes.json();

    const dupRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: 'abc ' }),
      }),
    );
    const dupBody = await dupRes.json();
    expect(dupRes.status).toBe(409);
    expect(dupBody.competitor).toEqual(first);

    const getRes = await GET(new Request('http://localhost/api/competitors'));
    const all = await getRes.json();
    expect(all).toHaveLength(1);
  });

  it('POST-optional-fields: homepage/note/mentioned_by_exec을 포함하면 201이며 값이 그대로 응답에 담긴다', async () => {
    const { POST } = await import('@/app/api/competitors/route');

    const res = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({
          name: '옵션포함경쟁사',
          homepage: 'https://example.com',
          note: '메모내용',
          mentioned_by_exec: true,
        }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.homepage).toBe('https://example.com');
    expect(body.note).toBe('메모내용');
    expect(typeof body.mentioned_by_exec).toBe('boolean');
    expect(body.mentioned_by_exec).toBe(true);
  });

  it('GET-status-filter: status 쿼리로 필터링하면 해당 status 레코드만 반환한다', async () => {
    const { GET, POST } = await import('@/app/api/competitors/route');
    const { PATCH } = await import('@/app/api/competitors/[id]/route');

    const aRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: 'A사' }),
      }),
    );
    const a = await aRes.json();
    const bRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: 'B사' }),
      }),
    );
    const b = await bRes.json();
    const cRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: 'C사' }),
      }),
    );
    const c = await cRes.json();

    await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: '자료수집됨' }) }),
      { params: Promise.resolve({ id: String(a.id) }) },
    );
    await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: '정리완료' }) }),
      { params: Promise.resolve({ id: String(b.id) }) },
    );
    // c는 기본값 '조사중' 유지

    const getRes = await GET(new Request('http://localhost/api/competitors?status=자료수집됨'));
    const filtered = await getRes.json();

    expect(getRes.status).toBe(200);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(a.id);
    expect(filtered[0].status).toBe('자료수집됨');
  });

  it('GET-status-invalid: 존재하지 않는 status 값은 400을 반환한다', async () => {
    const { GET } = await import('@/app/api/competitors/route');

    const res = await GET(new Request('http://localhost/api/competitors?status=없는상태'));
    expect(res.status).toBe(400);
  });

  it('GET-order: updated_at 내림차순, 동률이면 id 내림차순으로 정렬된다', async () => {
    const { GET, POST } = await import('@/app/api/competitors/route');
    const { getDB } = await import('@/lib/db');

    const aRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: 'A사' }),
      }),
    );
    const a = await aRes.json();
    const bRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: 'B사' }),
      }),
    );
    const b = await bRes.json();
    const cRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: 'C사' }),
      }),
    );
    const c = await cRes.json();

    const db = getDB();
    db.prepare('UPDATE competitors SET updated_at = ? WHERE id = ?').run('2024-01-01 00:00:00', a.id);
    db.prepare('UPDATE competitors SET updated_at = ? WHERE id = ?').run('2024-01-02 00:00:00', b.id);
    db.prepare('UPDATE competitors SET updated_at = ? WHERE id = ?').run('2024-01-02 00:00:00', c.id);

    const res = await GET(new Request('http://localhost/api/competitors'));
    const body = await res.json();

    expect(body.map((row: { id: number }) => row.id)).toEqual([c.id, b.id, a.id]);
  });

  it('PATCH-partial: note만 보내면 note만 바뀌고 나머지 필드와 updated_at만 변경된다', async () => {
    const { POST } = await import('@/app/api/competitors/route');
    const { PATCH } = await import('@/app/api/competitors/[id]/route');
    const { getDB } = await import('@/lib/db');

    const postRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: '부분수정경쟁사', homepage: 'https://old.com' }),
      }),
    );
    const created = await postRes.json();

    const db = getDB();
    db.prepare('UPDATE competitors SET updated_at = ? WHERE id = ?').run('2024-01-01 00:00:00', created.id);

    const patchRes = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ note: '새 메모' }) }),
      { params: Promise.resolve({ id: String(created.id) }) },
    );
    const patched = await patchRes.json();

    expect(patchRes.status).toBe(200);
    expect(patched.note).toBe('새 메모');
    expect(patched.name).toBe(created.name);
    expect(patched.homepage).toBe(created.homepage);
    expect(patched.status).toBe(created.status);
    expect(patched.mentioned_by_exec).toBe(created.mentioned_by_exec);
    expect(patched.updated_at).not.toBe('2024-01-01 00:00:00');
  });

  it('PATCH-name-blank: 공백/trim 후 빈 이름은 400이다', async () => {
    const { POST } = await import('@/app/api/competitors/route');
    const { PATCH } = await import('@/app/api/competitors/[id]/route');

    const postRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: '이름수정대상' }),
      }),
    );
    const created = await postRes.json();

    const patchRes = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ name: '  ' }) }),
      { params: Promise.resolve({ id: String(created.id) }) },
    );

    expect(patchRes.status).toBe(400);
  });

  it('PATCH-status-invalid: 존재하지 않는 status 값은 400이다', async () => {
    const { POST } = await import('@/app/api/competitors/route');
    const { PATCH } = await import('@/app/api/competitors/[id]/route');

    const postRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: '상태수정대상' }),
      }),
    );
    const created = await postRes.json();

    const patchRes = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: '없는상태' }) }),
      { params: Promise.resolve({ id: String(created.id) }) },
    );

    expect(patchRes.status).toBe(400);
  });

  it('PATCH-no-fields: 빈 body나 허용되지 않은 키만 있으면 400이다', async () => {
    const { POST } = await import('@/app/api/competitors/route');
    const { PATCH } = await import('@/app/api/competitors/[id]/route');

    const postRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: '필드없음대상' }),
      }),
    );
    const created = await postRes.json();

    const emptyRes = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({}) }),
      { params: Promise.resolve({ id: String(created.id) }) },
    );
    expect(emptyRes.status).toBe(400);

    const unknownRes = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ foo: 'bar' }) }),
      { params: Promise.resolve({ id: String(created.id) }) },
    );
    expect(unknownRes.status).toBe(400);
  });

  it('PATCH-status-backward: 담당자의 수동 PATCH는 상태를 뒤로도 자유롭게 바꿀 수 있다', async () => {
    const { POST } = await import('@/app/api/competitors/route');
    const { PATCH } = await import('@/app/api/competitors/[id]/route');

    const postRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: '역행대상' }),
      }),
    );
    const created = await postRes.json();

    const forwardRes = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: '벤치마킹도출' }) }),
      { params: Promise.resolve({ id: String(created.id) }) },
    );
    expect(forwardRes.status).toBe(200);
    expect((await forwardRes.json()).status).toBe('벤치마킹도출');

    const backwardRes = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: '조사중' }) }),
      { params: Promise.resolve({ id: String(created.id) }) },
    );
    const backward = await backwardRes.json();

    expect(backwardRes.status).toBe(200);
    expect(backward.status).toBe('조사중');
  });

  it('DELETE-blocked: 자식 레코드가 있으면 409이며 테이블별 counts와 총합이 반환되고 삭제되지 않는다', async () => {
    const { POST } = await import('@/app/api/competitors/route');
    const { GET: GET_ONE, DELETE } = await import('@/app/api/competitors/[id]/route');
    const { getDB } = await import('@/lib/db');

    const postRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: '삭제차단대상' }),
      }),
    );
    const created = await postRes.json();

    const db = getDB();
    db.prepare(
      'INSERT INTO collected_materials (competitor_id, content, source_type) VALUES (?, ?, ?)',
    ).run(created.id, '수집내용', '웹검색');
    db.prepare('INSERT INTO summaries (competitor_id) VALUES (?)').run(created.id);

    const deleteRes = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: String(created.id) }),
    });
    const deleteBody = await deleteRes.json();

    expect(deleteRes.status).toBe(409);
    expect(deleteBody.counts.collected_materials).toBe(1);
    expect(deleteBody.counts.summaries).toBe(1);
    expect(deleteBody.counts.benchmark_points).toBe(0);
    expect(deleteBody.counts.strategy_steps).toBe(0);
    expect(deleteBody.total).toBeGreaterThan(0);

    const getRes = await GET_ONE(new Request('http://localhost'), {
      params: Promise.resolve({ id: String(created.id) }),
    });
    expect(getRes.status).toBe(200);
  });

  it('DELETE-force-cascade: force=1이면 204이며 competitors와 네 자식 테이블의 연결 레코드가 모두 삭제된다', async () => {
    const { POST } = await import('@/app/api/competitors/route');
    const { GET: GET_ONE, DELETE } = await import('@/app/api/competitors/[id]/route');
    const { getDB } = await import('@/lib/db');

    const postRes = await POST(
      new Request('http://localhost/api/competitors', {
        method: 'POST',
        body: JSON.stringify({ name: '캐스케이드대상' }),
      }),
    );
    const created = await postRes.json();

    const db = getDB();
    db.prepare(
      'INSERT INTO collected_materials (competitor_id, content, source_type) VALUES (?, ?, ?)',
    ).run(created.id, '수집내용', '웹검색');
    db.prepare('INSERT INTO summaries (competitor_id) VALUES (?)').run(created.id);
    const bpResult = db
      .prepare(
        'INSERT INTO benchmark_points (competitor_id, source_item, description) VALUES (?, ?, ?)',
      )
      .run(created.id, 'SKU수', '벤치마킹 설명');
    db.prepare(
      'INSERT INTO strategy_steps (benchmark_point_id, step_order, description) VALUES (?, ?, ?)',
    ).run(bpResult.lastInsertRowid, 1, '실행 단계');

    const deleteRes = await DELETE(new Request('http://localhost?force=1'), {
      params: Promise.resolve({ id: String(created.id) }),
    });
    expect(deleteRes.status).toBe(204);

    const getRes = await GET_ONE(new Request('http://localhost'), {
      params: Promise.resolve({ id: String(created.id) }),
    });
    expect(getRes.status).toBe(404);

    const materialCount = (
      db.prepare('SELECT COUNT(*) AS c FROM collected_materials WHERE competitor_id = ?').get(created.id) as {
        c: number;
      }
    ).c;
    const summaryCount = (
      db.prepare('SELECT COUNT(*) AS c FROM summaries WHERE competitor_id = ?').get(created.id) as { c: number }
    ).c;
    const benchmarkCount = (
      db.prepare('SELECT COUNT(*) AS c FROM benchmark_points WHERE competitor_id = ?').get(created.id) as {
        c: number;
      }
    ).c;
    const stepCount = (
      db
        .prepare(
          'SELECT COUNT(*) AS c FROM strategy_steps WHERE benchmark_point_id = ?',
        )
        .get(bpResult.lastInsertRowid) as { c: number }
    ).c;

    expect(materialCount).toBe(0);
    expect(summaryCount).toBe(0);
    expect(benchmarkCount).toBe(0);
    expect(stepCount).toBe(0);
  });

  it('GET/PATCH/DELETE-not-found: 존재하지 않는 id는 세 메서드 모두 404를 반환한다', async () => {
    const { GET: GET_ONE, PATCH, DELETE } = await import('@/app/api/competitors/[id]/route');

    const getRes = await GET_ONE(new Request('http://localhost'), {
      params: Promise.resolve({ id: '999999' }),
    });
    expect(getRes.status).toBe(404);

    const patchRes = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ note: 'x' }) }),
      { params: Promise.resolve({ id: '999999' }) },
    );
    expect(patchRes.status).toBe(404);

    const deleteRes = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: '999999' }),
    });
    expect(deleteRes.status).toBe(404);
  });
});

describe('gyeongjaengsa-josa: types/index.ts 순수 함수', () => {
  it('advanceStatus-monotonic: target이 current보다 뒤면 유지하고, 앞이면 target으로 전진한다', () => {
    expect(advanceStatus('자료수집됨', '조사중')).toBe('자료수집됨');
    expect(advanceStatus('조사중', '정리완료')).toBe('정리완료');
  });

  it('isCompetitorStatus-guard: COMPETITOR_STATUSES에 속하면 true, 그 외 문자열은 false이다', () => {
    for (const status of COMPETITOR_STATUSES) {
      expect(isCompetitorStatus(status)).toBe(true);
    }
    expect(isCompetitorStatus('임의의문자열')).toBe(false);
  });
});
