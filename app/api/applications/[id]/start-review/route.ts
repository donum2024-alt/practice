import { getDB } from '@/lib/db';
import { canTransition, missingDocuments, type Application } from '@/types';
import { ensureStandardChecks, getApplication } from '@/app/api/_shared/documents';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteContext) {
  const db = getDB();
  const { id } = await params;
  const application = getApplication(db, Number(id));

  if (!application) {
    return Response.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  const checks = ensureStandardChecks(db, application.id);
  const missing = missingDocuments(checks);

  if (missing.length > 0) {
    return Response.json(
      { error: '아직 받지 못한 서류가 있어 심사를 시작할 수 없습니다.', missing },
      { status: 400 },
    );
  }

  if (application.status === '심사중') {
    return Response.json(application);
  }

  if (!canTransition(application.status, '심사중')) {
    return Response.json(
      { error: `'${application.status}' 상태에서는 심사를 시작할 수 없습니다.` },
      { status: 400 },
    );
  }

  db.prepare(
    "UPDATE applications SET status = '심사중', updated_at = datetime('now','localtime') WHERE id = ?",
  ).run(application.id);

  return Response.json(getApplication(db, application.id) as Application);
}
