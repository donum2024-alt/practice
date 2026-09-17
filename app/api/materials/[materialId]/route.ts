import { getDB } from '@/lib/db';
import { isMaterialTopic } from '@/types';
import { getMaterial } from '../shared';

type RouteContext = { params: Promise<{ materialId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const db = getDB();
  const { materialId } = await params;
  const material = getMaterial(db, Number(materialId));

  if (!material) {
    return Response.json({ error: '자료를 찾을 수 없습니다.' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const patch = body as Record<string, unknown>;
  const assignments: string[] = [];
  const values: Record<string, string | null> = {};

  if ('content' in patch) {
    const content = typeof patch.content === 'string' ? patch.content.trim() : '';
    if (content === '') {
      return Response.json({ error: '자료 내용을 입력하세요.' }, { status: 400 });
    }
    values.content = content;
    assignments.push('content = @content');
  }

  if ('source_name' in patch) {
    const raw = patch.source_name;
    values.source_name = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
    assignments.push('source_name = @source_name');
  }

  if ('source_url' in patch) {
    const raw = patch.source_url;
    values.source_url = typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
    assignments.push('source_url = @source_url');
  }

  if ('topic' in patch) {
    const raw = patch.topic;
    if (raw === null || raw === '') {
      values.topic = null;
    } else if (isMaterialTopic(raw)) {
      values.topic = raw;
    } else {
      return Response.json({ error: '항목 태그가 올바르지 않습니다.' }, { status: 400 });
    }
    assignments.push('topic = @topic');
  }

  if (assignments.length === 0) {
    return Response.json({ error: '변경할 항목이 없습니다.' }, { status: 400 });
  }

  db.prepare(`UPDATE collected_materials SET ${assignments.join(', ')} WHERE id = @id`).run({
    ...values,
    id: material.id,
  });

  return Response.json(getMaterial(db, material.id));
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const db = getDB();
  const { materialId } = await params;
  const material = getMaterial(db, Number(materialId));

  if (!material) {
    return Response.json({ error: '자료를 찾을 수 없습니다.' }, { status: 404 });
  }

  db.prepare('DELETE FROM collected_materials WHERE id = ?').run(material.id);

  return new Response(null, { status: 204 });
}
