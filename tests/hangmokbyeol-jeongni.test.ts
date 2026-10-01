import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestDb, teardownTestDb } from './helpers/db';

beforeEach(() => {
  setupTestDb();
  vi.resetModules();
});

afterEach(async () => {
  await teardownTestDb();
});

type CompetitorJson = { id: number; status: string };

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

async function setCompetitorStatus(id: number, status: string): Promise<void> {
  const { PATCH } = await import('@/app/api/competitors/[id]/route');
  const res = await PATCH(
    new Request(`http://localhost/api/competitors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
  expect(res.status).toBe(200);
}

async function getCompetitorStatus(id: number): Promise<string> {
  const { GET } = await import('@/app/api/competitors/[id]/route');
  const res = await GET(new Request(`http://localhost/api/competitors/${id}`), {
    params: Promise.resolve({ id: String(id) }),
  });
  const body = (await res.json()) as CompetitorJson;
  return body.status;
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

async function getSummary(id: number): Promise<{ status: number; body: any }> {
  const { GET } = await import('@/app/api/competitors/[id]/summary/route');
  const res = await GET(new Request(`http://localhost/api/competitors/${id}/summary`), {
    params: Promise.resolve({ id: String(id) }),
  });
  return { status: res.status, body: await res.json() };
}

describe('hangmokbyeol-jeongni: 경쟁사별 항목 정리 문서', () => {
  it('GET-no-summary: summaries 행이 없으면 모든 항목이 null이고 confirmed:false인 기본 객체를 반환하고 행을 생성하지 않는다', async () => {
    const competitor = await createCompetitor('A사');

    const { status, body } = await getSummary(competitor.id);

    expect(status).toBe(200);
    expect(body.competitor_id).toBe(competitor.id);
    expect(body.sku_count).toBeNull();
    expect(body.logistics).toBeNull();
    expect(body.pricing).toBeNull();
    expect(body.strengths).toBeNull();
    expect(body.differentiation).toBeNull();
    expect(body.confirmed).toBe(false);
    expect(body.confirmed_at).toBeNull();

    const { getDB } = await import('@/lib/db');
    const row = getDB().prepare('SELECT * FROM summaries WHERE competitor_id = ?').get(competitor.id);
    expect(row).toBeUndefined();
  });

  it('GET-no-competitor: 존재하지 않는 경쟁사 id로 요청하면 404를 반환한다', async () => {
    const { status, body } = await getSummary(999999);

    expect(status).toBe(404);
    expect(body.error).toBeTruthy();
  });

  it('PUT-create: summaries 행이 없을 때 sku_count만 보내면 새 행이 생성되고 나머지 텍스트 필드는 null, confirmed는 false다', async () => {
    const competitor = await createCompetitor('B사');

    const { status, body } = await putSummary(competitor.id, { sku_count: '1,200개' });

    expect(status).toBe(200);
    expect(body.sku_count).toBe('1,200개');
    expect(body.logistics).toBeNull();
    expect(body.pricing).toBeNull();
    expect(body.strengths).toBeNull();
    expect(body.differentiation).toBeNull();
    expect(body.confirmed).toBe(false);

    const { getDB } = await import('@/lib/db');
    const row = getDB().prepare('SELECT * FROM summaries WHERE competitor_id = ?').get(competitor.id);
    expect(row).toBeDefined();
  });

  it('PUT-partial-update: 5개 텍스트 필드가 모두 채워진 기존 행에 logistics만 보내면 logistics만 갱신되고 나머지는 그대로 유지된다', async () => {
    const competitor = await createCompetitor('C사');

    await putSummary(competitor.id, {
      sku_count: '500개',
      logistics: '자체 물류센터',
      pricing: '중가 전략',
      strengths: '빠른 배송',
      differentiation: '당일 배송',
    });

    const { status, body } = await putSummary(competitor.id, { logistics: '3PL 위탁' });

    expect(status).toBe(200);
    expect(body.logistics).toBe('3PL 위탁');
    expect(body.sku_count).toBe('500개');
    expect(body.pricing).toBe('중가 전략');
    expect(body.strengths).toBe('빠른 배송');
    expect(body.differentiation).toBe('당일 배송');
  });

  it('PUT-confirm-transition: 미확정 행을 confirmed:true로 보내면 confirmed_at이 세팅되고 경쟁사 status가 정리완료로 갱신된다', async () => {
    const competitor = await createCompetitor('D사');
    await setCompetitorStatus(competitor.id, '자료수집됨');
    await putSummary(competitor.id, { sku_count: '300개' });

    const { status, body } = await putSummary(competitor.id, { confirmed: true });

    expect(status).toBe(200);
    expect(body.confirmed).toBe(true);
    expect(body.confirmed_at).not.toBeNull();

    const competitorStatus = await getCompetitorStatus(competitor.id);
    expect(competitorStatus).toBe('정리완료');
  });

  it('PUT-unconfirm: 확정된 행을 confirmed:false로 보내면 confirmed_at은 null로 리셋되지만 경쟁사 status는 정리완료로 유지된다(강등되지 않음)', async () => {
    const competitor = await createCompetitor('E사');
    await setCompetitorStatus(competitor.id, '자료수집됨');
    await putSummary(competitor.id, { sku_count: '300개' });
    await putSummary(competitor.id, { confirmed: true });
    expect(await getCompetitorStatus(competitor.id)).toBe('정리완료');

    const { status, body } = await putSummary(competitor.id, { confirmed: false });

    expect(status).toBe(200);
    expect(body.confirmed).toBe(false);
    expect(body.confirmed_at).toBeNull();

    const competitorStatus = await getCompetitorStatus(competitor.id);
    expect(competitorStatus).toBe('정리완료');
  });

  it('PUT-keep-confirmed: 이미 확정된 행에 텍스트 필드 수정값만 보내면(confirmed 생략) confirmed_at은 그대로 유지된다', async () => {
    const competitor = await createCompetitor('F사');
    await putSummary(competitor.id, { sku_count: '300개' });
    const confirmRes = await putSummary(competitor.id, { confirmed: true });
    const confirmedAtT1 = confirmRes.body.confirmed_at;
    expect(confirmedAtT1).not.toBeNull();

    const { status, body } = await putSummary(competitor.id, { sku_count: '400개' });

    expect(status).toBe(200);
    expect(body.confirmed).toBe(true);
    expect(body.confirmed_at).toBe(confirmedAtT1);
  });

  it('PUT-confirm-partial-fields: 5개 텍스트 필드 중 일부만 채워진 상태에서도 confirmed:true를 필드 완성도 검증 없이 허용한다', async () => {
    const competitor = await createCompetitor('G사');
    await putSummary(competitor.id, { sku_count: '300개', strengths: '빠른 배송' });

    const { status, body } = await putSummary(competitor.id, { confirmed: true });

    expect(status).toBe(200);
    expect(body.confirmed).toBe(true);
    expect(body.logistics).toBeNull();
    expect(body.pricing).toBeNull();
    expect(body.differentiation).toBeNull();
  });

  it('PUT-edit-after-confirm: 확정된 행에 strengths만 새 값으로 보내면(confirmed 미포함) strengths가 갱신되고 confirmed는 true로 유지된다', async () => {
    const competitor = await createCompetitor('H사');
    await putSummary(competitor.id, { sku_count: '300개', strengths: '빠른 배송' });
    await putSummary(competitor.id, { confirmed: true });

    const { status, body } = await putSummary(competitor.id, { strengths: '업계 최저가' });

    expect(status).toBe(200);
    expect(body.strengths).toBe('업계 최저가');
    expect(body.confirmed).toBe(true);
  });

  it('response-timestamps: PUT 저장/확정 후 응답 객체에 updated_at과 confirmed_at(또는 null)이 포함된다', async () => {
    const competitor = await createCompetitor('I사');

    const saveRes = await putSummary(competitor.id, { sku_count: '300개' });
    expect(saveRes.body.updated_at).toBeTruthy();
    expect(saveRes.body.confirmed_at).toBeNull();

    const confirmRes = await putSummary(competitor.id, { confirmed: true });
    expect(confirmRes.body.updated_at).toBeTruthy();
    expect(confirmRes.body.confirmed_at).toBeTruthy();

    const { status, body } = await getSummary(competitor.id);
    expect(status).toBe(200);
    expect(body.updated_at).toBeTruthy();
    expect(body.confirmed_at).toBeTruthy();
  });
});
