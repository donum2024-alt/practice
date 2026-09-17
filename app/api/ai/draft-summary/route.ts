import { spawn } from 'child_process';
import { getDB } from '@/lib/db';
import { getCompetitor } from '@/app/api/competitors/shared';
import { MATERIAL_TOPICS, type CollectedMaterial, type Competitor } from '@/types';

function sseData(text: string): string {
  return `${text
    .split('\n')
    .map((line) => `data: ${line}`)
    .join('\n')}\n\n`;
}

function sseErrorEvent(text: string): string {
  return `event: error\n${text
    .split('\n')
    .map((line) => `data: ${line}`)
    .join('\n')}\n\n`;
}

function groupByTopic(materials: CollectedMaterial[]): Map<string, CollectedMaterial[]> {
  const groups = new Map<string, CollectedMaterial[]>();
  for (const material of materials) {
    const topic = material.topic ?? '기타';
    const list = groups.get(topic) ?? [];
    list.push(material);
    groups.set(topic, list);
  }
  return groups;
}

function buildPrompt(competitor: Competitor, materials: CollectedMaterial[]): string {
  const groups = groupByTopic(materials);
  const sections = MATERIAL_TOPICS.filter((topic) => groups.has(topic))
    .map((topic) => {
      const lines = (groups.get(topic) ?? [])
        .map((m) => `- ${m.content}${m.source_name ? ` (출처: ${m.source_name})` : ''}`)
        .join('\n');
      return `[${topic}]\n${lines}`;
    })
    .join('\n\n');

  return `다음은 경쟁사 "${competitor.name}"에 대해 이미 수집된 자료다. 이 자료만 근거로 SKU 수, 물류 운영 방식, 가격 책정 방식, 강점, 차별화 요소 5개 항목의 정리 초안을 작성하라. 새로운 사실을 추측하거나 자료에 없는 내용을 채우지 말 것. 특정 항목에 쓸 만한 자료가 없으면 그 항목은 draft를 빈 문자열로 두고 evidence에 "자료 부족"이라고 적을 것.

수집 자료 (항목별):
${sections}

다음 JSON 한 덩어리로만 출력하라. JSON 외 다른 텍스트를 출력하지 말 것.
{
  "items": {
    "SKU수": { "draft": "...", "evidence": "..." },
    "물류운영": { "draft": "...", "evidence": "..." },
    "가격책정": { "draft": "...", "evidence": "..." },
    "강점": { "draft": "...", "evidence": "..." },
    "차별화요소": { "draft": "...", "evidence": "..." }
  }
}`;
}

export async function POST(req: Request) {
  const db = getDB();
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const competitorId = Number((body as Record<string, unknown>).competitorId);
  const competitor = Number.isFinite(competitorId) ? getCompetitor(db, competitorId) : undefined;

  if (!competitor) {
    return Response.json({ error: '경쟁사를 찾을 수 없습니다.' }, { status: 404 });
  }

  const materials = db
    .prepare('SELECT * FROM collected_materials WHERE competitor_id = ? ORDER BY created_at DESC')
    .all(competitor.id) as CollectedMaterial[];

  if (materials.length === 0) {
    return Response.json({ error: '수집된 자료가 없습니다.' }, { status: 400 });
  }

  const prompt = buildPrompt(competitor, materials);
  const encoder = new TextEncoder();

  let child: ReturnType<typeof spawn> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // 이미 닫혔거나 취소된 스트림은 무시한다.
        }
      };

      const claude = spawn('claude', ['-p', prompt], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      child = claude;
      claude.stdin?.end();

      let stderr = '';

      claude.stdout?.on('data', (chunk) => {
        controller.enqueue(encoder.encode(sseData(chunk.toString())));
      });

      claude.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      claude.on('error', (err: NodeJS.ErrnoException) => {
        const message = err.code === 'ENOENT' ? 'claude CLI를 찾을 수 없습니다' : err.message;
        controller.enqueue(encoder.encode(sseErrorEvent(message)));
        close();
      });

      claude.on('close', (code) => {
        if (code !== 0 && code !== null) {
          const message = stderr.trim() || `claude가 종료 코드 ${code}로 종료되었습니다.`;
          controller.enqueue(encoder.encode(sseErrorEvent(message)));
        }
        close();
      });
    },
    cancel() {
      child?.kill();
    },
  });

  req.signal.addEventListener('abort', () => {
    child?.kill();
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
