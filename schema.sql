-- lib/db.ts의 getDB()가 앱 시작 시 이 파일을 자동으로 실행합니다.
-- 개발 단계에서는 스키마를 매 시작 재실행하는 것을 전제로 CREATE 문에 컬럼을 추가합니다.
-- 기능별로 블록을 나눠 정의합니다.

-- ── applications (sincheong-jeopsu) ──────────────────────────────
-- 가맹점 신청 레코드. status가 전체 심사 흐름의 상태 정본.
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  biz_name TEXT NOT NULL,
  biz_reg_no TEXT NOT NULL,
  representative TEXT NOT NULL,
  industry TEXT NOT NULL,
  business_type TEXT NOT NULL,
  expected_sales TEXT NOT NULL,
  agency TEXT,
  status TEXT NOT NULL DEFAULT '접수',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ── document_checks / document_requests (seoryu-hwagin) ──────────
-- 신청별 서류묶음 확인 체크리스트와 대리점 재요청 내역.
CREATE TABLE IF NOT EXISTS document_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  doc_type TEXT NOT NULL,
  received INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS document_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  requested_docs TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
