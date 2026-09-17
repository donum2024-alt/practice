'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/StatusBadge';
import {
  APPLICATION_STATUSES,
  isApplicationStatus,
  type Application,
  type ApplicationStatus,
} from '@/types';

type Filter = ApplicationStatus | '전체';

const FILTERS: Filter[] = ['전체', ...APPLICATION_STATUSES];

const EMPTY_FORM = {
  biz_name: '',
  biz_reg_no: '',
  representative: '',
  industry: '',
  business_type: '',
  expected_sales: '',
  agency: '',
};

const FORM_FIELDS: { key: keyof typeof EMPTY_FORM; label: string; placeholder?: string; required: boolean }[] = [
  { key: 'biz_name', label: '상호', required: true },
  { key: 'biz_reg_no', label: '사업자등록번호', required: true },
  { key: 'representative', label: '대표자', required: true },
  { key: 'industry', label: '업종', required: true },
  { key: 'business_type', label: '사업 형태', placeholder: '개인 / 법인', required: true },
  { key: 'expected_sales', label: '예상 매출 규모', placeholder: '월 3,000만원', required: true },
  { key: 'agency', label: '영업대리점', required: false },
];

export default function ApplicationsPage() {
  const [filter, setFilter] = useState<Filter>('전체');
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const query = filter === '전체' ? '' : `?status=${encodeURIComponent(filter)}`;
    const res = await fetch(`/api/applications${query}`);
    setApplications(res.ok ? await res.json() : []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('status');
    if (status && isApplicationStatus(status)) setFilter(status);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    setSubmitting(false);

    if (!res.ok) {
      setError('등록에 실패했습니다. 필수 항목을 확인하세요.');
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
          <h1 className="text-xl font-semibold text-[#0a0a0a]">심사 목록</h1>
          <p className="text-sm text-[#555] mt-1">대리점이 보낸 가맹점 신청을 상태별로 관리합니다.</p>
        </div>
        <Button onClick={() => setFormOpen((v) => !v)} variant={formOpen ? 'secondary' : 'primary'}>
          {formOpen ? '닫기' : '신청 등록'}
        </Button>
      </div>

      {formOpen && (
        <div className="mb-6">
          <Card title="가맹점 신청 등록">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {FORM_FIELDS.map(({ key, label, placeholder, required }) => (
                  <label key={key} className="flex flex-col gap-1 text-sm">
                    <span className="text-[#555]">
                      {label}
                      {required && <span className="text-red-600"> *</span>}
                    </span>
                    <input
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      required={required}
                      className="border border-[#e5e5e5] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#0a0a0a]"
                    />
                  </label>
                ))}
              </div>
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

      <div className="flex flex-wrap gap-1.5 mb-4">
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

      <Card>
        {loading ? (
          <p className="text-sm text-[#999] py-4 text-center">불러오는 중…</p>
        ) : applications.length === 0 ? (
          <p className="text-sm text-[#999] py-4 text-center">해당 상태의 신청이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[#999] border-b border-gray-100">
                <th className="pb-2 font-medium">상호</th>
                <th className="pb-2 font-medium">대표자</th>
                <th className="pb-2 font-medium">업종</th>
                <th className="pb-2 font-medium">상태</th>
                <th className="pb-2 font-medium">접수일</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="py-2.5">
                    <Link href={`/applications/${app.id}`} className="text-[#0a0a0a] font-medium hover:underline">
                      {app.biz_name}
                    </Link>
                  </td>
                  <td className="py-2.5 text-[#555]">{app.representative}</td>
                  <td className="py-2.5 text-[#555]">{app.industry}</td>
                  <td className="py-2.5">
                    <StatusBadge status={app.status} />
                  </td>
                  <td className="py-2.5 text-[#999] font-mono text-xs">{app.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
