import { getDB } from '@/lib/db';
import { canTransition, isApplicationStatus, type Application } from '@/types';

type RouteContext = { params: Promise<{ id: string }> };

const EDITABLE_FIELDS = [
  'biz_name',
  'biz_reg_no',
  'representative',
  'industry',
  'business_type',
  'expected_sales',
  'agency',
] as const;

// 신청 삭제 시 함께 지울 하위 테이블. 후속 스펙은 자신의 테이블명을 이 배열에 추가한다.
const CHILD_TABLES = [
  'document_checks',
  'document_requests',
  'review_reports',
  'approvals',
  'rejection_notices',
] as const;

function getApplication(id: number): Application | undefined {
  return getDB().prepare('SELECT * FROM applications WHERE id = ?').get(id) as Application | undefined;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const application = getApplication(Number(id));

  if (!application) {
    return Response.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  return Response.json(application);
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const db = getDB();
  const { id } = await params;
  const application = getApplication(Number(id));

  if (!application) {
    return Response.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const patch = body as Record<string, unknown>;
  const assignments: string[] = [];
  const values: Record<string, string | null> = {};

  if ('status' in patch) {
    const next = patch.status;
    if (!isApplicationStatus(next)) {
      return Response.json({ error: '알 수 없는 상태입니다.' }, { status: 400 });
    }
    if (next !== application.status && !canTransition(application.status, next)) {
      return Response.json(
        { error: `'${application.status}' → '${next}' 전이는 허용되지 않습니다.` },
        { status: 400 },
      );
    }
    assignments.push('status = @status');
    values.status = next;
  }

  for (const field of EDITABLE_FIELDS) {
    if (!(field in patch)) continue;
    const raw = patch[field];

    if (field === 'agency') {
      values.agency = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
      assignments.push('agency = @agency');
      continue;
    }

    if (typeof raw !== 'string' || raw.trim() === '') {
      return Response.json({ error: `'${field}' 값이 올바르지 않습니다.` }, { status: 400 });
    }
    values[field] = raw.trim();
    assignments.push(`${field} = @${field}`);
  }

  if (assignments.length === 0) {
    return Response.json({ error: '변경할 항목이 없습니다.' }, { status: 400 });
  }

  assignments.push("updated_at = datetime('now','localtime')");
  db.prepare(`UPDATE applications SET ${assignments.join(', ')} WHERE id = @id`).run({
    ...values,
    id: application.id,
  });

  return Response.json(getApplication(application.id));
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const db = getDB();
  const { id } = await params;
  const application = getApplication(Number(id));

  if (!application) {
    return Response.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  const existingTables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );

  const cascade = db.transaction((appId: number) => {
    for (const table of CHILD_TABLES) {
      if (existingTables.has(table)) {
        db.prepare(`DELETE FROM ${table} WHERE application_id = ?`).run(appId);
      }
    }
    db.prepare('DELETE FROM applications WHERE id = ?').run(appId);
  });
  cascade(application.id);

  return new Response(null, { status: 204 });
}
