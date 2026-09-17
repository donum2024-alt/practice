import { spawn } from 'child_process';
import { getDB } from '@/lib/db';
import { getCompetitor } from '@/app/api/competitors/shared';
import type { Competitor } from '@/types';

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

function buildPrompt(competitor: Competitor): string {
  const lines = [`경쟁사 이름: ${competitor.name}`];
  if (competitor.homepage) lines.push(`홈페이지: ${competitor.homepage}`);
  if (competitor.note) lines.push(`메모: ${competitor.note}`);

  return `다음 건설자재 유통 경쟁사를 웹에서 조사해, 홈페이지·뉴스·기사에서 확인되는 사실을 정리하라. 특히 SKU 수(취급 품목 수), 물류 운영 방식, 가격 책정 방식, 강점, 차별화 요소에 주목하라.

${lines.join('\n')}

각 항목에는 출처(매체명·사이트명 등)와 원문 링크를 반드시 함께 낼 것. 확인되지 않는 항목은 추측하지 말고 "자료 부족"으로 표시할 것.

다음 JSON 한 덩어리로만 출력하라. JSON 외 다른 텍스트를 출력하지 말 것.
{
  "materials": [
    { "content": "요지", "source_name": "출처 이름", "source_url": "원문 링크", "topic": "SKU수 | 물류운영 | 가격책정 | 강점 | 차별화요소 | 기타 중 하나 또는 생략" }
  ],
  "gaps": ["자료가 부족한 항목 설명"]
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

  const prompt = buildPrompt(competitor);
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

      const claude = spawn('claude', ['-p', prompt, '--allowedTools', 'WebSearch,WebFetch'], {
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
