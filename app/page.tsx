'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { APPLICATION_STATUSES, type Application, type ApplicationStatus } from '@/types';

type Counts = Record<ApplicationStatus, number>;

const EMPTY_COUNTS = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Counts;

export default function HomePage() {
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/applications');
      const applications: Application[] = res.ok ? await res.json() : [];
      const next = { ...EMPTY_COUNTS };
      for (const app of applications) next[app.status] += 1;
      setCounts(next);
      setTotal(applications.length);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold text-[#0a0a0a] mb-2">가맹점 심사 현황</h1>
      <p className="text-sm text-[#555] mb-8">
        전체 신청 {loading ? '…' : total}건. 상태를 눌러 해당 목록으로 이동합니다.
      </p>

      <div className="grid grid-cols-3 gap-4">
        {APPLICATION_STATUSES.map((status) => (
          <Link key={status} href={`/applications?status=${encodeURIComponent(status)}`}>
            <Card className="hover:shadow-md transition-shadow">
              <div className="text-xs text-[#999] mb-1">{status}</div>
              <div className="text-2xl font-semibold text-[#0a0a0a]">
                {loading ? '—' : counts[status]}
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6">
        <Link href="/applications" className="text-sm text-[#0a0a0a] hover:underline">
          전체 심사 목록 보기 →
        </Link>
      </div>
    </div>
  );
}
