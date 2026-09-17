import type Database from 'better-sqlite3';
import { STANDARD_DOC_TYPES, type Application, type DocumentCheck, type DocumentRequest } from '@/types';

type DocumentCheckRow = Omit<DocumentCheck, 'received'> & { received: number };

export function toDocumentCheck(row: DocumentCheckRow): DocumentCheck {
  return { ...row, received: row.received === 1 };
}

export function getApplication(db: Database.Database, id: number): Application | undefined {
  return db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as Application | undefined;
}

export function listChecks(db: Database.Database, applicationId: number): DocumentCheck[] {
  const rows = db
    .prepare('SELECT * FROM document_checks WHERE application_id = ? ORDER BY id ASC')
    .all(applicationId) as DocumentCheckRow[];
  return rows.map(toDocumentCheck);
}

export function listRequests(db: Database.Database, applicationId: number): DocumentRequest[] {
  return db
    .prepare('SELECT * FROM document_requests WHERE application_id = ? ORDER BY requested_at ASC, id ASC')
    .all(applicationId) as DocumentRequest[];
}

// 체크 레코드가 하나도 없으면 표준 3항목을 생성한다. 이미 있으면 그대로 둔다.
export function ensureStandardChecks(db: Database.Database, applicationId: number): DocumentCheck[] {
  const existing = listChecks(db, applicationId);
  if (existing.length > 0) return existing;

  const insert = db.prepare(
    'INSERT INTO document_checks (application_id, doc_type) VALUES (?, ?)',
  );
  const seed = db.transaction(() => {
    for (const docType of STANDARD_DOC_TYPES) insert.run(applicationId, docType);
  });
  seed();

  return listChecks(db, applicationId);
}
