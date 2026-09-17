'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import {
  BENCHMARK_REFLECTION_STATUSES,
  type BenchmarkPointWithCompetitor,
  type BenchmarkReflectionStatus,
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

export default function BenchmarksPage() {
  const [statusFilter, setStatusFilter] = useState<BenchmarkReflectionStatus | '전체'>('전체');
  const [points, setPoints] = useState<BenchmarkPointWithCompetitor[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const query = statusFilter !== '전체' ? `?status=${encodeURIComponent(statusFilter)}` : '';
    const res = await fetch(`/api/benchmark-points${query}`);
    setPoints(res.ok ? await res.json() : []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#0a0a0a]">벤치마킹 지점</h1>
        <p className="text-sm text-[#555] mt-1">모든 경쟁사의 벤치마킹 지점을 사업 반영 상태로 걸러 봅니다.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(['전체', ...BENCHMARK_REFLECTION_STATUSES] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={clsx(
              'px-3 py-2 text-sm border-b-2 -mb-px transition-colors',
              statusFilter === status
                ? 'border-[#0a0a0a] text-[#0a0a0a] font-medium'
                : 'border-transparent text-[#999] hover:text-[#555]',
            )}
          >
            {status}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-[#999] py-4 text-center">불러오는 중…</p>
        ) : points.length === 0 ? (
          <p className="text-sm text-[#999] py-4 text-center">해당하는 벤치마킹 지점이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {points.map((point) => (
              <li key={point.id} className="border-b border-gray-50 pb-3 last:border-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/competitors/${point.competitor_id}`}
                    className="text-sm font-medium text-[#0a0a0a] hover:underline"
                  >
                    {point.competitor_name}
                  </Link>
                  <Link
                    href={`/competitors/${point.competitor_id}#summary-${point.source_item}`}
                    className="hover:underline"
                  >
                    <Badge color="slate">{ITEM_LABEL[point.source_item]}</Badge>
                  </Link>
                  <Badge color={STATUS_COLOR[point.reflection_status]}>{point.reflection_status}</Badge>
                </div>
                <p className="text-sm text-[#333] whitespace-pre-wrap mt-1.5">{point.description}</p>
                {point.rationale && (
                  <p className="text-xs text-[#999] whitespace-pre-wrap mt-1">근거 — {point.rationale}</p>
                )}
                {point.result_note && (
                  <p className="text-xs text-[#555] whitespace-pre-wrap mt-1">결과 메모 — {point.result_note}</p>
                )}
                <p className="text-xs text-[#999] font-mono mt-1.5">
                  등록 {point.created_at} · 마지막 수정 {point.updated_at}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
