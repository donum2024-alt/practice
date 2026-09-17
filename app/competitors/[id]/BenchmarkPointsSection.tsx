'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  BENCHMARK_REFLECTION_STATUSES,
  SUMMARY_ITEM_KEYS,
  type BenchmarkPoint,
  type BenchmarkReflectionStatus,
  type StrategyStep,
  type SummaryItemKey,
} from '@/types';

const ITEM_LABEL: Record<SummaryItemKey, string> = {
  SKU수: 'SKU 수',
  물류운영: '물류 운영 방식',
  가격책정: '가격 책정 방식',
  강점: '강점',
  차별화요소: '차별화 요소',
};

const STATUS_COLOR: Record<BenchmarkReflectionStatus, 'gray' | 'blue' | 'green' | 'yellow'> = {
  검토중: 'gray',
  전략수립됨: 'blue',
  사업반영됨: 'green',
  보류: 'yellow',
};

const EMPTY_FORM = {
  source_item: SUMMARY_ITEM_KEYS[0],
  description: '',
  rationale: '',
};

export function BenchmarkPointsSection({
  competitorId,
  onPointsChanged,
}: {
  competitorId: number;
  onPointsChanged: () => void;
}) {
  const [points, setPoints] = useState<BenchmarkPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const [editingPointId, setEditingPointId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/competitors/${competitorId}/benchmark-points`);
    setPoints(res.ok ? await res.json() : []);
    setLoading(false);
  }, [competitorId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/competitors/${competitorId}/benchmark-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_item: form.source_item,
        description: form.description,
        rationale: form.rationale || undefined,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      setError('벤치마킹 지점을 등록하지 못했습니다. 설명을 확인하세요.');
      return;
    }

    setForm(EMPTY_FORM);
    setFormOpen(false);
    load();
    onPointsChanged();
  }

  async function handleStatusChange(id: number, reflection_status: BenchmarkReflectionStatus) {
    const res = await fetch(`/api/benchmark-points/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reflection_status }),
    });
    if (res.ok) load();
  }

  function startEditPoint(point: BenchmarkPoint) {
    setEditingPointId(point.id);
    setEditForm({
      source_item: point.source_item,
      description: point.description,
      rationale: point.rationale ?? '',
    });
    setEditError(null);
  }

  async function saveEditPoint(id: number) {
    setEditSubmitting(true);
    setEditError(null);

    const res = await fetch(`/api/benchmark-points/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_item: editForm.source_item,
        description: editForm.description,
        rationale: editForm.rationale || null,
      }),
    });

    setEditSubmitting(false);

    if (!res.ok) {
      setEditError('수정하지 못했습니다. 설명을 확인하세요.');
      return;
    }

    setEditingPointId(null);
    load();
  }

  function startNoteEdit(point: BenchmarkPoint) {
    setEditingNoteId(point.id);
    setNoteDraft(point.result_note ?? '');
  }

  async function saveNote(id: number) {
    const res = await fetch(`/api/benchmark-points/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result_note: noteDraft }),
    });
    if (res.ok) {
      setEditingNoteId(null);
      load();
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('이 벤치마킹 지점을 삭제할까요?')) return;
    const res = await fetch(`/api/benchmark-points/${id}`, { method: 'DELETE' });
    if (res.ok) load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? '닫기' : '벤치마킹 지점 등록'}
        </Button>
      </div>

      {formOpen && (
        <form onSubmit={handleSubmit} className="border border-[#e5e5e5] rounded-md p-3 space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[#555]">출처 항목</span>
            <select
              value={form.source_item}
              onChange={(e) => setForm((f) => ({ ...f, source_item: e.target.value as SummaryItemKey }))}
              className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none"
            >
              {SUMMARY_ITEM_KEYS.map((item) => (
                <option key={item} value={item}>
                  {ITEM_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[#555]">무엇을 따라 할 것인지</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              required
              rows={2}
              className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[#555]">왜 따라 할 만한지 (선택)</span>
            <textarea
              value={form.rationale}
              onChange={(e) => setForm((f) => ({ ...f, rationale: e.target.value }))}
              rows={2}
              className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? '등록 중…' : '등록'}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-[#999] py-4 text-center">불러오는 중…</p>
      ) : points.length === 0 ? (
        <p className="text-sm text-[#999] py-4 text-center">등록된 벤치마킹 지점이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {points.map((point) => (
            <li key={point.id} className="border-b border-gray-50 pb-3 last:border-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge color="slate">{ITEM_LABEL[point.source_item]}</Badge>
                <Badge color={STATUS_COLOR[point.reflection_status]}>{point.reflection_status}</Badge>
                <select
                  value={point.reflection_status}
                  onChange={(e) => handleStatusChange(point.id, e.target.value as BenchmarkReflectionStatus)}
                  className="text-xs border border-[#e5e5e5] rounded-md px-2 py-1 text-[#555] focus:outline-none"
                >
                  {BENCHMARK_REFLECTION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2 ml-auto">
                  {editingPointId !== point.id && (
                    <button onClick={() => startEditPoint(point)} className="text-xs text-[#555] hover:underline">
                      수정
                    </button>
                  )}
                  <button onClick={() => handleDelete(point.id)} className="text-xs text-red-600 hover:underline">
                    삭제
                  </button>
                </div>
              </div>
              {editingPointId === point.id ? (
                <div className="mt-2 space-y-2">
                  <select
                    value={editForm.source_item}
                    onChange={(e) => setEditForm((f) => ({ ...f, source_item: e.target.value as SummaryItemKey }))}
                    className="border border-[#e5e5e5] rounded-md px-2 py-1.5 text-sm focus:outline-none"
                  >
                    {SUMMARY_ITEM_KEYS.map((item) => (
                      <option key={item} value={item}>
                        {ITEM_LABEL[item]}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    placeholder="무엇을 따라 할 것인지"
                    className="w-full border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
                  />
                  <textarea
                    value={editForm.rationale}
                    onChange={(e) => setEditForm((f) => ({ ...f, rationale: e.target.value }))}
                    rows={2}
                    placeholder="왜 따라 할 만한지 (선택)"
                    className="w-full border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
                  />
                  {editError && <p className="text-sm text-red-600">{editError}</p>}
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingPointId(null)}>
                      취소
                    </Button>
                    <Button size="sm" disabled={editSubmitting} onClick={() => saveEditPoint(point.id)}>
                      {editSubmitting ? '저장 중…' : '저장'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-[#333] whitespace-pre-wrap mt-1.5">{point.description}</p>
                  {point.rationale && (
                    <p className="text-xs text-[#999] whitespace-pre-wrap mt-1">근거 — {point.rationale}</p>
                  )}
                </>
              )}
              <div className="mt-2">
                {editingNoteId === point.id ? (
                  <div className="space-y-1.5">
                    <textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      rows={2}
                      placeholder="결과 메모"
                      className="w-full border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingNoteId(null)}>
                        취소
                      </Button>
                      <Button size="sm" onClick={() => saveNote(point.id)}>
                        저장
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => startNoteEdit(point)}
                    className="text-xs text-[#555] hover:underline text-left w-full"
                  >
                    {point.result_note ? `결과 메모 — ${point.result_note}` : '결과 메모 추가'}
                  </button>
                )}
              </div>
              <p className="text-xs text-[#999] font-mono mt-1.5">
                등록 {point.created_at} · 마지막 수정 {point.updated_at}
              </p>
              <button
                onClick={() => toggleExpanded(point.id)}
                className="text-xs text-[#555] hover:underline mt-2"
              >
                {expanded.has(point.id) ? '실행 전략 접기' : '실행 전략 보기'}
              </button>
              {expanded.has(point.id) && <StrategyStepsPanel pointId={point.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StrategyStepsPanel({ pointId }: { pointId: number }) {
  const [steps, setSteps] = useState<StrategyStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [addValue, setAddValue] = useState('');
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const [running, setRunning] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawOpen, setRawOpen] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSteps, setAiSteps] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [savingSelected, setSavingSelected] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/benchmark-points/${pointId}/steps`);
    setSteps(res.ok ? await res.json() : []);
    setLoading(false);
  }, [pointId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const description = addValue.trim();
    if (!description) return;

    setAdding(true);
    setListError(null);

    const res = await fetch(`/api/benchmark-points/${pointId}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    });

    setAdding(false);

    if (!res.ok) {
      setListError('단계를 추가하지 못했습니다.');
      return;
    }

    setAddValue('');
    load();
  }

  function startEdit(step: StrategyStep) {
    setEditingId(step.id);
    setEditDraft(step.description);
  }

  async function saveEdit(id: number) {
    const description = editDraft.trim();
    if (!description) return;

    const res = await fetch(`/api/strategy-steps/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    });

    if (res.ok) {
      setEditingId(null);
      load();
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('이 단계를 삭제할까요?')) return;
    const res = await fetch(`/api/strategy-steps/${id}`, { method: 'DELETE' });
    if (res.ok) load();
  }

  async function handleMove(id: number, direction: 'up' | 'down') {
    const res = await fetch(`/api/strategy-steps/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
    if (res.ok) load();
  }

  function processEvent(part: string, onData: (text: string) => void, onError: (message: string) => void) {
    const lines = part.split('\n');
    const isError = lines.some((line) => line.startsWith('event: error'));
    const data = lines
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice('data: '.length))
      .join('\n');

    if (!data) return;
    if (isError) {
      onError(data);
    } else {
      onData(data);
    }
  }

  function parseAiSteps(raw: string): string[] {
    const withoutFences = raw.replace(/```json/gi, '').replace(/```/g, '');
    const start = withoutFences.indexOf('{');
    const end = withoutFences.lastIndexOf('}');

    if (start === -1 || end === -1 || end < start) {
      throw new Error('JSON을 찾을 수 없습니다.');
    }

    const parsed = JSON.parse(withoutFences.slice(start, end + 1));

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.steps)) {
      throw new Error('형식이 올바르지 않습니다.');
    }

    return parsed.steps.filter((step: unknown): step is string => typeof step === 'string');
  }

  async function handleDraft() {
    setRunning(true);
    setAiError(null);
    setRawText('');
    setRawOpen(true);
    setAiSteps(null);
    setSelected(new Set());
    setSaveError(null);

    const controller = new AbortController();
    abortRef.current = controller;
    let fullText = '';
    let streamError: string | null = null;

    try {
      const res = await fetch('/api/ai/draft-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ benchmarkPointId: pointId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setAiError('AI 초안 제안을 시작하지 못했습니다.');
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const onData = (text: string) => {
        fullText += text;
        setRawText((prev) => prev + text);
      };
      const onError = (message: string) => {
        streamError = message;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) processEvent(part, onData, onError);
      }
      if (buffer) processEvent(buffer, onData, onError);

      if (streamError) {
        setAiError(streamError);
        return;
      }

      try {
        const parsedSteps = parseAiSteps(fullText);
        setAiSteps(parsedSteps);
        setSelected(new Set(parsedSteps.map((_, index) => index)));
        setRawOpen(false);
      } catch {
        setAiError('AI 응답을 해석하지 못했습니다. 원문을 확인한 뒤 다시 시도하세요.');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setAiError('AI 초안 제안 중 오류가 발생했습니다.');
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function handleAbort() {
    abortRef.current?.abort();
  }

  function toggleSelected(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function updateAiStep(index: number, description: string) {
    setAiSteps((prev) => (prev ? prev.map((step, i) => (i === index ? description : step)) : prev));
  }

  async function handleSaveSelected() {
    if (!aiSteps) return;
    setSavingSelected(true);
    setSaveError(null);

    const failed = new Set<number>();
    // 화면에 보이는 순서(AI가 제안한 순서)대로 저장한다 — 체크박스를 해제/재선택해도
    // Set의 삽입 순서에 흔들리지 않도록, 저장 순서는 항상 aiSteps 배열 순서를 기준으로 계산한다.
    const orderedIndices = aiSteps.map((_, index) => index).filter((index) => selected.has(index));

    for (const index of orderedIndices) {
      const res = await fetch(`/api/benchmark-points/${pointId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: aiSteps[index] }),
      });
      if (!res.ok) failed.add(index);
    }

    setSavingSelected(false);
    load();

    if (failed.size > 0) {
      setSaveError(`${failed.size}건 저장에 실패했습니다. 내용을 확인한 뒤 다시 시도하세요.`);
      setSelected(failed);
      return;
    }

    setAiSteps(null);
    setRawText('');
  }

  return (
    <div className="mt-2 border-t border-gray-100 pt-2.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#555]">실행 단계</p>
        {running ? (
          <Button variant="danger" size="sm" onClick={handleAbort}>
            AI 제안 중단
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={handleDraft}>
            AI 초안 제안
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-[#999]">불러오는 중…</p>
      ) : steps.length === 0 ? (
        <p className="text-xs text-[#999]">아직 실행 전략 없음</p>
      ) : (
        <ol className="space-y-1.5">
          {steps.map((step, index) => (
            <li key={step.id} className="flex items-start gap-2 text-sm">
              <span className="text-xs text-[#999] font-mono mt-0.5">{index + 1}.</span>
              {editingId === step.id ? (
                <div className="flex-1 space-y-1.5">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={2}
                    className="w-full border border-[#e5e5e5] rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-[#0a0a0a]"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      취소
                    </Button>
                    <Button size="sm" onClick={() => saveEdit(step.id)}>
                      저장
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-start justify-between gap-2">
                  <p className="text-[#333] whitespace-pre-wrap">{step.description}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleMove(step.id, 'up')}
                      disabled={index === 0}
                      className="text-xs text-[#555] hover:underline disabled:opacity-30 disabled:pointer-events-none"
                    >
                      위로
                    </button>
                    <button
                      onClick={() => handleMove(step.id, 'down')}
                      disabled={index === steps.length - 1}
                      className="text-xs text-[#555] hover:underline disabled:opacity-30 disabled:pointer-events-none"
                    >
                      아래로
                    </button>
                    <button onClick={() => startEdit(step)} className="text-xs text-[#555] hover:underline">
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(step.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {listError && <p className="text-xs text-red-600">{listError}</p>}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          placeholder="단계 추가"
          className="flex-1 border border-[#e5e5e5] rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-[#0a0a0a]"
        />
        <Button type="submit" size="sm" disabled={adding || addValue.trim() === ''}>
          추가
        </Button>
      </form>

      {(running || rawText) && (
        <div className="border border-[#e5e5e5] rounded-md">
          <button
            onClick={() => setRawOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#555]"
          >
            <span>{running ? 'AI 제안 중…' : 'AI 제안 원문'}</span>
            <span>{rawOpen ? '접기' : '펼치기'}</span>
          </button>
          {rawOpen && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-3 pb-3 text-xs text-[#333]">
              {rawText || '…'}
            </pre>
          )}
        </div>
      )}

      {aiError && (
        <div className="text-xs text-red-600 flex items-center gap-2">
          <span>{aiError}</span>
          <Button size="sm" variant="secondary" onClick={handleDraft}>
            다시 시도
          </Button>
        </div>
      )}

      {aiSteps && (
        <div className="border border-[#e5e5e5] rounded-md p-3 space-y-3">
          <p className="text-xs text-[#999]">
            AI가 제안한 단계 {aiSteps.length}건 중 필요한 것만 선택해 저장하세요. 저장 전에는 반영되지 않습니다.
          </p>
          <div className="space-y-2">
            {aiSteps.map((description, index) => (
              <div key={index} className="flex items-start gap-2 text-sm border-b border-gray-50 pb-2 last:border-0">
                <input
                  type="checkbox"
                  className="mt-2"
                  checked={selected.has(index)}
                  onChange={() => toggleSelected(index)}
                />
                <textarea
                  value={description}
                  onChange={(e) => updateAiStep(index, e.target.value)}
                  rows={2}
                  className="flex-1 border border-[#e5e5e5] rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-[#0a0a0a]"
                />
              </div>
            ))}
          </div>
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAiSteps(null)}>
              취소
            </Button>
            <Button size="sm" disabled={savingSelected || selected.size === 0} onClick={handleSaveSelected}>
              {savingSelected ? '저장 중…' : `선택한 ${selected.size}건 저장`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BenchmarkPointsSection;
