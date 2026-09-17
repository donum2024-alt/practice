'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatusBadge } from '@/components/StatusBadge';
import { COMPETITOR_STATUSES, type Competitor, type CompetitorStatus } from '@/types';
import { MaterialsSection } from './MaterialsSection';
import { ItemSummarySection } from './ItemSummarySection';
import { BenchmarkPointsSection } from './BenchmarkPointsSection';

type EditForm = {
  name: string;
  homepage: string;
  note: string;
  mentioned_by_exec: boolean;
};

function toForm(competitor: Competitor): EditForm {
  return {
    name: competitor.name,
    homepage: competitor.homepage ?? '',
    note: competitor.note ?? '',
    mentioned_by_exec: competitor.mentioned_by_exec,
  };
}

export default function CompetitorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [competitor, setCompetitor] = useState<Competitor | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/competitors/${id}`);
    if (res.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const data: Competitor = await res.json();
    setCompetitor(data);
    setForm(toForm(data));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/competitors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    setSaving(false);

    if (!res.ok) {
      setError('저장에 실패했습니다. 이름을 확인하세요.');
      return;
    }

    const updated: Competitor = await res.json();
    setCompetitor(updated);
    setForm(toForm(updated));
    setEditing(false);
  }

  async function handleStatusChange(status: CompetitorStatus) {
    const res = await fetch(`/api/competitors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated: Competitor = await res.json();
      setCompetitor(updated);
      setForm(toForm(updated));
    }
  }

  async function handleDelete() {
    if (!confirm('이 경쟁사를 삭제할까요?')) return;

    const res = await fetch(`/api/competitors/${id}`, { method: 'DELETE' });

    if (res.status === 409) {
      const data = await res.json();
      const detail = Object.entries(data.counts as Record<string, number>)
        .filter(([, count]) => count > 0)
        .map(([table, count]) => `${table} ${count}건`)
        .join(', ');
      if (!confirm(`연결된 자료가 있습니다 (${detail}). 그래도 삭제할까요?`)) return;

      const forced = await fetch(`/api/competitors/${id}?force=1`, { method: 'DELETE' });
      if (forced.ok) router.push('/competitors');
      return;
    }

    if (res.ok) router.push('/competitors');
  }

  if (loading) return <p className="text-sm text-[#999]">불러오는 중…</p>;

  if (notFound || !competitor || !form) {
    return (
      <div className="max-w-2xl">
        <p className="text-sm text-[#555] mb-4">경쟁사를 찾을 수 없습니다.</p>
        <Link href="/competitors" className="text-sm text-[#0a0a0a] hover:underline">
          ← 경쟁사 목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <Link href="/competitors" className="text-sm text-[#999] hover:text-[#0a0a0a]">
        ← 경쟁사 목록
      </Link>

      <div className="flex items-start justify-between mt-2 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[#0a0a0a]">{competitor.name}</h1>
            {competitor.mentioned_by_exec && <Badge color="orange">회장님 언급</Badge>}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge status={competitor.status} />
            <select
              value={competitor.status}
              onChange={(e) => handleStatusChange(e.target.value as CompetitorStatus)}
              className="text-xs border border-[#e5e5e5] rounded-md px-2 py-1 text-[#555] focus:outline-none"
            >
              {COMPETITOR_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-[#999] font-mono mt-2">
            등록 {competitor.created_at} · 최근 작업 {competitor.updated_at}
          </p>
        </div>
        <div className="flex gap-2">
          {!editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              정보 수정
            </Button>
          )}
          <Button variant="danger" onClick={handleDelete}>
            삭제
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card title="기본 정보">
          {editing ? (
            <form onSubmit={handleSave} className="space-y-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[#555]">경쟁사 이름</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
                  required
                  className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[#555]">홈페이지</span>
                <input
                  value={form.homepage}
                  onChange={(e) => setForm((f) => (f ? { ...f, homepage: e.target.value } : f))}
                  className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[#555]">메모</span>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm((f) => (f ? { ...f, note: e.target.value } : f))}
                  rows={2}
                  className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-[#555]">
                <input
                  type="checkbox"
                  checked={form.mentioned_by_exec}
                  onChange={(e) => setForm((f) => (f ? { ...f, mentioned_by_exec: e.target.checked } : f))}
                />
                회장님·경영진이 언급한 회사
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setForm(toForm(competitor));
                    setEditing(false);
                    setError(null);
                  }}
                >
                  취소
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? '저장 중…' : '저장'}
                </Button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-[#999] mb-0.5">홈페이지</dt>
                <dd className="text-[#333]">{competitor.homepage || '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-[#999] mb-0.5">메모</dt>
                <dd className="text-[#333] whitespace-pre-wrap">{competitor.note || '—'}</dd>
              </div>
            </dl>
          )}
        </Card>

        <div id="materials-section">
          <Card title="수집 자료">
            <MaterialsSection competitorId={competitor.id} onMaterialsChanged={load} />
          </Card>
        </div>

        <Card title="항목별 정리">
          <ItemSummarySection competitorId={competitor.id} />
        </Card>

        <Card title="벤치마킹 지점">
          <BenchmarkPointsSection competitorId={competitor.id} onPointsChanged={load} />
        </Card>
      </div>
    </div>
  );
}
