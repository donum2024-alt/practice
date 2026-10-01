import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers/db';

beforeEach(() => {
  setupTestDb();
  vi.resetModules();
});

afterEach(async () => {
  await teardownTestDb();
});

type CompetitorJson = { id: number; name: string; status: string };

async function createCompetitor(name: string): Promise<CompetitorJson> {
  const { POST } = await import('@/app/api/competitors/route');
  const res = await POST(
    new Request('http://localhost/api/competitors', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  );
  return res.json();
}

async function putSummary(id: number, patch: Record<string, unknown>): Promise<{ status: number; body: any }> {
  const { PUT } = await import('@/app/api/competitors/[id]/summary/route');
  const res = await PUT(
    new Request(`http://localhost/api/competitors/${id}/summary`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
  return { status: res.status, body: await res.json() };
}

async function deleteCompetitor(id: number, force: boolean): Promise<{ status: number }> {
  const { DELETE } = await import('@/app/api/competitors/[id]/route');
  const url = `http://localhost/api/competitors/${id}${force ? '?force=1' : ''}`;
  const res = await DELETE(new Request(url, { method: 'DELETE' }), {
    params: Promise.resolve({ id: String(id) }),
  });
  return { status: res.status };
}

async function getComparison(competitorIdsQuery: string | null): Promise<{ status: number; body: any }> {
  const { GET } = await import('@/app/api/summaries/route');
  const url =
    competitorIdsQuery === null
      ? 'http://localhost/api/summaries'
      : `http://localhost/api/summaries?competitorIds=${encodeURIComponent(competitorIdsQuery)}`;
  const res = await GET(new Request(url));
  return { status: res.status, body: await res.json() };
}

describe('gyeongjaengsa-bigyo: 다중 경쟁사 비교 데이터 엔드포인트', () => {
  it('AC-order-shape: 쿼리로 준 competitorIds 순서대로 응답이 정렬되고 각 원소는 { competitor, summary } 형태다', async () => {
    const compA = await createCompetitor('A사');
    const compB = await createCompetitor('B사');
    await putSummary(compA.id, { sku_count: 'A의 SKU' });
    await putSummary(compB.id, { sku_count: 'B의 SKU' });

    const { status, body } = await getComparison(`${compB.id},${compA.id}`);

    expect(status).toBe(200);
    expect(body).toHaveLength(2);

    expect(body[0].competitor.id).toBe(compB.id);
    expect(body[0].summary.competitor_id).toBe(compB.id);
    expect(body[0].summary.sku_count).toBe('B의 SKU');

    expect(body[1].competitor.id).toBe(compA.id);
    expect(body[1].summary.competitor_id).toBe(compA.id);
    expect(body[1].summary.sku_count).toBe('A의 SKU');

    for (const item of body) {
      expect(Object.keys(item).sort()).toEqual(['competitor', 'summary']);
      expect(item.competitor).toHaveProperty('id');
      expect(item.competitor).toHaveProperty('name');
      expect(item.summary).toHaveProperty('competitor_id');
    }
  });

  it('AC-skip-nonexistent: 존재하지 않는 id는 결과에서 제외되고 존재하는 id만 담긴다', async () => {
    const comp = await createCompetitor('C사');
    await putSummary(comp.id, { sku_count: 'C의 SKU' });

    const { status, body } = await getComparison(`${comp.id},999999`);

    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].competitor.id).toBe(comp.id);
  });

  it('AC-400-empty: competitorIds가 생략되면 400과 에러 메시지를 반환한다', async () => {
    const { status, body } = await getComparison(null);

    expect(status).toBe(400);
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('AC-400-empty: competitorIds가 전부 정수 파싱 실패/0 이하("abc,0,-1")면 400과 에러 메시지를 반환한다', async () => {
    const { status, body } = await getComparison('abc,0,-1');

    expect(status).toBe(400);
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('US-4-null-summary: summaries 행이 없는 경쟁사는 결과에 포함되고 summary는 null이다', async () => {
    const comp = await createCompetitor('D사');

    const { status, body } = await getComparison(`${comp.id}`);

    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].competitor.id).toBe(comp.id);
    expect(body[0].summary).toBeNull();
  });

  it('FN-cascade-skip: force 삭제로 경쟁사와 summary가 함께 삭제된 id는 결과 배열에 나타나지 않는다', async () => {
    const deleted = await createCompetitor('E사');
    await putSummary(deleted.id, { sku_count: '삭제될 SKU' });
    const kept = await createCompetitor('F사');
    await putSummary(kept.id, { sku_count: '유지될 SKU' });

    const deleteRes = await deleteCompetitor(deleted.id, true);
    expect(deleteRes.status).toBe(204);

    const { status, body } = await getComparison(`${deleted.id},${kept.id}`);

    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].competitor.id).toBe(kept.id);
    expect(body.some((item: any) => item.competitor.id === deleted.id)).toBe(false);
  });
});
