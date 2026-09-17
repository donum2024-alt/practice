import { getDB } from '@/lib/db';
import type { Competitor, Summary } from '@/types';
import { getCompetitor } from '../competitors/shared';

type SummaryRow = Omit<Summary, 'confirmed'> & { confirmed: number };

function toSummary(row: SummaryRow): Summary {
  return { ...row, confirmed: row.confirmed === 1 };
}

function parseIds(param: string | null): number[] {
  if (!param) return [];
  return param
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
}

export async function GET(req: Request) {
  const db = getDB();
  const ids = parseIds(new URL(req.url).searchParams.get('competitorIds'));

  if (ids.length === 0) {
    return Response.json({ error: 'competitorIds가 필요합니다.' }, { status: 400 });
  }

  const results: { competitor: Competitor; summary: Summary | null }[] = [];

  for (const id of ids) {
    const competitor = getCompetitor(db, id);
    if (!competitor) continue;

    const row = db.prepare('SELECT * FROM summaries WHERE competitor_id = ?').get(id) as
      | SummaryRow
      | undefined;

    results.push({ competitor, summary: row ? toSummary(row) : null });
  }

  return Response.json(results);
}
