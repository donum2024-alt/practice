import { vi } from 'vitest';
import { EventEmitter } from 'node:events';

/**
 * `child_process.spawn`을 대체하는 스텁. `app/api/ai/*`는 `import { spawn } from 'child_process'`를
 * 직접 쓰므로, 테스트 파일에서 `vi.mock('child_process', () => ({ spawn: fakeSpawn }))`로 교체한다.
 *
 * vi.resetModules()는 mock 모듈도 다시 평가하므로, 상태를 모듈 최상위 const에 두면
 * 테스트가 읽는 객체와 다음 라우트 import가 실제로 호출하는 fakeSpawn의 객체가 갈라진다.
 * 그래서 상태는 globalThis에 고정한다.
 */

export class FakeChildProcess extends EventEmitter {
  stdin = { end: vi.fn() };
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
}

export interface SpawnCall {
  command: string;
  args: string[];
  options: unknown;
  child: FakeChildProcess;
}

interface SpawnStubState {
  calls: SpawnCall[];
}

declare global {
  // eslint-disable-next-line no-var
  var __spawnStubState: SpawnStubState | undefined;
}

function state(): SpawnStubState {
  if (!globalThis.__spawnStubState) {
    globalThis.__spawnStubState = { calls: [] };
  }
  return globalThis.__spawnStubState;
}

export function resetSpawnStub(): void {
  state().calls = [];
}

export function getSpawnCalls(): SpawnCall[] {
  return state().calls;
}

export function lastSpawnCall(): SpawnCall {
  const calls = state().calls;
  const call = calls[calls.length - 1];
  if (!call) throw new Error('spawn이 호출되지 않았습니다.');
  return call;
}

export function fakeSpawn(command: string, args: string[] = [], options?: unknown): FakeChildProcess {
  const child = new FakeChildProcess();
  state().calls.push({ command, args, options, child });
  return child;
}
