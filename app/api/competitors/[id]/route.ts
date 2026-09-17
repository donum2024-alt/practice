import { getDB } from '@/lib/db';
import { isCompetitorStatus } from '@/types';
import { getCompetitor } from '../shared';

type RouteContext = { params: Promise<{ id: string }> };

// 경쟁사 삭제 시 함께 지울 하위 테이블. competitor_id를 참조하는 후속 스펙
// (hangmokbyeol-jeongni, benchmarking-jijeom)은 자신의 테이블명을 이 배열에 추가한다.
const CHILD_TABLES = ['collected_materials', 'summaries', 'benchmark_points'] as const;

export async function GET(_req: Request, { params }: RouteContext) {
  const db = getDB();
  const { id } = await params;
  const competitor = getCompetitor(db, Number(id));

  if (!competitor) {
    return Response.json({ error: '경쟁사를 찾을 수 없습니다.' }, { status: 404 });
  }

  return Response.json(competitor);
}

export async function PATCH(req: Request, { params }: RouteContext) {
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
  const assignments: string[] = [];
  const values: Record<string, string | number | null> = {};

  if ('name' in patch) {
    const name = typeof patch.name === 'string' ? patch.name.trim() : '';
    if (name === '') {
      return Response.json({ error: '경쟁사 이름을 입력하세요.' }, { status: 400 });
    }
    values.name = name;
    assignments.push('name = @name');
  }

  if ('homepage' in patch) {
    const raw = patch.homepage;
    values.homepage = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
    assignments.push('homepage = @homepage');
  }

  if ('note' in patch) {
    const raw = patch.note;
    values.note = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
    assignments.push('note = @note');
  }

  if ('mentioned_by_exec' in patch) {
    values.mentioned_by_exec = patch.mentioned_by_exec ? 1 : 0;
    assignments.push('mentioned_by_exec = @mentioned_by_exec');
  }

  if ('status' in patch) {
    if (!isCompetitorStatus(patch.status)) {
      return Response.json({ error: '알 수 없는 상태입니다.' }, { status: 400 });
    }
    values.status = patch.status;
    assignments.push('status = @status');
  }

  if (assignments.length === 0) {
    return Response.json({ error: '변경할 항목이 없습니다.' }, { status: 400 });
  }

  assignments.push("updated_at = datetime('now','localtime')");
  db.prepare(`UPDATE competitors SET ${assignments.join(', ')} WHERE id = @id`).run({
    ...values,
    id: competitor.id,
  });

  return Response.json(getCompetitor(db, competitor.id));
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const db = getDB();
  const { id } = await params;
  const competitor = getCompetitor(db, Number(id));

  if (!competitor) {
    return Response.json({ error: '경쟁사를 찾을 수 없습니다.' }, { status: 404 });
  }

  const force = new URL(req.url).searchParams.get('force') === '1';

  const existingTables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );

  const counts: Record<string, number> = {};
  let total = 0;
  for (const table of CHILD_TABLES) {
    const count = existingTables.has(table)
      ? (
          db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE competitor_id = ?`).get(competitor.id) as {
            c: number;
          }
        ).c
      : 0;
    counts[table] = count;
    total += count;
  }

  if (total > 0 && !force) {
    return Response.json({ error: '연결된 자료가 있습니다.', counts, total }, { status: 409 });
  }

  const cascade = db.transaction((competitorId: number) => {
    for (const table of CHILD_TABLES) {
      if (existingTables.has(table)) {
        db.prepare(`DELETE FROM ${table} WHERE competitor_id = ?`).run(competitorId);
      }
    }
    db.prepare('DELETE FROM competitors WHERE id = ?').run(competitorId);
  });
  cascade(competitor.id);

  return new Response(null, { status: 204 });
}
