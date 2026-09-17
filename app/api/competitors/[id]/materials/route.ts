import { getDB } from '@/lib/db';
import { advanceStatus, isMaterialSource, isMaterialTopic, type CollectedMaterial } from '@/types';
import { getCompetitor } from '../../shared';
import { getMaterial } from '@/app/api/materials/shared';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteContext) {
  const db = getDB();
  const { id } = await params;
  const competitor = getCompetitor(db, Number(id));

  if (!competitor) {
    return Response.json({ error: '경쟁사를 찾을 수 없습니다.' }, { status: 404 });
  }

  const searchParams = new URL(req.url).searchParams;
  const source = searchParams.get('source');
  const topic = searchParams.get('topic');

  if (source && !isMaterialSource(source)) {
    return Response.json({ error: '알 수 없는 출처입니다.' }, { status: 400 });
  }
  if (topic && !isMaterialTopic(topic)) {
    return Response.json({ error: '알 수 없는 항목입니다.' }, { status: 400 });
  }

  const conditions = ['competitor_id = @competitor_id'];
  const values: Record<string, string | number> = { competitor_id: competitor.id };

  if (source) {
    conditions.push('source_type = @source');
    values.source = source;
  }
  if (topic) {
    conditions.push('topic = @topic');
    values.topic = topic;
  }

  const rows = db
    .prepare(
      `SELECT * FROM collected_materials WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC, id DESC`,
    )
    .all(values) as CollectedMaterial[];

  return Response.json(rows);
}

export async function POST(req: Request, { params }: RouteContext) {
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

  const raw = body as Record<string, unknown>;
  const content = typeof raw.content === 'string' ? raw.content.trim() : '';

  if (content === '') {
    return Response.json({ error: '자료 내용을 입력하세요.' }, { status: 400 });
  }

  if (!isMaterialSource(raw.source_type)) {
    return Response.json({ error: '출처 구분이 올바르지 않습니다.' }, { status: 400 });
  }
  const source_type = raw.source_type;

  const source_name =
    typeof raw.source_name === 'string' && raw.source_name.trim() !== '' ? raw.source_name.trim() : null;
  const source_url =
    typeof raw.source_url === 'string' && raw.source_url.trim() !== '' ? raw.source_url.trim() : null;

  let topic: string | null = null;
  if (raw.topic !== undefined && raw.topic !== null && raw.topic !== '') {
    if (!isMaterialTopic(raw.topic)) {
      return Response.json({ error: '항목 태그가 올바르지 않습니다.' }, { status: 400 });
    }
    topic = raw.topic;
  }

  const { c: existingCount } = db
    .prepare('SELECT COUNT(*) AS c FROM collected_materials WHERE competitor_id = ?')
    .get(competitor.id) as { c: number };

  const result = db
    .prepare(
      `INSERT INTO collected_materials (competitor_id, content, source_type, source_name, source_url, topic)
       VALUES (@competitor_id, @content, @source_type, @source_name, @source_url, @topic)`,
    )
    .run({ competitor_id: competitor.id, content, source_type, source_name, source_url, topic });

  if (existingCount === 0) {
    const nextStatus = advanceStatus(competitor.status, '자료수집됨');
    if (nextStatus !== competitor.status) {
      db.prepare("UPDATE competitors SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
        nextStatus,
        competitor.id,
      );
    }
  }

  const created = getMaterial(db, result.lastInsertRowid as number);

  return Response.json(created, { status: 201 });
}
