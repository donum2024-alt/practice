import { getDB } from '@/lib/db';
import {
  canTransition,
  DOC_REQUEST_AUTO_SUPPLEMENT_FROM,
  type DocumentRequest,
} from '@/types';
import { getApplication } from '@/app/api/_shared/documents';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  const db = getDB();
  const { id } = await params;
  const application = getApplication(db, Number(id));

  if (!application) {
    return Response.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const requestedDocs = (body as Record<string, unknown> | null)?.requested_docs;

  if (typeof requestedDocs !== 'string' || requestedDocs.trim() === '') {
    return Response.json({ error: '재요청한 서류를 입력하세요.' }, { status: 400 });
  }

  const shouldSupplement =
    DOC_REQUEST_AUTO_SUPPLEMENT_FROM.includes(application.status) &&
    canTransition(application.status, '서류보완');

  const record = db.transaction(() => {
    const result = db
      .prepare('INSERT INTO document_requests (application_id, requested_docs) VALUES (?, ?)')
      .run(application.id, requestedDocs.trim());

    if (shouldSupplement) {
      db.prepare(
        "UPDATE applications SET status = '서류보완', updated_at = datetime('now','localtime') WHERE id = ?",
      ).run(application.id);
    }

    return db
      .prepare('SELECT * FROM document_requests WHERE id = ?')
      .get(result.lastInsertRowid) as DocumentRequest;
  });

  return Response.json(record(), { status: 201 });
}
