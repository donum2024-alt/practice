'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/StatusBadge';
import {
  COMPETITOR_STATUSES,
  SUMMARY_ITEM_KEYS,
  type Competitor,
  type Summary,
  type SummaryItemKey,
} from '@/types';

const ITEM_LABEL: Record<SummaryItemKey, string> = {
  SKU수: 'SKU 수',
  물류운영: '물류 운영 방식',
  가격책정: '가격 책정 방식',
  강점: '강점',
  차별화요소: '차별화 요소',
};

const ITEM_FIELD: Record<
  SummaryItemKey,
  keyof Pick<Summary, 'sku_count' | 'logistics' | 'pricing' | 'strengths' | 'differentiation'>
> = {
  SKU수: 'sku_count',
  물류운영: 'logistics',
  가격책정: 'pricing',
  강점: 'strengths',
  차별화요소: 'differentiation',
};

type CompareEntry = { competitor: Competitor; summary: Summary | null };

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  const seen = new Set<number>();
  for (const part of raw.split(',')) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0) seen.add(n);
  }
  return [...seen];
}

export default function ComparePage() {
  const router = useRouter();
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loadingCompetitors, setLoadingCompetitors] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [entries, setEntries] = useState<CompareEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  useEffect(() => {
    setSelectedIds(parseIds(new URLSearchParams(window.location.search).get('ids')));
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingCompetitors(true);
      const res = await fetch('/api/competitors');
      setCompetitors(res.ok ? await res.json() : []);
      setLoadingCompetitors(false);
    })();
  }, []);

  const sortedCompetitors = useMemo(() => {
    return [...competitors].sort((a, b) => {
      const rankDiff = COMPETITOR_STATUSES.indexOf(b.status) - COMPETITOR_STATUSES.indexOf(a.status);
      if (rankDiff !== 0) return rankDiff;
      return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0;
    });
  }, [competitors]);

  const syncUrl = useCallback(
    (ids: number[]) => {
      const query = ids.length > 0 ? `?ids=${ids.join(',')}` : '';
      router.replace(`/compare${query}`, { scroll: false });
    },
    [router],
  );

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id];
      syncUrl(next);
      return next;
    });
  }

  function remove(id: number) {
    setSelectedIds((prev) => {
      const next = prev.filter((v) => v !== id);
      syncUrl(next);
      return next;
    });
  }

  useEffect(() => {
    if (selectedIds.length < 2) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingEntries(true);
      const res = await fetch(`/api/summaries?competitorIds=${selectedIds.join(',')}`);
      const data: CompareEntry[] = res.ok ? await res.json() : [];
      if (!cancelled) setEntries(data);
      setLoadingEntries(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedIds]);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#0a0a0a]">경쟁사 비교</h1>
        <p className="text-sm text-[#555] mt-1">정리를 마쳤거나 진행 중인 경쟁사를 골라 항목별로 나란히 비교합니다.</p>
      </div>

      <Card title="비교할 경쟁사 선택">
        {loadingCompetitors ? (
          <p className="text-sm text-[#999] py-4 text-center">불러오는 중…</p>
        ) : sortedCompetitors.length === 0 ? (
          <p className="text-sm text-[#999] py-4 text-center">등록된 경쟁사가 없습니다.</p>
        ) : (
          <ul className="space-y-1 max-h-80 overflow-y-auto">
            {sortedCompetitors.map((competitor) => (
              <li key={competitor.id}>
                <label className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(competitor.id)}
                    onChange={() => toggle(competitor.id)}
                  />
                  <span className="text-sm text-[#0a0a0a] font-medium">{competitor.name}</span>
                  {competitor.mentioned_by_exec && <Badge color="orange">회장님 언급</Badge>}
                  <StatusBadge status={competitor.status} />
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {selectedIds.length < 2 ? (
        <Card>
          <p className="text-sm text-[#999] py-6 text-center">2곳 이상 선택하세요.</p>
        </Card>
      ) : (
        <Card title="비교 표">
          {loadingEntries ? (
            <p className="text-sm text-[#999] py-4 text-center">불러오는 중…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs text-[#999] border-b border-gray-100">
                    <th className="pb-2 pr-4 font-medium whitespace-nowrap">항목</th>
                    {entries.map(({ competitor, summary }) => (
                      <th key={competitor.id} className="pb-2 px-4 font-medium align-top min-w-[200px]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Link
                              href={`/competitors/${competitor.id}`}
                              className="text-[#0a0a0a] font-semibold hover:underline"
                            >
                              {competitor.name}
                            </Link>
                            {summary ? (
                              <Badge color={summary.confirmed ? 'teal' : 'gray'}>
                                {summary.confirmed ? '정리완료' : '초안'}
                              </Badge>
                            ) : (
                              <Badge color="slate">미시작</Badge>
                            )}
                          </div>
                          <button
                            onClick={() => remove(competitor.id)}
                            className="text-[#999] hover:text-[#0a0a0a] text-xs"
                            aria-label={`${competitor.name} 비교에서 제외`}
                          >
                            ✕
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SUMMARY_ITEM_KEYS.map((item) => (
                    <tr key={item} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pr-4 text-xs text-[#999] font-medium whitespace-nowrap align-top">
                        {ITEM_LABEL[item]}
                      </td>
                      {entries.map(({ competitor, summary }) => {
                        const value = summary ? summary[ITEM_FIELD[item]] : null;
                        return (
                          <td key={competitor.id} className="py-2.5 px-4 align-top text-[#333] whitespace-pre-wrap">
                            {value || <span className="text-[#bbb]">정리 안 됨</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
