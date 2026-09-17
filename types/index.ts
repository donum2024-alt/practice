// 모든 타입은 이 파일에서 단일 관리합니다.

// ── applications / 상태 모델 (sincheong-jeopsu) ──────────────────
// 이 스펙이 전체 심사 흐름의 상태 전이 정본을 소유합니다.

export type ApplicationStatus =
  | '접수'
  | '서류보완'
  | '심사중'
  | '팀장승인대기'
  | '승인완료'
  | '반려';

export type Application = {
  id: number;
  biz_name: string;
  biz_reg_no: string;
  representative: string;
  industry: string;
  business_type: string;
  expected_sales: string;
  agency: string | null;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
};

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  '접수',
  '서류보완',
  '심사중',
  '팀장승인대기',
  '승인완료',
  '반려',
];

export const APPLICATION_STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  접수: ['서류보완', '심사중'],
  서류보완: ['심사중'],
  심사중: ['서류보완', '팀장승인대기', '반려'],
  팀장승인대기: ['승인완료', '반려', '심사중'],
  승인완료: [],
  반려: [],
};

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && (APPLICATION_STATUSES as string[]).includes(value);
}

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return APPLICATION_STATUS_TRANSITIONS[from].includes(to);
}

export function nextActionLabel(status: ApplicationStatus): string {
  switch (status) {
    case '접수':
      return '서류묶음 확인 필요';
    case '서류보완':
      return '대리점 서류 회신 대기';
    case '심사중':
      return '심사보고서 작성';
    case '팀장승인대기':
      return '팀장 승인 대기';
    case '승인완료':
    case '반려':
      return '심사 종료';
  }
}

// ── 서류묶음 확인 (seoryu-hwagin) ──────────────────────────────

// doc_type은 자유 문자열이라 표준 3항목 외 추가 항목을 허용한다.
export type DocType = string;

export const STANDARD_DOC_TYPES = [
  '사업자등록증',
  '통장사본',
  '등기부등본/임대차계약서',
] as const;

export type DocumentCheck = {
  id: number;
  application_id: number;
  doc_type: DocType;
  received: boolean;
  note: string | null;
  created_at: string;
};

export type DocumentRequest = {
  id: number;
  application_id: number;
  requested_docs: string;
  requested_at: string;
};

// 재요청 기록 시 자동으로 '서류보완'으로 전이시킬 대상 상태.
export const DOC_REQUEST_AUTO_SUPPLEMENT_FROM: ApplicationStatus[] = ['접수', '심사중'];

export function missingDocuments(checks: DocumentCheck[]): DocType[] {
  return checks.filter((c) => !c.received).map((c) => c.doc_type);
}

// '심사 시작' 가드: 항목이 하나 이상 있고 전부 받음이어야 통과.
export function canStartReview(checks: DocumentCheck[]): boolean {
  return checks.length > 0 && checks.every((c) => c.received);
}
