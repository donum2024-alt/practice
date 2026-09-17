'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/StatusBadge';
import { nextActionLabel, type Application } from '@/types';
import { DocumentChecklist } from './DocumentChecklist';

type EditableKey =
  | 'biz_name'
  | 'biz_reg_no'
  | 'representative'
  | 'industry'
  | 'business_type'
  | 'expected_sales'
  | 'agency';

const FIELDS: { key: EditableKey; label: string }[] = [
  { key: 'biz_name', label: '상호' },
  { key: 'biz_reg_no', label: '사업자등록번호' },
  { key: 'representative', label: '대표자' },
  { key: 'industry', label: '업종' },
  { key: 'business_type', label: '사업 형태' },
  { key: 'expected_sales', label: '예상 매출 규모' },
  { key: 'agency', label: '영업대리점' },
];

type EditForm = Record<EditableKey, string>;

function toForm(app: Application): EditForm {
  return {
    biz_name: app.biz_name,
    biz_reg_no: app.biz_reg_no,
    representative: app.representative,
    industry: app.industry,
    business_type: app.business_type,
    expected_sales: app.expected_sales,
    agency: app.agency ?? '',
  };
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/applications/${id}`);
    if (res.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const data: Application = await res.json();
    setApplication(data);
    setForm(toForm(data));
    setLoading(false);
  }, [id]);

  const refreshApplication = useCallback(async () => {
    const res = await fetch(`/api/applications/${id}`);
    if (!res.ok) return;
    const data: Application = await res.json();
    setApplication(data);
    setForm(toForm(data));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    setSaving(false);

    if (!res.ok) {
      setError('저장에 실패했습니다. 입력값을 확인하세요.');
      return;
    }

    const updated: Application = await res.json();
    setApplication(updated);
    setForm(toForm(updated));
    setEditing(false);
  }

  async function handleDelete() {
    if (!confirm('이 신청을 삭제할까요? 연결된 서류 확인·심사보고서 기록도 함께 삭제됩니다.')) return;
    const res = await fetch(`/api/applications/${id}`, { method: 'DELETE' });
    if (res.ok) router.push('/applications');
  }

  if (loading) return <p className="text-sm text-[#999]">불러오는 중…</p>;

  if (notFound || !application || !form) {
    return (
      <div className="max-w-2xl">
        <p className="text-sm text-[#555] mb-4">신청을 찾을 수 없습니다.</p>
        <Link href="/applications" className="text-sm text-[#0a0a0a] hover:underline">
          ← 심사 목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <Link href="/applications" className="text-sm text-[#999] hover:text-[#0a0a0a]">
        ← 심사 목록
      </Link>

      <div className="flex items-start justify-between mt-2 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#0a0a0a]">{application.biz_name}</h1>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge status={application.status} />
            <span className="text-xs text-[#999]">
              다음 행동: {nextActionLabel(application.status)}
            </span>
          </div>
          <p className="text-xs text-[#999] font-mono mt-2">
            접수 {application.created_at} · 상태 변경 {application.updated_at}
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
        <Card title="사업자 정보">
          {editing ? (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {FIELDS.map(({ key, label }) => (
                  <label key={key} className="flex flex-col gap-1 text-sm">
                    <span className="text-[#555]">{label}</span>
                    <input
                      value={form[key]}
                      onChange={(e) => setForm((f) => (f ? { ...f, [key]: e.target.value } : f))}
                      required={key !== 'agency'}
                      className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
                    />
                  </label>
                ))}
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setForm(toForm(application));
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
              {FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <dt className="text-xs text-[#999] mb-0.5">{label}</dt>
                  <dd className="text-[#333]">{application[key] || '—'}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>

        <DocumentChecklist application={application} onApplicationChange={refreshApplication} />

        <Card title="심사보고서">
          <p className="text-sm text-[#999]">심사보고서 양식은 다음 단계에서 추가됩니다.</p>
        </Card>

        <Card title="팀장 승인">
          <p className="text-sm text-[#999]">팀장 승인 영역은 다음 단계에서 추가됩니다.</p>
        </Card>
      </div>
    </div>
  );
}
