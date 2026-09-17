import { getDB } from '@/lib/db';
import { isBenchmarkReflectionStatus } from '@/types';
import { getBenchmarkPoint, isSummaryItemKey } from '../shared';

type RouteContext = { params: Promise<{ pointId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
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

  const patch = body as Record<string, unknown>;
  const assignments: string[] = [];
  const values: Record<string, string | null> = {};

  if ('source_item' in patch) {
    if (!isSummaryItemKey(patch.source_item)) {
      return Response.json({ error: '항목이 올바르지 않습니다.' }, { status: 400 });
    }
    values.source_item = patch.source_item;
    assignments.push('source_item = @source_item');
  }

  if ('description' in patch) {
    const description = typeof patch.description === 'string' ? patch.description.trim() : '';
    if (description === '') {
      return Response.json({ error: '설명을 입력하세요.' }, { status: 400 });
    }
    values.description = description;
    assignments.push('description = @description');
  }

  if ('rationale' in patch) {
    const raw = patch.rationale;
    values.rationale = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
    assignments.push('rationale = @rationale');
  }

  if ('reflection_status' in patch) {
    if (!isBenchmarkReflectionStatus(patch.reflection_status)) {
      return Response.json({ error: '알 수 없는 반영 상태입니다.' }, { status: 400 });
    }
    values.reflection_status = patch.reflection_status;
    assignments.push('reflection_status = @reflection_status');
  }

  if ('result_note' in patch) {
    const raw = patch.result_note;
    values.result_note = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
    assignments.push('result_note = @result_note');
  }

  if (assignments.length === 0) {
    return Response.json({ error: '변경할 항목이 없습니다.' }, { status: 400 });
  }

  assignments.push("updated_at = datetime('now','localtime')");
  db.prepare(`UPDATE benchmark_points SET ${assignments.join(', ')} WHERE id = @id`).run({
    ...values,
    id: point.id,
  });

  return Response.json(getBenchmarkPoint(db, point.id));
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const db = getDB();
  const { pointId } = await params;
  const point = getBenchmarkPoint(db, Number(pointId));

  if (!point) {
    return Response.json({ error: '벤치마킹 지점을 찾을 수 없습니다.' }, { status: 404 });
  }

  const cascade = db.transaction((pointId: number) => {
    db.prepare('DELETE FROM strategy_steps WHERE benchmark_point_id = ?').run(pointId);
    db.prepare('DELETE FROM benchmark_points WHERE id = ?').run(pointId);
  });
  cascade(point.id);

  return new Response(null, { status: 204 });
}
