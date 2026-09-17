import { getDB } from '@/lib/db';
import { isCompetitorStatus } from '@/types';
import { getCompetitor, toCompetitor, type CompetitorRow } from './shared';

export async function GET(req: Request) {
  const db = getDB();
  const status = new URL(req.url).searchParams.get('status');

  if (status && !isCompetitorStatus(status)) {
    return Response.json({ error: '알 수 없는 상태입니다.' }, { status: 400 });
  }

  const rows = (
    status
      ? db.prepare('SELECT * FROM competitors WHERE status = ? ORDER BY updated_at DESC, id DESC').all(status)
      : db.prepare('SELECT * FROM competitors ORDER BY updated_at DESC, id DESC').all()
  ) as CompetitorRow[];

  return Response.json(rows.map(toCompetitor));
}

export async function POST(req: Request) {
  const db = getDB();
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';

  if (name === '') {
    return Response.json({ error: '경쟁사 이름을 입력하세요.' }, { status: 400 });
  }

  const homepage = typeof raw.homepage === 'string' && raw.homepage.trim() !== '' ? raw.homepage.trim() : null;
  const note = typeof raw.note === 'string' && raw.note.trim() !== '' ? raw.note.trim() : null;
  const mentionedByExec = raw.mentioned_by_exec === true ? 1 : 0;

  const duplicate = db
    .prepare('SELECT * FROM competitors WHERE LOWER(TRIM(name)) = LOWER(?)')
    .get(name) as CompetitorRow | undefined;

  if (duplicate) {
    return Response.json(
      { error: '이미 등록된 경쟁사입니다.', competitor: toCompetitor(duplicate) },
      { status: 409 },
    );
  }

  const result = db
    .prepare(
      `INSERT INTO competitors (name, homepage, note, mentioned_by_exec, status)
       VALUES (@name, @homepage, @note, @mentioned_by_exec, '조사중')`,
    )
    .run({ name, homepage, note, mentioned_by_exec: mentionedByExec });

  const created = getCompetitor(db, result.lastInsertRowid as number);

  return Response.json(created, { status: 201 });
}
