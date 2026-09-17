import { getDB } from '@/lib/db';
import { type DocumentCheck } from '@/types';
import {
  ensureStandardChecks,
  getApplication,
  listRequests,
  toDocumentCheck,
} from '@/app/api/_shared/documents';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const db = getDB();
  const { id } = await params;
  const application = getApplication(db, Number(id));

  if (!application) {
    return Response.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  const checks = ensureStandardChecks(db, application.id);
  const requests = listRequests(db, application.id);

  return Response.json({ checks, requests });
}

export async function POST(req: Request, { params }: RouteContext) {
  const db = getDB();
  const { id } = await params;
  const application = getApplication(db, Number(id));

  if (!application) {
    return Response.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const docType = (body as Record<string, unknown> | null)?.doc_type;

  if (typeof docType !== 'string' || docType.trim() === '') {
    return Response.json({ error: '서류 항목명을 입력하세요.' }, { status: 400 });
  }

  const result = db
    .prepare('INSERT INTO document_checks (application_id, doc_type) VALUES (?, ?)')
    .run(application.id, docType.trim());

  const created = db
    .prepare('SELECT * FROM document_checks WHERE id = ?')
    .get(result.lastInsertRowid) as Omit<DocumentCheck, 'received'> & { received: number };

  return Response.json(toDocumentCheck(created), { status: 201 });
}
