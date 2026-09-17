'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  canStartReview,
  canTransition,
  type Application,
  type DocumentCheck,
  type DocumentRequest,
} from '@/types';

type Props = {
  application: Application;
  onApplicationChange: () => void | Promise<void>;
};

export function DocumentChecklist({ application, onApplicationChange }: Props) {
  const [checks, setChecks] = useState<DocumentCheck[]>([]);
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDocType, setNewDocType] = useState('');
  const [requestedDocs, setRequestedDocs] = useState('');
  const [missing, setMissing] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/applications/${application.id}/documents`);
    if (res.ok) {
      const data: { checks: DocumentCheck[]; requests: DocumentRequest[] } = await res.json();
      setChecks(data.checks);
      setRequests(data.requests);
    }
    setLoading(false);
  }, [application.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function patchCheck(check: DocumentCheck, patch: { received?: boolean; note?: string }) {
    const res = await fetch(`/api/documents/${check.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated: DocumentCheck = await res.json();
      setChecks((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
    }
  }

  async function addDoc(e: React.FormEvent) {
    e.preventDefault();
    const doc_type = newDocType.trim();
    if (!doc_type) return;
    const res = await fetch(`/api/applications/${application.id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_type }),
    });
    if (res.ok) {
      const created: DocumentCheck = await res.json();
      setChecks((cs) => [...cs, created]);
      setNewDocType('');
    }
  }

  async function removeDoc(check: DocumentCheck) {
    const res = await fetch(`/api/documents/${check.id}`, { method: 'DELETE' });
    if (res.ok) setChecks((cs) => cs.filter((c) => c.id !== check.id));
  }

  async function markSupplement() {
    setBusy(true);
    await fetch(`/api/applications/${application.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: '서류보완' }),
    });
    setBusy(false);
    await onApplicationChange();
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    const requested_docs = requestedDocs.trim();
    if (!requested_docs) return;
    setBusy(true);
    const res = await fetch(`/api/applications/${application.id}/document-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requested_docs }),
    });
    setBusy(false);
    if (res.ok) {
      const created: DocumentRequest = await res.json();
      setRequests((rs) => [...rs, created]);
      setRequestedDocs('');
      await onApplicationChange();
    }
  }

  async function startReview() {
    setBusy(true);
    setMissing(null);
    const res = await fetch(`/api/applications/${application.id}/start-review`, { method: 'POST' });
    setBusy(false);
    if (res.ok) {
      await onApplicationChange();
      return;
    }
    const data = await res.json().catch(() => null);
    setMissing(Array.isArray(data?.missing) ? (data.missing as string[]) : []);
  }

  const receivedCount = checks.filter((c) => c.received).length;
  const allReceived = canStartReview(checks);
  const showSupplement = canTransition(application.status, '서류보완');
  const showStart = application.status === '접수' || application.status === '서류보완';

  return (
    <Card title="서류묶음 확인">
      {loading ? (
        <p className="text-sm text-[#999]">불러오는 중…</p>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-[#999]">
            {receivedCount}/{checks.length} 받음
          </p>

          <ul className="space-y-2">
            {checks.map((check) => (
              <li key={check.id} className="flex items-start gap-3">
                <label className="flex items-center gap-2 text-sm min-w-[180px] pt-1.5">
                  <input
                    type="checkbox"
                    checked={check.received}
                    onChange={(e) => patchCheck(check, { received: e.target.checked })}
                  />
                  <span className={check.received ? 'text-[#333]' : 'text-[#555]'}>
                    {check.doc_type}
                  </span>
                </label>
                <input
                  defaultValue={check.note ?? ''}
                  placeholder="메모 (예: 임대차계약서로 갈음)"
                  onBlur={(e) => {
                    if (e.target.value.trim() !== (check.note ?? '')) {
                      patchCheck(check, { note: e.target.value });
                    }
                  }}
                  className="flex-1 border border-[#e5e5e5] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-[#0a0a0a]"
                />
                <button
                  type="button"
                  onClick={() => removeDoc(check)}
                  className="text-xs text-[#999] hover:text-red-600 pt-2"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={addDoc} className="flex gap-2">
            <input
              value={newDocType}
              onChange={(e) => setNewDocType(e.target.value)}
              placeholder="추가 서류 항목"
              className="flex-1 border border-[#e5e5e5] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-[#0a0a0a]"
            />
            <Button type="submit" variant="secondary" size="sm">
              항목 추가
            </Button>
          </form>

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-[#555]">대리점 재요청</h4>
              {showSupplement && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={markSupplement}
                  disabled={busy}
                >
                  서류보완으로 표시
                </Button>
              )}
            </div>

            <form onSubmit={submitRequest} className="flex gap-2">
              <input
                value={requestedDocs}
                onChange={(e) => setRequestedDocs(e.target.value)}
                placeholder="요청한 서류 (예: 통장사본, 임대차계약서)"
                className="flex-1 border border-[#e5e5e5] rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-[#0a0a0a]"
              />
              <Button type="submit" variant="secondary" size="sm" disabled={busy}>
                재요청 기록
              </Button>
            </form>

            {requests.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {requests.map((r) => (
                  <li key={r.id} className="flex gap-3">
                    <span className="text-[#999] font-mono text-xs whitespace-nowrap pt-0.5">
                      {r.requested_at}
                    </span>
                    <span className="text-[#333]">{r.requested_docs}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[#999]">재요청 내역이 없습니다.</p>
            )}
          </div>

          {showStart && (
            <div className="border-t border-gray-100 pt-4 space-y-2">
              <Button type="button" onClick={startReview} disabled={!allReceived || busy}>
                심사 시작
              </Button>
              {!allReceived && (
                <p className="text-xs text-[#999]">모든 서류를 받아야 심사를 시작할 수 있습니다.</p>
              )}
              {missing && missing.length > 0 && (
                <p className="text-xs text-red-600">아직 받지 못한 서류: {missing.join(', ')}</p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default DocumentChecklist;
