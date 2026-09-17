'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/StatusBadge';
import { COMPETITOR_STATUSES, isCompetitorStatus, type Competitor, type CompetitorStatus } from '@/types';

type Filter = CompetitorStatus | '전체';
type SortMode = 'created' | 'updated';

const FILTERS: Filter[] = ['전체', ...COMPETITOR_STATUSES];

const EMPTY_FORM = {
  name: '',
  homepage: '',
  note: '',
  mentioned_by_exec: false,
};

export default function CompetitorsPage() {
  const [filter, setFilter] = useState<Filter>('전체');
  const [sortMode, setSortMode] = useState<SortMode>('updated');
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const query = filter === '전체' ? '' : `?status=${encodeURIComponent(filter)}`;
    const res = await fetch(`/api/competitors${query}`);
    setCompetitors(res.ok ? await res.json() : []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('status');
    if (status && isCompetitorStatus(status)) setFilter(status);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    const key = sortMode === 'created' ? 'created_at' : 'updated_at';
    return [...competitors].sort((a, b) => (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : b.id - a.id));
  }, [competitors, sortMode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    setSubmitting(false);

    if (res.status === 409) {
      setError('이미 등록된 경쟁사입니다.');
      return;
    }
    if (!res.ok) {
      setError('등록에 실패했습니다. 이름을 확인하세요.');
      return;
    }

    setForm(EMPTY_FORM);
    setFormOpen(false);
    setFilter('전체');
    load();
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#0a0a0a]">경쟁사 목록</h1>
          <p className="text-sm text-[#555] mt-1">조사 대상 경쟁사를 등록하고 진행 상태를 관리합니다.</p>
        </div>
        <Button onClick={() => setFormOpen((v) => !v)} variant={formOpen ? 'secondary' : 'primary'}>
          {formOpen ? '닫기' : '경쟁사 등록'}
        </Button>
      </div>

      {formOpen && (
        <div className="mb-6">
          <Card title="경쟁사 등록">
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[#555]">
                  경쟁사 이름<span className="text-red-600"> *</span>
                </span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[#555]">홈페이지</span>
                <input
                  value={form.homepage}
                  onChange={(e) => setForm((f) => ({ ...f, homepage: e.target.value }))}
                  placeholder="https://…"
                  className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[#555]">메모</span>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="왜 조사하는지, 어디서 들었는지 등"
                  rows={2}
                  className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-[#555]">
                <input
                  type="checkbox"
                  checked={form.mentioned_by_exec}
                  onChange={(e) => setForm((f) => ({ ...f, mentioned_by_exec: e.target.checked }))}
                />
                회장님·경영진이 언급한 회사
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end">
                <Button type="submit" disabled={submitting}>
                  {submitting ? '등록 중…' : '등록'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'px-3 py-1.5 text-xs rounded-md font-medium transition-colors',
                filter === f
                  ? 'bg-[#0a0a0a] text-white'
                  : 'bg-white border border-[#e5e5e5] text-[#555] hover:bg-gray-50',
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="text-xs border border-[#e5e5e5] rounded-md px-2 py-1.5 text-[#555] focus:outline-none"
        >
          <option value="updated">최근 작업순</option>
          <option value="created">최근 등록순</option>
        </select>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-[#999] py-4 text-center">불러오는 중…</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-[#999] py-4 text-center">해당 상태의 경쟁사가 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[#999] border-b border-gray-100">
                <th className="pb-2 font-medium">이름</th>
                <th className="pb-2 font-medium">홈페이지</th>
                <th className="pb-2 font-medium">상태</th>
                <th className="pb-2 font-medium">등록일</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((competitor) => (
                <tr key={competitor.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/competitors/${competitor.id}`}
                        className="text-[#0a0a0a] font-medium hover:underline"
                      >
                        {competitor.name}
                      </Link>
                      {competitor.mentioned_by_exec && <Badge color="orange">회장님 언급</Badge>}
                    </div>
                  </td>
                  <td className="py-2.5 text-[#555]">{competitor.homepage || '—'}</td>
                  <td className="py-2.5">
                    <StatusBadge status={competitor.status} />
                  </td>
                  <td className="py-2.5 text-[#999] font-mono text-xs">{competitor.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
