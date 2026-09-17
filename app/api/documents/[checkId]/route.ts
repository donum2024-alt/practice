import { getDB } from '@/lib/db';
import { type DocumentCheck } from '@/types';
import { toDocumentCheck } from '@/app/api/_shared/documents';

type RouteContext = { params: Promise<{ checkId: string }> };

type CheckRow = Omit<DocumentCheck, 'received'> & { received: number };

function getCheck(id: number): CheckRow | undefined {
  return getDB().prepare('SELECT * FROM document_checks WHERE id = ?').get(id) as CheckRow | undefined;
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const db = getDB();
  const { checkId } = await params;
  const check = getCheck(Number(checkId));

  if (!check) {
    return Response.json({ error: '서류 항목을 찾을 수 없습니다.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const patch = body as Record<string, unknown>;
  const assignments: string[] = [];
  const values: Record<string, string | number | null> = {};

  if ('received' in patch) {
    if (typeof patch.received !== 'boolean') {
      return Response.json({ error: "'received' 값이 올바르지 않습니다." }, { status: 400 });
    }
    assignments.push('received = @received');
    values.received = patch.received ? 1 : 0;
  }

  if ('note' in patch) {
    const raw = patch.note;
    if (raw !== null && typeof raw !== 'string') {
      return Response.json({ error: "'note' 값이 올바르지 않습니다." }, { status: 400 });
    }
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    assignments.push('note = @note');
    values.note = trimmed === '' ? null : trimmed;
  }

  if (assignments.length === 0) {
    return Response.json({ error: '변경할 항목이 없습니다.' }, { status: 400 });
  }

  db.prepare(`UPDATE document_checks SET ${assignments.join(', ')} WHERE id = @id`).run({
    ...values,
    id: check.id,
  });

  return Response.json(toDocumentCheck(getCheck(check.id)!));
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const db = getDB();
  const { checkId } = await params;
  const check = getCheck(Number(checkId));

  if (!check) {
    return Response.json({ error: '서류 항목을 찾을 수 없습니다.' }, { status: 404 });
  }

  db.prepare('DELETE FROM document_checks WHERE id = ?').run(check.id);

  return new Response(null, { status: 204 });
}
