export interface SSEEvent {
  event: 'message' | 'error';
  data: string;
}

function parseFrame(frame: string): SSEEvent | null {
  if (!frame.trim()) return null;
  const lines = frame.split('\n');
  const isError = lines.some((line) => line.startsWith('event: error'));
  const data = lines
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))
    .join('\n');
  if (!data) return null;
  return { event: isError ? 'error' : 'message', data };
}

/** route가 반환한 SSE Response를 끝까지 읽어 이벤트 목록으로 만든다. */
export async function readSSE(res: Response): Promise<SSEEvent[]> {
  if (!res.body) return [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: SSEEvent[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const parsed = parseFrame(frame);
      if (parsed) events.push(parsed);
    }
  }
  const last = parseFrame(buffer);
  if (last) events.push(last);

  return events;
}

export function joinMessageData(events: SSEEvent[]): string {
  return events
    .filter((e) => e.event === 'message')
    .map((e) => e.data)
    .join('');
}
