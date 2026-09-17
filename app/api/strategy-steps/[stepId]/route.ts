import { getDB } from '@/lib/db';
import type { StrategyStep } from '@/types';
import { getStrategyStep } from '../shared';

type RouteContext = { params: Promise<{ stepId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const db = getDB();
  const { stepId } = await params;
  const step = getStrategyStep(db, Number(stepId));

  if (!step) {
    return Response.json({ error: '실행 단계를 찾을 수 없습니다.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const patch = body as Record<string, unknown>;

  if ('direction' in patch) {
    if (patch.direction !== 'up' && patch.direction !== 'down') {
      return Response.json({ error: '이동 방향이 올바르지 않습니다.' }, { status: 400 });
    }

    const targetOrder = patch.direction === 'up' ? step.step_order - 1 : step.step_order + 1;
    const neighbor = db
      .prepare('SELECT * FROM strategy_steps WHERE benchmark_point_id = ? AND step_order = ?')
      .get(step.benchmark_point_id, targetOrder) as StrategyStep | undefined;

    if (!neighbor) {
      return Response.json({ error: '이동할 단계가 없습니다.' }, { status: 400 });
    }

    const swap = db.transaction(() => {
      db.prepare("UPDATE strategy_steps SET step_order = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
        neighbor.step_order,
        step.id,
      );
      db.prepare("UPDATE strategy_steps SET step_order = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
        step.step_order,
        neighbor.id,
      );
    });
    swap();

    return Response.json(getStrategyStep(db, step.id));
  }

  if ('description' in patch) {
    const description = typeof patch.description === 'string' ? patch.description.trim() : '';
    if (description === '') {
      return Response.json({ error: '단계 설명을 입력하세요.' }, { status: 400 });
    }

    db.prepare("UPDATE strategy_steps SET description = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
      description,
      step.id,
    );

    return Response.json(getStrategyStep(db, step.id));
  }

  return Response.json({ error: '변경할 항목이 없습니다.' }, { status: 400 });
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const db = getDB();
  const { stepId } = await params;
  const step = getStrategyStep(db, Number(stepId));

  if (!step) {
    return Response.json({ error: '실행 단계를 찾을 수 없습니다.' }, { status: 404 });
  }

  const removeAndRenumber = db.transaction(() => {
    db.prepare('DELETE FROM strategy_steps WHERE id = ?').run(step.id);

    const remaining = db
      .prepare('SELECT id FROM strategy_steps WHERE benchmark_point_id = ? ORDER BY step_order ASC')
      .all(step.benchmark_point_id) as { id: number }[];

    remaining.forEach((row, index) => {
      db.prepare("UPDATE strategy_steps SET step_order = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
        index + 1,
        row.id,
      );
    });
  });
  removeAndRenumber();

  return new Response(null, { status: 204 });
}
