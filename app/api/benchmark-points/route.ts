import { getDB } from '@/lib/db';
import { isBenchmarkReflectionStatus, type BenchmarkPointWithCompetitor } from '@/types';

export async function GET(req: Request) {
  const db = getDB();
  const status = new URL(req.url).searchParams.get('status');

  if (status && !isBenchmarkReflectionStatus(status)) {
    return Response.json({ error: '알 수 없는 반영 상태입니다.' }, { status: 400 });
  }

  const rows = (
    status
      ? db
          .prepare(
            `SELECT benchmark_points.*, competitors.name AS competitor_name
             FROM benchmark_points
             JOIN competitors ON competitors.id = benchmark_points.competitor_id
             WHERE benchmark_points.reflection_status = ?
             ORDER BY benchmark_points.updated_at DESC, benchmark_points.id DESC`,
          )
          .all(status)
      : db
          .prepare(
            `SELECT benchmark_points.*, competitors.name AS competitor_name
             FROM benchmark_points
             JOIN competitors ON competitors.id = benchmark_points.competitor_id
             ORDER BY benchmark_points.updated_at DESC, benchmark_points.id DESC`,
          )
          .all()
  ) as BenchmarkPointWithCompetitor[];

  return Response.json(rows);
}
