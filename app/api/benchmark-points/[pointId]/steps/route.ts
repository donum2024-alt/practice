import { getDB } from '@/lib/db';
import type { StrategyStep } from '@/types';
import { getBenchmarkPoint } from '@/app/api/benchmark-points/shared';
import { getStrategyStep } from '@/app/api/strategy-steps/shared';

type RouteContext = { params: Promise<{ pointId: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const db = getDB();
  const { pointId } = await params;
  const point = getBenchmarkPoint(db, Number(pointId));

  if (!point) {
    return Response.json({ error: '벤치마킹 지점을 찾을 수 없습니다.' }, { status: 404 });
  }

  const rows = db
    .prepare('SELECT * FROM strategy_steps WHERE benchmark_point_id = ? ORDER BY step_order ASC')
    .all(point.id) as StrategyStep[];

  return Response.json(rows);
}

export async function POST(req: Request, { params }: RouteContext) {
  const db = getDB();
  const { pointId } = await params;
  const point = getBenchmarkPoint(db, Number(pointId));

  if (!point) {
    return Response.json({ error: '벤치마킹 지점을 찾을 수 없습니다.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const description = typeof (body as Record<string, unknown>).description === 'string'
    ? ((body as Record<string, unknown>).description as string).trim()
    : '';

  if (description === '') {
    return Response.json({ error: '단계 설명을 입력하세요.' }, { status: 400 });
  }

  const { maxOrder } = db
    .prepare('SELECT MAX(step_order) AS maxOrder FROM strategy_steps WHERE benchmark_point_id = ?')
    .get(point.id) as { maxOrder: number | null };

  const step_order = (maxOrder ?? 0) + 1;

  const result = db
    .prepare(
      `INSERT INTO strategy_steps (benchmark_point_id, step_order, description)
       VALUES (@benchmark_point_id, @step_order, @description)`,
    )
    .run({ benchmark_point_id: point.id, step_order, description });

  const created = getStrategyStep(db, result.lastInsertRowid as number);

  return Response.json(created, { status: 201 });
}
