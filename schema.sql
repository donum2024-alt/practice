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
