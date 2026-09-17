# Spec — simsa-bogoseo-ai-choan (심사보고서 AI 초안)

> 근거: `docs/PRD.md` 기능 6, `docs/domain-story.md`. 선행: `sincheong-jeopsu`, `seoryu-hwagin`, `simsa-bogoseo`.

## Problem Statement

담당자가 제일 번거로워하는 일은 심사보고서 양식에 항목별 판단 결과와 근거를 일일이 적는 것이다. 사업자등록증·통장사본·등기부등본 등에서 읽은 정보를 항목마다 옮겨 정리하고, 업종 위험성이나 매출 규모의 이상 여부를 매번 처음부터 서술해야 한다.

## Solution

등록된 사업자 정보와 서류묶음 확인 결과를 바탕으로 `claude -p`가 심사보고서 5개 항목의 판정 초안과 근거를 생성해 스트리밍으로 화면에 채워준다. 담당자는 빈 양식을 채우는 대신, 생성된 초안을 검토·수정하고 확정한다. 판단의 책임은 담당자에게 있고 AI는 초안까지만 한다.

## User Stories

1. 담당자로서, '심사중' 신청의 심사보고서에서 'AI 초안 생성' 버튼을 눌러 항목별 초안을 받고 싶다.
2. 담당자로서, 초안 생성 시 사업자 정보(상호, 대표자, 업종, 사업 형태, 예상 매출)와 서류 확인 결과가 근거로 쓰이는 걸 알고 싶다.
3. 담당자로서, 생성이 진행되는 동안 결과가 실시간(스트리밍)으로 채워지는 걸 보고 싶다. 다 끝날 때까지 빈 화면을 기다리지 않게.
4. 담당자로서, 각 항목마다 AI가 제안한 판정(이상없음/확인필요/위험)과 근거 문장을 받고 싶다.
5. 담당자로서, AI 초안이 채워진 뒤 모든 항목을 자유롭게 수정하고 싶다.
6. 담당자로서, 어떤 항목이 AI가 채운 것이고 어떤 항목을 내가 손봤는지 구분되면 좋겠다. (최소한 "AI 초안 생성됨: 시각" 표시)
7. 담당자로서, 이미 내용이 있는 심사보고서에 AI 초안을 다시 돌리면 덮어쓰기 전에 확인받고 싶다.
8. 담당자로서, AI가 정보 부족으로 판단이 어려운 항목은 '확인필요'로 두고 무엇을 더 봐야 하는지 근거란에 적어주길 원한다.
9. 담당자로서, 생성이 실패하면(claude CLI 오류 등) 에러 메시지를 보고 다시 시도하고 싶다.
10. 담당자로서, 생성 중 '중단' 할 수 있으면 좋겠다.
11. 담당자로서, AI 초안은 어디까지나 초안이며 최종 판단은 담당자 책임이라는 안내 문구를 보고 싶다.
12. 담당자로서, 종합 의견도 AI가 항목 판정을 종합해 초안을 제안해주길 원한다.

## Implementation Decisions

- **모듈**
  - `app/api/ai/report-draft/route.ts` — `POST`. body `{ applicationId }`. SSE 스트리밍 응답. `CLAUDE.md`의 `spawn('claude', ['-p', prompt])` + `ReadableStream` + `text/event-stream` 패턴.
  - `simsa-bogoseo` 스키마의 `review_reports.ai_draft_generated_at` 컬럼 사용(이미 존재).
  - `app/applications/[id]/page.tsx` — 심사보고서 섹션에 'AI 초안 생성' 버튼 + 스트리밍 수신 + 파싱 → 폼 필드 채우기.
  - 프롬프트 구성 로직은 API 라우트 안 또는 공유 모듈. 심사 항목 상수는 `simsa-bogoseo`가 export한 것 재사용.

- **입력 데이터** — 라우트가 `applicationId`로 서버에서 조회:
  - `applications` 레코드(상호, 사업자등록번호, 대표자, 업종, 사업 형태, 예상 매출, 영업대리점).
  - `document_checks` (항목별 received/note) — 어떤 서류가 확인됐는지.
  - 가드: 신청 `status`가 `심사중`이 아니면 400.

- **프롬프트 설계**
  - 역할: PG사 가맹점 심사 담당자를 돕는 어시스턴트. 5개 항목(업종/대표자 조회/매출 규모/사업장 실재/타 PG사 해지이력)에 대해 판정과 근거 초안 작성.
  - 제약: 외부 조회 결과(대표자 전과, 타 PG사 해지이력 등)는 시스템에 없음 → 그런 항목은 기본 `확인필요`로 두고 "담당자가 X를 조회해 확인 필요"라고 근거에 명시하도록 지시.
  - 업종/매출 규모는 주어진 정보로 판단 가능 → 적극적으로 판정.
  - 출력 형식: **JSON 한 덩어리**로 지정 — `{ items: { industry: {verdict, basis}, representative: {...}, sales: {...}, premises: {...}, pg_termination: {...} }, overall_opinion: string, recommendation: "수용"|"반려" }`. `verdict`는 정확히 `이상없음|확인필요|위험`.
  - 프롬프트에 "JSON 외 다른 텍스트를 출력하지 말 것" 명시.

- **스트리밍 & 파싱**
  - 서버: `claude` stdout 청크를 `data: <chunk>\n\n`로 그대로 전달. `close` 시 스트림 종료. `error`/비정상 종료 시 `event: error\ndata: <메시지>\n\n` 전송 후 종료.
  - 클라이언트: 청크를 이어붙여 raw 텍스트를 "생성 중" 영역에 흘려보여줌. 스트림 종료 후 누적 텍스트에서 JSON 블록 추출(첫 `{` ~ 마지막 `}`), `JSON.parse`. 성공 시 각 필드를 심사보고서 폼 state에 반영. 파싱 실패 시 에러 표시 + raw 텍스트 유지 + 재시도 버튼.
  - 파싱 성공 시 클라이언트가 `PATCH /api/applications/[id]/report`로 저장하면서 `ai_draft_generated_at = now`도 함께 기록. (별도 AI 전용 저장 엔드포인트 없음 — 기존 report PATCH 재사용, `ai_draft_generated_at`을 PATCH 허용 필드에 추가)

- **덮어쓰기 확인** — 심사보고서에 이미 채워진 항목(verdict 또는 basis)이 하나라도 있으면 생성 전 `confirm` 다이얼로그. 확정 시 전체 항목을 AI 결과로 교체.

- **중단** — 클라이언트가 `fetch`를 `AbortController`로 취소. 서버는 request `abort`/스트림 취소 시 `claude` child process를 `kill`.

- **에러 처리**
  - `claude` 실행 불가(ENOENT 등) → SSE error 이벤트 "claude CLI를 찾을 수 없습니다".
  - 비정상 종료 코드 → stderr 수집분을 error 이벤트로.
  - 클라이언트는 error 이벤트 수신 시 스트리밍 영역에 red 메시지 + '다시 시도'.

- **UI**
  - 심사보고서 카드 상단에 'AI 초안 생성' 버튼(secondary) + 안내 문구("AI가 만든 초안입니다. 최종 판단과 근거는 담당자가 확인·수정하세요.").
  - 생성 중: 버튼 → '중단', 항목 폼 위에 스트리밍 raw 텍스트 접이식 영역.
  - 생성 후: `ai_draft_generated_at`이 있으면 "AI 초안 생성됨: <시각>" 뱃지/문구.

## Out of Scope

- 서류 원본 파일 첨부/OCR로 AI에 전달 — 서류는 "확인됨 여부 + 메모"만 프롬프트에 들어감.
- 대표자 전과, 타 PG사 해지이력의 실제 외부 조회 — AI는 `확인필요`로 두고 담당자에게 넘김.
- AI 응답의 자동 확정(사람 검토 없이 제출) — 항상 담당자 검토 후 저장.
- 스트리밍 중 항목별 점진적 반영(부분 JSON 파싱) — 종료 후 일괄 파싱으로 충분.
- 프롬프트/모델 선택 UI. `claude -p` 기본.
- 생성 이력 보관(여러 초안 비교).

## Further Notes

- `CLAUDE.md`의 AI 패턴 스니펫을 기준으로 하되, `claude.stdin?.end()` 호출과 프로세스 kill 정리를 반드시 포함.
- JSON 출력 지시에도 모델이 코드펜스(```json)를 붙일 수 있으므로, 파싱 전 펜스 제거 + 첫 `{`/마지막 `}` 슬라이스로 방어.
- `recommendation` 초안은 참고용이며, `simsa-bogoseo`의 제안 라디오에 프리필하되 담당자가 바꿀 수 있다.
- 이 기능은 `simsa-bogoseo`의 편집 가능 상태(`submitted_at` NULL)에서만 동작한다.
