import { getDB } from '@/lib/db';
import { advanceStatus, type Summary } from '@/types';
import { getCompetitor } from '../../shared';

type RouteContext = { params: Promise<{ id: string }> };

type SummaryRow = Omit<Summary, 'confirmed'> & { confirmed: number };

function toSummary(row: SummaryRow): Summary {
  return { ...row, confirmed: row.confirmed === 1 };
}

function defaultSummary(competitorId: number): Summary {
  return {
    id: 0,
    competitor_id: competitorId,
    sku_count: null,
    logistics: null,
    pricing: null,
    strengths: null,
    differentiation: null,
    confirmed: false,
    confirmed_at: null,
    updated_at: null,
  };
}

function getSummaryRow(db: ReturnType<typeof getDB>, competitorId: number): SummaryRow | undefined {
  return db.prepare('SELECT * FROM summaries WHERE competitor_id = ?').get(competitorId) as
    | SummaryRow
    | undefined;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const db = getDB();
  const { id } = await params;
  const competitor = getCompetitor(db, Number(id));

  if (!competitor) {
    return Response.json({ error: '경쟁사를 찾을 수 없습니다.' }, { status: 404 });
  }

  const row = getSummaryRow(db, competitor.id);

  return Response.json(row ? toSummary(row) : defaultSummary(competitor.id));
}

const TEXT_FIELDS = ['sku_count', 'logistics', 'pricing', 'strengths', 'differentiation'] as const;

export async function PUT(req: Request, { params }: RouteContext) {
  const db = getDB();
  const { id } = await params;
  const competitor = getCompetitor(db, Number(id));

  if (!competitor) {
    return Response.json({ error: '경쟁사를 찾을 수 없습니다.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }
  const patch = body as Record<string, unknown>;

  const existing = getSummaryRow(db, competitor.id);
  const wasConfirmed = existing ? existing.confirmed === 1 : false;

  const values: Record<string, string | number | null> = {
    competitor_id: competitor.id,
  };

  for (const field of TEXT_FIELDS) {
    if (field in patch) {
      const raw = patch[field];
      values[field] = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
    } else {
      values[field] = existing ? existing[field] : null;
    }
  }

  const nextConfirmed = typeof patch.confirmed === 'boolean' ? patch.confirmed : wasConfirmed;

  let confirmedAt: string | null;
  if (!wasConfirmed && nextConfirmed) {
    const { now } = db.prepare("SELECT datetime('now','localtime') AS now").get() as { now: string };
    confirmedAt = now;
  } else if (wasConfirmed && !nextConfirmed) {
    confirmedAt = null;
  } else {
    confirmedAt = existing ? existing.confirmed_at : null;
  }

  values.confirmed = nextConfirmed ? 1 : 0;
  values.confirmed_at = confirmedAt;

  if (existing) {
    db.prepare(
      `UPDATE summaries SET
         sku_count = @sku_count,
         logistics = @logistics,
         pricing = @pricing,
         strengths = @strengths,
         differentiation = @differentiation,
         confirmed = @confirmed,
         confirmed_at = @confirmed_at,
         updated_at = datetime('now','localtime')
       WHERE competitor_id = @competitor_id`,
    ).run(values);
  } else {
    db.prepare(
      `INSERT INTO summaries
         (competitor_id, sku_count, logistics, pricing, strengths, differentiation, confirmed, confirmed_at)
       VALUES
         (@competitor_id, @sku_count, @logistics, @pricing, @strengths, @differentiation, @confirmed, @confirmed_at)`,
    ).run(values);
  }

  if (!wasConfirmed && nextConfirmed) {
    const nextStatus = advanceStatus(competitor.status, '정리완료');
    if (nextStatus !== competitor.status) {
      db.prepare("UPDATE competitors SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
        nextStatus,
        competitor.id,
      );
    }
  }

  const saved = getSummaryRow(db, competitor.id) as SummaryRow;
  return Response.json(toSummary(saved));
}
