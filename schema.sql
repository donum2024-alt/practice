-- lib/db.ts의 getDB()가 앱 시작 시 이 파일을 자동으로 실행합니다.
-- 개발 단계에서는 스키마를 매 시작 재실행하는 것을 전제로 CREATE 문에 컬럼을 추가합니다.
-- 기능별로 블록을 나눠 정의합니다.

-- ── competitors (gyeongjaengsa-josa) ─────────────────────────────
-- 조사 대상 경쟁사 레코드. status가 전체 조사 흐름의 상태 정본.
CREATE TABLE IF NOT EXISTS competitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  homepage TEXT,
  note TEXT,
  mentioned_by_exec INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '조사중',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ── collected_materials (jaryo-suchip) ────────────────────────────
-- 경쟁사별 수집 자료. AI 웹 검색 결과 또는 담당자가 직접 붙여넣은 내용.
CREATE TABLE IF NOT EXISTS collected_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_id INTEGER NOT NULL REFERENCES competitors(id),
  content TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_name TEXT,
  source_url TEXT,
  topic TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ── summaries (hangmokbyeol-jeongni) ──────────────────────────────
-- 경쟁사당 1행. 5개 항목(SKU 수·물류 운영 방식·가격 책정 방식·강점·차별화 요소) 정리 문서.
CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_id INTEGER NOT NULL UNIQUE REFERENCES competitors(id),
  sku_count TEXT,
  logistics TEXT,
  pricing TEXT,
  strengths TEXT,
  differentiation TEXT,
  confirmed INTEGER NOT NULL DEFAULT 0,
  confirmed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ── benchmark_points (benchmarking-jijeom) ────────────────────────
-- 정리·비교 내용에서 뽑아낸 벤치마킹 지점. 실제 사업 반영 상태와 결과 메모를 담당자가 직접 관리한다.
CREATE TABLE IF NOT EXISTS benchmark_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_id INTEGER NOT NULL REFERENCES competitors(id),
  source_item TEXT NOT NULL,
  description TEXT NOT NULL,
  rationale TEXT,
  reflection_status TEXT NOT NULL DEFAULT '검토중',
  result_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ── strategy_steps (siljeon-jeonryak) ─────────────────────────────
-- 벤치마킹 지점당 여러 행. step_order는 1부터 시작하는 연속된 순번.
CREATE TABLE IF NOT EXISTS strategy_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  benchmark_point_id INTEGER NOT NULL REFERENCES benchmark_points(id),
  step_order INTEGER NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
