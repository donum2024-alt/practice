'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SUMMARY_ITEM_KEYS, type CollectedMaterial, type Summary, type SummaryItemKey } from '@/types';

const ITEM_LABEL: Record<SummaryItemKey, string> = {
  SKU수: 'SKU 수',
  물류운영: '물류 운영 방식',
  가격책정: '가격 책정 방식',
  강점: '강점',
  차별화요소: '차별화 요소',
};

const ITEM_FIELD: Record<SummaryItemKey, keyof Pick<Summary, 'sku_count' | 'logistics' | 'pricing' | 'strengths' | 'differentiation'>> = {
  SKU수: 'sku_count',
  물류운영: 'logistics',
  가격책정: 'pricing',
  강점: 'strengths',
  차별화요소: 'differentiation',
};

type DraftState = Record<SummaryItemKey, string>;

function toDraft(summary: Summary): DraftState {
  return {
    SKU수: summary.sku_count ?? '',
    물류운영: summary.logistics ?? '',
    가격책정: summary.pricing ?? '',
    강점: summary.strengths ?? '',
    차별화요소: summary.differentiation ?? '',
  };
}

type DraftItemResult = { draft: string; evidence: string };
type DraftResult = Record<SummaryItemKey, DraftItemResult>;

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

function parseDraftOutput(raw: string): DraftResult {
  const withoutFences = raw.replace(/```json/gi, '').replace(/```/g, '');
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    throw new Error('JSON을 찾을 수 없습니다.');
  }

  const parsed = JSON.parse(withoutFences.slice(start, end + 1));

  if (!parsed || typeof parsed !== 'object' || !parsed.items || typeof parsed.items !== 'object') {
    throw new Error('형식이 올바르지 않습니다.');
  }

  const items = parsed.items as Record<string, unknown>;
  const result = {} as DraftResult;

  for (const key of SUMMARY_ITEM_KEYS) {
    const entry = items[key];
    if (!entry || typeof entry !== 'object') {
      throw new Error('형식이 올바르지 않습니다.');
    }
    const entryRecord = entry as Record<string, unknown>;
    result[key] = {
      draft: typeof entryRecord.draft === 'string' ? entryRecord.draft : '',
      evidence: typeof entryRecord.evidence === 'string' ? entryRecord.evidence : '',
    };
  }

  return result;
}

export function ItemSummarySection({ competitorId }: { competitorId: number }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [materials, setMaterials] = useState<Record<SummaryItemKey, CollectedMaterial[]>>(
    {} as Record<SummaryItemKey, CollectedMaterial[]>,
  );
  const [loading, setLoading] = useState(true);
  const [savingItem, setSavingItem] = useState<SummaryItemKey | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [materialsCount, setMaterialsCount] = useState<number | null>(null);
  const [draftRunning, setDraftRunning] = useState(false);
  const [draftRawText, setDraftRawText] = useState('');
  const [draftRawOpen, setDraftRawOpen] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftResult, setDraftResult] = useState<DraftResult | null>(null);
  const [adoptedItems, setAdoptedItems] = useState<Set<SummaryItemKey>>(new Set());
  const draftAbortRef = useRef<AbortController | null>(null);

  const loadSummary = useCallback(async () => {
    const res = await fetch(`/api/competitors/${competitorId}/summary`);
    if (!res.ok) return;
    const data: Summary = await res.json();
    setSummary(data);
    setDraft(toDraft(data));
  }, [competitorId]);

  const loadMaterials = useCallback(async () => {
    const entries = await Promise.all(
      SUMMARY_ITEM_KEYS.map(async (item) => {
        const res = await fetch(`/api/competitors/${competitorId}/materials?topic=${encodeURIComponent(item)}`);
        const list: CollectedMaterial[] = res.ok ? await res.json() : [];
        return [item, list] as const;
      }),
    );
    setMaterials(Object.fromEntries(entries) as Record<SummaryItemKey, CollectedMaterial[]>);
  }, [competitorId]);

  const loadMaterialsCount = useCallback(async () => {
    const res = await fetch(`/api/competitors/${competitorId}/materials`);
    const list: CollectedMaterial[] = res.ok ? await res.json() : [];
    setMaterialsCount(list.length);
  }, [competitorId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadSummary(), loadMaterials(), loadMaterialsCount()]).finally(() => setLoading(false));
  }, [loadSummary, loadMaterials, loadMaterialsCount]);

  function updateDraft(item: SummaryItemKey, value: string) {
    setDraft((prev) => (prev ? { ...prev, [item]: value } : prev));
  }

  function copyMaterial(item: SummaryItemKey, content: string) {
    setDraft((prev) => {
      if (!prev) return prev;
      const current = prev[item];
      const merged = current ? `${current}\n${content}` : content;
      return { ...prev, [item]: merged };
    });
  }

  async function saveItem(item: SummaryItemKey) {
    if (!draft) return;
    setSavingItem(item);
    setError(null);

    const res = await fetch(`/api/competitors/${competitorId}/summary`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [ITEM_FIELD[item]]: draft[item] }),
    });

    setSavingItem(null);

    if (!res.ok) {
      setError(`'${ITEM_LABEL[item]}' 항목을 저장하지 못했습니다.`);
      return;
    }

    const updated: Summary = await res.json();
    setSummary(updated);
    setDraft(toDraft(updated));
  }

  async function toggleConfirmed() {
    if (!summary) return;
    setConfirming(true);
    setError(null);

    const res = await fetch(`/api/competitors/${competitorId}/summary`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: !summary.confirmed }),
    });

    setConfirming(false);

    if (!res.ok) {
      setError('확정 상태를 변경하지 못했습니다.');
      return;
    }

    const updated: Summary = await res.json();
    setSummary(updated);
    setDraft(toDraft(updated));
  }

  async function handleDraftGenerate() {
    setDraftRunning(true);
    setDraftError(null);
    setDraftRawText('');
    setDraftRawOpen(true);
    setDraftResult(null);
    setAdoptedItems(new Set());

    const controller = new AbortController();
    draftAbortRef.current = controller;
    let fullText = '';
    let streamError: string | null = null;

    try {
      const res = await fetch('/api/ai/draft-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setDraftError(data?.error ?? 'AI 초안 생성을 시작하지 못했습니다.');
        setDraftRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const onData = (text: string) => {
        fullText += text;
        setDraftRawText((prev) => prev + text);
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
        setDraftError(streamError);
        return;
      }

      try {
        const parsed = parseDraftOutput(fullText);
        setDraftResult(parsed);
        setAdoptedItems(new Set(SUMMARY_ITEM_KEYS.filter((item) => parsed[item].draft.trim() !== '')));
        setDraftRawOpen(false);
      } catch {
        setDraftError('AI 응답을 해석하지 못했습니다. 원문을 확인한 뒤 다시 시도하세요.');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setDraftError('AI 초안 생성 중 오류가 발생했습니다.');
      }
    } finally {
      setDraftRunning(false);
      draftAbortRef.current = null;
    }
  }

  function handleDraftAbort() {
    draftAbortRef.current?.abort();
  }

  function toggleAdopted(item: SummaryItemKey) {
    setAdoptedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }

  function handleReflectAdopted() {
    if (!draftResult) return;

    setDraft((prev) => {
      if (!prev) return prev;
      const next = { ...prev };

      for (const item of SUMMARY_ITEM_KEYS) {
        if (!adoptedItems.has(item)) continue;
        const draftText = draftResult[item].draft;
        if (draftText.trim() === '') continue;

        if (next[item].trim() !== '') {
          const overwrite = window.confirm(
            `'${ITEM_LABEL[item]}' 항목에 이미 작성된 내용이 있습니다. AI 초안으로 덮어쓸까요?`,
          );
          if (!overwrite) continue;
        }

        next[item] = draftText;
      }

      return next;
    });
  }

  if (loading || !summary || !draft) {
    return <p className="text-sm text-[#999] py-4 text-center">불러오는 중…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge color={summary.confirmed ? 'teal' : 'gray'}>{summary.confirmed ? '정리완료' : '초안'}</Badge>
          <span className="text-xs text-[#999] font-mono">
            {summary.confirmed && `확정 ${summary.confirmed_at ?? '—'}`}
            {summary.confirmed && summary.updated_at && ' · '}
            {summary.updated_at
              ? `최근 저장 ${summary.updated_at}`
              : !summary.confirmed && '아직 저장되지 않음'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a href="#materials-section" className="text-xs text-[#555] hover:underline">
            수집 자료 전체 보기
          </a>
          <Button
            variant={summary.confirmed ? 'secondary' : 'primary'}
            size="sm"
            disabled={confirming}
            onClick={toggleConfirmed}
          >
            {confirming ? '처리 중…' : summary.confirmed ? '확정 취소' : '정리 완료로 확정'}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="border border-[#e5e5e5] rounded-md p-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-medium text-[#333]">AI 초안 생성</p>
            <p className="text-xs text-[#999] mt-0.5">
              새로 웹을 검색하지 않고, 이미 모아둔 수집 자료만 근거로 5개 항목의 초안과 근거를 만듭니다. 반영해도
              저장 버튼을 눌러야 확정됩니다.
            </p>
          </div>
          {materialsCount === 0 ? (
            <span className="text-xs text-[#999]">수집된 자료가 없어 AI 초안을 생성할 수 없습니다. 먼저 수집 자료를 추가하세요.</span>
          ) : draftRunning ? (
            <Button variant="danger" size="sm" onClick={handleDraftAbort}>
              생성 중단
            </Button>
          ) : (
            <Button size="sm" disabled={materialsCount === null} onClick={handleDraftGenerate}>
              AI 초안 생성
            </Button>
          )}
        </div>

        {(draftRunning || draftRawText) && (
          <div className="border border-[#e5e5e5] rounded-md">
            <button
              onClick={() => setDraftRawOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#555]"
            >
              <span>{draftRunning ? 'AI 초안 생성 중…' : 'AI 초안 원문'}</span>
              <span>{draftRawOpen ? '접기' : '펼치기'}</span>
            </button>
            {draftRawOpen && (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-3 pb-3 text-xs text-[#333]">
                {draftRawText || '…'}
              </pre>
            )}
          </div>
        )}

        {draftError && (
          <div className="text-sm text-red-600 flex items-center gap-2">
            <span>{draftError}</span>
            <Button size="sm" variant="secondary" onClick={handleDraftGenerate}>
              다시 시도
            </Button>
          </div>
        )}

        {draftResult && (
          <div className="space-y-3">
            <div className="space-y-2">
              {SUMMARY_ITEM_KEYS.map((item) => {
                const result = draftResult[item];
                const hasDraft = result.draft.trim() !== '';
                return (
                  <div key={item} className="border border-gray-100 rounded-md p-2">
                    <div className="flex items-start gap-2">
                      {hasDraft ? (
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={adoptedItems.has(item)}
                          onChange={() => toggleAdopted(item)}
                        />
                      ) : (
                        <Badge color="yellow">자료 부족</Badge>
                      )}
                      <div className="flex-1">
                        <p className="text-xs font-medium text-[#333]">{ITEM_LABEL[item]}</p>
                        {hasDraft && (
                          <p className="text-sm text-[#333] whitespace-pre-wrap mt-0.5">{result.draft}</p>
                        )}
                        <p className="text-xs text-[#999] mt-1">근거: {result.evidence}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraftResult(null)}>
                닫기
              </Button>
              <Button size="sm" disabled={adoptedItems.size === 0} onClick={handleReflectAdopted}>
                선택한 항목 반영
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {SUMMARY_ITEM_KEYS.map((item) => {
          const relatedMaterials = materials[item] ?? [];
          return (
            <div key={item} id={`summary-${item}`} className="grid grid-cols-2 gap-4 scroll-mt-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-[#333]">{ITEM_LABEL[item]}</span>
                <textarea
                  value={draft[item]}
                  onChange={(e) => updateDraft(item, e.target.value)}
                  rows={5}
                  className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
                />
                <div className="flex justify-end">
                  <Button size="sm" disabled={savingItem === item} onClick={() => saveItem(item)}>
                    {savingItem === item ? '저장 중…' : '저장'}
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs text-[#999]">관련 수집 자료</span>
                {relatedMaterials.length === 0 ? (
                  <div className="border border-dashed border-[#e5e5e5] rounded-md px-3 py-4 text-center">
                    <p className="text-xs text-[#999]">관련 자료 없음</p>
                  </div>
                ) : (
                  <ul className="space-y-2 max-h-56 overflow-auto">
                    {relatedMaterials.map((material) => (
                      <li key={material.id} className="border border-[#e5e5e5] rounded-md p-2">
                        <p className="text-xs text-[#333] whitespace-pre-wrap">{material.content}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[11px] text-[#999]">{material.source_name || material.source_type}</span>
                          <button
                            onClick={() => copyMaterial(item, material.content)}
                            className="text-[11px] text-[#0a0a0a] hover:underline"
                          >
                            이 내용 복사
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ItemSummarySection;
