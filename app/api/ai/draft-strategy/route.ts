import { spawn } from 'child_process';
import { getDB } from '@/lib/db';
import { getBenchmarkPoint } from '@/app/api/benchmark-points/shared';
import { getCompetitor } from '@/app/api/competitors/shared';
import type { BenchmarkPoint, CollectedMaterial, Competitor } from '@/types';

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

function buildPrompt(point: BenchmarkPoint, competitor: Competitor, materials: CollectedMaterial[]): string {
  const lines = [`경쟁사: ${competitor.name}`, `벤치마킹 지점: ${point.description}`];
  if (point.rationale) lines.push(`왜 따라 할 만한지: ${point.rationale}`);

  const materialLines =
    materials.length > 0
      ? materials.map((m) => `- ${m.content}${m.source_name ? ` (출처: ${m.source_name})` : ''}`).join('\n')
      : '(관련 수집 자료 없음)';

  return `다음 벤치마킹 지점을 실제로 실행하기 위한 단계별 실행 방법을 제안하라. 각 단계는 한두 문장으로, 실행 순서대로 나열할 것.

${lines.join('\n')}

관련 수집 자료:
${materialLines}

다음 JSON 한 덩어리로만 출력하라. JSON 외 다른 텍스트를 출력하지 말 것.
{
  "steps": ["첫 번째 단계 설명", "두 번째 단계 설명"]
}`;
}

export async function POST(req: Request) {
  const db = getDB();
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return Response.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const benchmarkPointId = Number((body as Record<string, unknown>).benchmarkPointId);
  const point = Number.isFinite(benchmarkPointId) ? getBenchmarkPoint(db, benchmarkPointId) : undefined;

  if (!point) {
    return Response.json({ error: '벤치마킹 지점을 찾을 수 없습니다.' }, { status: 404 });
  }

  const competitor = getCompetitor(db, point.competitor_id);
  if (!competitor) {
    return Response.json({ error: '경쟁사를 찾을 수 없습니다.' }, { status: 404 });
  }

  const materials = db
    .prepare('SELECT * FROM collected_materials WHERE competitor_id = ? AND topic = ? ORDER BY created_at DESC')
    .all(competitor.id, point.source_item) as CollectedMaterial[];

  const prompt = buildPrompt(point, competitor, materials);
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
