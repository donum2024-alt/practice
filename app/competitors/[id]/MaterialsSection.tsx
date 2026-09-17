'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  MATERIAL_SOURCES,
  MATERIAL_TOPICS,
  type CollectedMaterial,
  type MaterialSource,
  type MaterialTopic,
} from '@/types';

type AiMaterialCandidate = {
  content: string;
  source_name?: string;
  source_url?: string;
  topic?: MaterialTopic;
};

type AiResult = {
  materials: AiMaterialCandidate[];
  gaps: string[];
};

const SOURCE_COLOR: Record<MaterialSource, 'blue' | 'gray' | 'purple'> = {
  웹검색: 'blue',
  직접입력: 'gray',
  지인회의: 'purple',
};

const EMPTY_MANUAL_FORM = {
  content: '',
  source_type: '직접입력' as MaterialSource,
  source_name: '',
  source_url: '',
  topic: '' as MaterialTopic | '',
};

function parseAiOutput(raw: string): AiResult {
  const withoutFences = raw.replace(/```json/gi, '').replace(/```/g, '');
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    throw new Error('JSON을 찾을 수 없습니다.');
  }

  const parsed = JSON.parse(withoutFences.slice(start, end + 1));

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.materials)) {
    throw new Error('형식이 올바르지 않습니다.');
  }

  return {
    materials: parsed.materials,
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
  };
}

export function MaterialsSection({
  competitorId,
  onMaterialsChanged,
}: {
  competitorId: number;
  onMaterialsChanged: () => void;
}) {
  const [materials, setMaterials] = useState<CollectedMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<MaterialSource | '전체'>('전체');
  const [topicFilter, setTopicFilter] = useState<MaterialTopic | '전체'>('전체');

  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL_FORM);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ content: '', source_name: '', source_url: '', topic: '' as MaterialTopic | '' });

  const [running, setRunning] = useState(false);
  const [rawText, setRawText] = useState('');
  const [rawOpen, setRawOpen] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [savingSelected, setSavingSelected] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (sourceFilter !== '전체') params.set('source', sourceFilter);
    if (topicFilter !== '전체') params.set('topic', topicFilter);
    const query = params.toString();
    const res = await fetch(`/api/competitors/${competitorId}/materials${query ? `?${query}` : ''}`);
    setMaterials(res.ok ? await res.json() : []);
    setLoading(false);
  }, [competitorId, sourceFilter, topicFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setManualSubmitting(true);
    setManualError(null);

    const res = await fetch(`/api/competitors/${competitorId}/materials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: manualForm.content,
        source_type: manualForm.source_type,
        source_name: manualForm.source_name || undefined,
        source_url: manualForm.source_url || undefined,
        topic: manualForm.topic || undefined,
      }),
    });

    setManualSubmitting(false);

    if (!res.ok) {
      setManualError('자료를 추가하지 못했습니다. 내용을 확인하세요.');
      return;
    }

    setManualForm(EMPTY_MANUAL_FORM);
    setManualOpen(false);
    load();
    onMaterialsChanged();
  }

  function startEdit(material: CollectedMaterial) {
    setEditingId(material.id);
    setEditForm({
      content: material.content,
      source_name: material.source_name ?? '',
      source_url: material.source_url ?? '',
      topic: material.topic ?? '',
    });
  }

  async function handleEditSave(id: number) {
    const res = await fetch(`/api/materials/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: editForm.content,
        source_name: editForm.source_name || null,
        source_url: editForm.source_url || null,
        topic: editForm.topic || null,
      }),
    });
    if (res.ok) {
      setEditingId(null);
      load();
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('이 자료를 삭제할까요?')) return;
    const res = await fetch(`/api/materials/${id}`, { method: 'DELETE' });
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

  async function handleCollect() {
    setRunning(true);
    setAiError(null);
    setRawText('');
    setRawOpen(true);
    setAiResult(null);
    setSelected(new Set());
    setSaveError(null);

    const controller = new AbortController();
    abortRef.current = controller;
    let fullText = '';
    let streamError: string | null = null;

    try {
      const res = await fetch('/api/ai/collect-materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitorId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setAiError('AI 자료 수집을 시작하지 못했습니다.');
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
        const parsed = parseAiOutput(fullText);
        setAiResult(parsed);
        setSelected(new Set(parsed.materials.map((_, index) => index)));
        setRawOpen(false);
      } catch {
        setAiError('AI 응답을 해석하지 못했습니다. 원문을 확인한 뒤 다시 시도하세요.');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setAiError('AI 자료 수집 중 오류가 발생했습니다.');
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

  async function handleSaveSelected() {
    if (!aiResult) return;
    setSavingSelected(true);
    setSaveError(null);

    const failed = new Set<number>();

    for (const index of selected) {
      const candidate = aiResult.materials[index];
      const res = await fetch(`/api/competitors/${competitorId}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: candidate.content,
          source_type: '웹검색',
          source_name: candidate.source_name,
          source_url: candidate.source_url,
          topic: candidate.topic,
        }),
      });
      if (!res.ok) failed.add(index);
    }

    setSavingSelected(false);
    load();
    onMaterialsChanged();

    if (failed.size > 0) {
      setSaveError(`${failed.size}건 저장에 실패했습니다. 내용을 확인한 뒤 다시 시도하세요.`);
      setSelected(failed);
      return;
    }

    setAiResult(null);
    setRawText('');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {running ? (
            <Button variant="danger" size="sm" onClick={handleAbort}>
              조사 중단
            </Button>
          ) : (
            <Button size="sm" onClick={handleCollect}>
              AI 자료 수집
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setManualOpen((v) => !v)}>
            {manualOpen ? '닫기' : '자료 직접 추가'}
          </Button>
        </div>
        <div className="flex gap-2">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as MaterialSource | '전체')}
            className="text-xs border border-[#e5e5e5] rounded-md px-2 py-1 text-[#555] focus:outline-none"
          >
            <option value="전체">출처 전체</option>
            {MATERIAL_SOURCES.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
          <select
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value as MaterialTopic | '전체')}
            className="text-xs border border-[#e5e5e5] rounded-md px-2 py-1 text-[#555] focus:outline-none"
          >
            <option value="전체">항목 전체</option>
            {MATERIAL_TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(running || rawText) && (
        <div className="border border-[#e5e5e5] rounded-md">
          <button
            onClick={() => setRawOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#555]"
          >
            <span>{running ? 'AI 조사 중…' : 'AI 조사 원문'}</span>
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
        <div className="text-sm text-red-600 flex items-center gap-2">
          <span>{aiError}</span>
          <Button size="sm" variant="secondary" onClick={handleCollect}>
            다시 시도
          </Button>
        </div>
      )}

      {aiResult && (
        <div className="border border-[#e5e5e5] rounded-md p-3 space-y-3">
          <p className="text-xs text-[#999]">
            AI가 찾은 자료 {aiResult.materials.length}건 중 필요한 항목만 선택해 저장하세요. 저장 전에는 반영되지
            않습니다.
          </p>
          <div className="space-y-2">
            {aiResult.materials.map((candidate, index) => (
              <label key={index} className="flex items-start gap-2 text-sm border-b border-gray-50 pb-2 last:border-0">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(index)}
                  onChange={() => toggleSelected(index)}
                />
                <div>
                  <p className="text-[#333]">{candidate.content}</p>
                  <p className="text-xs text-[#999] mt-0.5">
                    {candidate.source_name || '출처 미상'}
                    {candidate.source_url && (
                      <>
                        {' · '}
                        <a
                          href={candidate.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          원문 링크
                        </a>
                      </>
                    )}
                    {candidate.topic && (
                      <>
                        {' · '}
                        <Badge color="slate">{candidate.topic}</Badge>
                      </>
                    )}
                  </p>
                </div>
              </label>
            ))}
          </div>
          {aiResult.gaps.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2">
              <p className="text-xs font-medium text-yellow-800 mb-1">자료 부족 — 지인·회의로 보완하세요</p>
              <ul className="list-disc list-inside text-xs text-yellow-800 space-y-0.5">
                {aiResult.gaps.map((gap, index) => (
                  <li key={index}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAiResult(null)}>
              취소
            </Button>
            <Button size="sm" disabled={savingSelected || selected.size === 0} onClick={handleSaveSelected}>
              {savingSelected ? '저장 중…' : `선택한 ${selected.size}건 저장`}
            </Button>
          </div>
        </div>
      )}

      {manualOpen && (
        <form onSubmit={handleManualSubmit} className="border border-[#e5e5e5] rounded-md p-3 space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[#555]">내용</span>
            <textarea
              value={manualForm.content}
              onChange={(e) => setManualForm((f) => ({ ...f, content: e.target.value }))}
              required
              rows={3}
              className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#555]">출처 구분</span>
              <select
                value={manualForm.source_type}
                onChange={(e) => setManualForm((f) => ({ ...f, source_type: e.target.value as MaterialSource }))}
                className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none"
              >
                <option value="직접입력">직접입력</option>
                <option value="지인회의">지인회의</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#555]">항목</span>
              <select
                value={manualForm.topic}
                onChange={(e) => setManualForm((f) => ({ ...f, topic: e.target.value as MaterialTopic | '' }))}
                className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none"
              >
                <option value="">미분류</option>
                {MATERIAL_TOPICS.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#555]">출처 이름</span>
              <input
                value={manualForm.source_name}
                onChange={(e) => setManualForm((f) => ({ ...f, source_name: e.target.value }))}
                className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#555]">원문 링크</span>
              <input
                value={manualForm.source_url}
                onChange={(e) => setManualForm((f) => ({ ...f, source_url: e.target.value }))}
                className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
              />
            </label>
          </div>
          {manualError && <p className="text-sm text-red-600">{manualError}</p>}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={manualSubmitting}>
              {manualSubmitting ? '추가 중…' : '자료 추가'}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-[#999] py-4 text-center">불러오는 중…</p>
      ) : materials.length === 0 ? (
        <p className="text-sm text-[#999] py-4 text-center">수집된 자료가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {materials.map((material) => (
            <li key={material.id} className="border-b border-gray-50 pb-3 last:border-0">
              {editingId === material.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editForm.content}
                    onChange={(e) => setEditForm((f) => ({ ...f, content: e.target.value }))}
                    rows={3}
                    className="w-full border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={editForm.source_name}
                      onChange={(e) => setEditForm((f) => ({ ...f, source_name: e.target.value }))}
                      placeholder="출처 이름"
                      className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none"
                    />
                    <input
                      value={editForm.source_url}
                      onChange={(e) => setEditForm((f) => ({ ...f, source_url: e.target.value }))}
                      placeholder="원문 링크"
                      className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none"
                    />
                  </div>
                  <select
                    value={editForm.topic}
                    onChange={(e) => setEditForm((f) => ({ ...f, topic: e.target.value as MaterialTopic | '' }))}
                    className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none"
                  >
                    <option value="">미분류</option>
                    {MATERIAL_TOPICS.map((topic) => (
                      <option key={topic} value={topic}>
                        {topic}
                      </option>
                    ))}
                  </select>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      취소
                    </Button>
                    <Button size="sm" onClick={() => handleEditSave(material.id)}>
                      저장
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-[#333] whitespace-pre-wrap">{material.content}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge color={SOURCE_COLOR[material.source_type]}>{material.source_type}</Badge>
                    {material.topic && <Badge color="slate">{material.topic}</Badge>}
                    {material.source_name && <span className="text-xs text-[#999]">{material.source_name}</span>}
                    {material.source_url && (
                      <a
                        href={material.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#555] underline"
                      >
                        원문 링크
                      </a>
                    )}
                    <span className="text-xs text-[#999] font-mono ml-auto">{material.created_at}</span>
                    <button onClick={() => startEdit(material)} className="text-xs text-[#555] hover:underline">
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(material.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MaterialsSection;
