import { getDB } from '@/lib/db';
import { advanceStatus, type BenchmarkPoint } from '@/types';
import { getCompetitor } from '../../shared';
import { getBenchmarkPoint, isSummaryItemKey } from '@/app/api/benchmark-points/shared';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const db = getDB();
  const { id } = await params;
  const competitor = getCompetitor(db, Number(id));

  if (!competitor) {
    return Response.json({ error: '경쟁사를 찾을 수 없습니다.' }, { status: 404 });
  }

  const rows = db
    .prepare('SELECT * FROM benchmark_points WHERE competitor_id = ? ORDER BY created_at DESC, id DESC')
    .all(competitor.id) as BenchmarkPoint[];

  return Response.json(rows);
}

export async function POST(req: Request, { params }: RouteContext) {
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

  const raw = body as Record<string, unknown>;

  if (!isSummaryItemKey(raw.source_item)) {
    return Response.json({ error: '항목이 올바르지 않습니다.' }, { status: 400 });
  }
  const source_item = raw.source_item;

  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (description === '') {
    return Response.json({ error: '설명을 입력하세요.' }, { status: 400 });
  }

  const rationale = typeof raw.rationale === 'string' && raw.rationale.trim() !== '' ? raw.rationale.trim() : null;

  const { c: existingCount } = db
    .prepare('SELECT COUNT(*) AS c FROM benchmark_points WHERE competitor_id = ?')
    .get(competitor.id) as { c: number };

  const result = db
    .prepare(
      `INSERT INTO benchmark_points (competitor_id, source_item, description, rationale)
       VALUES (@competitor_id, @source_item, @description, @rationale)`,
    )
    .run({ competitor_id: competitor.id, source_item, description, rationale });

  if (existingCount === 0) {
    const nextStatus = advanceStatus(competitor.status, '벤치마킹도출');
    if (nextStatus !== competitor.status) {
      db.prepare("UPDATE competitors SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
        nextStatus,
        competitor.id,
      );
    }
  }

  const created = getBenchmarkPoint(db, result.lastInsertRowid as number);

  return Response.json(created, { status: 201 });
}
