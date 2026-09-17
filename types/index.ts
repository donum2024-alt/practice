// 모든 타입은 이 파일에서 단일 관리합니다.

// ── competitors / 조사 상태 모델 (gyeongjaengsa-josa) ─────────────
// 이 스펙이 경쟁사 레코드와 조사 상태 모델의 정본을 소유합니다.

export type CompetitorStatus = '조사중' | '자료수집됨' | '정리완료' | '벤치마킹도출';

export type Competitor = {
  id: number;
  name: string;
  homepage: string | null;
  note: string | null;
  mentioned_by_exec: boolean;
  status: CompetitorStatus;
  created_at: string;
  updated_at: string;
};

export const COMPETITOR_STATUSES: CompetitorStatus[] = [
  '조사중',
  '자료수집됨',
  '정리완료',
  '벤치마킹도출',
];

export function isCompetitorStatus(value: unknown): value is CompetitorStatus {
  return typeof value === 'string' && (COMPETITOR_STATUSES as string[]).includes(value);
}

// 자동 전이 전용 헬퍼: target이 current보다 더 앞선 단계일 때만 target으로 올리고,
// 이미 더 앞서 있으면 current를 그대로 유지한다(뒤로 되돌리지 않는다).
// 담당자가 직접 PATCH로 상태를 바꾸는 경우(뒤로 되돌리기 포함)에는 쓰지 않는다.
export function advanceStatus(current: CompetitorStatus, target: CompetitorStatus): CompetitorStatus {
  return COMPETITOR_STATUSES.indexOf(target) > COMPETITOR_STATUSES.indexOf(current) ? target : current;
}

// ── collected_materials / 수집 자료 (jaryo-suchip) ─────────────────

export type MaterialSource = '웹검색' | '직접입력' | '지인회의';

export const MATERIAL_SOURCES: MaterialSource[] = ['웹검색', '직접입력', '지인회의'];

export function isMaterialSource(value: unknown): value is MaterialSource {
  return typeof value === 'string' && (MATERIAL_SOURCES as string[]).includes(value);
}

export type MaterialTopic = 'SKU수' | '물류운영' | '가격책정' | '강점' | '차별화요소' | '기타';

export const MATERIAL_TOPICS: MaterialTopic[] = ['SKU수', '물류운영', '가격책정', '강점', '차별화요소', '기타'];

export function isMaterialTopic(value: unknown): value is MaterialTopic {
  return typeof value === 'string' && (MATERIAL_TOPICS as string[]).includes(value);
}

export type CollectedMaterial = {
  id: number;
  competitor_id: number;
  content: string;
  source_type: MaterialSource;
  source_name: string | null;
  source_url: string | null;
  topic: MaterialTopic | null;
  created_at: string;
};

// ── summaries / 항목별 정리 (hangmokbyeol-jeongni) ─────────────────

export type SummaryItemKey = 'SKU수' | '물류운영' | '가격책정' | '강점' | '차별화요소';

export const SUMMARY_ITEM_KEYS: SummaryItemKey[] = ['SKU수', '물류운영', '가격책정', '강점', '차별화요소'];

export type Summary = {
  id: number;
  competitor_id: number;
  sku_count: string | null;
  logistics: string | null;
  pricing: string | null;
  strengths: string | null;
  differentiation: string | null;
  confirmed: boolean;
  confirmed_at: string | null;
  updated_at: string | null;
};

// ── benchmark_points / 벤치마킹 지점 (benchmarking-jijeom) ──────────

export type BenchmarkReflectionStatus = '검토중' | '전략수립됨' | '사업반영됨' | '보류';

export const BENCHMARK_REFLECTION_STATUSES: BenchmarkReflectionStatus[] = [
  '검토중',
  '전략수립됨',
  '사업반영됨',
  '보류',
];

export function isBenchmarkReflectionStatus(value: unknown): value is BenchmarkReflectionStatus {
  return typeof value === 'string' && (BENCHMARK_REFLECTION_STATUSES as string[]).includes(value);
}

export type BenchmarkPoint = {
  id: number;
  competitor_id: number;
  source_item: SummaryItemKey;
  description: string;
  rationale: string | null;
  reflection_status: BenchmarkReflectionStatus;
  result_note: string | null;
  created_at: string;
  updated_at: string;
};

export type BenchmarkPointWithCompetitor = BenchmarkPoint & { competitor_name: string };

// ── strategy_steps / 단계별 실행 전략 (siljeon-jeonryak) ────────────

export type StrategyStep = {
  id: number;
  benchmark_point_id: number;
  step_order: number;
  description: string;
  created_at: string;
  updated_at: string;
};
