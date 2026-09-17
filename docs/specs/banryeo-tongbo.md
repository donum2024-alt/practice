# Spec — banryeo-tongbo (반려 통보)

> 근거: `docs/PRD.md` 기능 5, `docs/domain-story.md`. 선행: `sincheong-jeopsu`, `simsa-bogoseo`, `paljang-seungin`.

## Problem Statement

담당자가 위험하다고 판단하거나 팀장이 반려하면, 대리점에 수용하지 않기로 했다는 반려 통보를 보낸다. 지금은 통보 내용을 매번 새로 작성하고, 어떤 신청을 무슨 사유로 반려했는지 별도로 남기지 않아 나중에 근거를 찾기 어렵다.

## Solution

신청이 반려로 종결될 때 반려 통보를 작성·기록한다. 반려 사유와 출처(담당자 판단 / 팀장 반려)를 남기고, 심사보고서의 '위험' 항목과 근거를 바탕으로 대리점에 보낼 통보문 초안을 만들어 담당자가 다듬는다. 기록이 신청에 붙어 남으므로 이후 근거 조회가 된다.

## User Stories

1. 담당자로서, 심사 중 위험하다고 판단하면 팀장 승인을 기다리지 않고 바로 반려 처리하고 싶다. (도메인 스토리 예외: 담당자 위험 판단 → 대리점 반려 통보)
2. 담당자로서, 반려 처리 시 반려 사유를 입력하고 싶다.
3. 담당자로서, 심사보고서의 '위험'/'확인필요' 항목과 근거가 반려 사유 작성 화면에 요약돼 보이길 원한다.
4. 담당자로서, 대리점에 보낼 반려 통보문 초안이 자동으로 채워지길 원한다. (상호, 반려 결정, 주요 사유 포함)
5. 담당자로서, 통보문 초안을 자유롭게 수정하고 싶다.
6. 팀장이 반려한 경우, 담당자로서 팀장 코멘트가 반려 사유에 반영된 통보문 초안을 보고 싶다.
7. 담당자로서, 반려 통보를 저장하면 신청이 '반려' 상태로 종료되는 걸 보고 싶다.
8. 담당자로서, 상세 화면에서 지난 반려 통보(사유, 출처, 통보문, 작성 시각)를 읽기 전용으로 보고 싶다.
9. 담당자로서, 목록에서 '반려' 상태 신청을 필터링해 보고 싶다.
10. 담당자로서, 통보문을 클립보드로 복사해 기존 통보 수단(메일 등)에 붙여넣고 싶다.
11. 담당자로서, 반려 사유가 비어 있으면 저장이 막히길 원한다.
12. 담당자로서, 이미 반려 통보가 있는 신청에는 통보를 중복 생성하지 않길 원한다.

## Implementation Decisions

- **모듈**
  - `schema.sql` — `rejection_notices` 테이블 추가.
  - `types/index.ts` — `RejectionNotice`, `RejectionSource`('담당자판단'|'팀장반려') 타입 추가.
  - `app/api/applications/[id]/rejection/route.ts` — `GET`(반려 통보), `POST`(작성 + 신청 반려 종료).
  - `app/applications/[id]/page.tsx` — 반려 섹션(반려 처리 폼 / 반려 통보 표시) 추가.

- **스키마** (`rejection_notices`)
  - `id` PK, `application_id` INTEGER NOT NULL UNIQUE(FK applications)
  - `reason` TEXT NOT NULL — 반려 사유(담당자 정리)
  - `source` TEXT NOT NULL (`담당자판단` | `팀장반려`)
  - `notice_body` TEXT — 대리점에 보낼 통보문
  - `created_at` TEXT NOT NULL DEFAULT localtime

- **두 개의 진입 경로**
  1. **담당자 위험 판단** — 신청 `status`가 `심사중`일 때 상세에서 '반려 처리' 액션. 심사보고서가 존재해야 함(항목 완성도까지는 요구 안 함, 사유는 필수). `source = 담당자판단`. `paljang-seungin`의 팀장 승인을 거치지 않는다(도메인 스토리 예외 흐름). 효과: `rejection_notices` INSERT, 신청 `status = 반려`.
  2. **팀장 반려** — `paljang-seungin`에서 `decision = 반려`로 신청이 이미 `status = 반려`가 된 상태. 이때 `approvals` 레코드는 있으나 `rejection_notices`는 아직 없음. 상세에서 '반려 통보 작성' 액션 노출. `source = 팀장반려`, 사유 초안에 `approvals.team_lead_comment` 반영. 효과: `rejection_notices` INSERT(상태는 이미 `반려`).

- **통보문 초안 생성** — 규칙 기반(AI 아님). 템플릿:
  - 수신(대리점), 대상(상호/사업자등록번호), 결정("수용하지 않기로 결정"), 주요 사유(심사보고서에서 `위험` 항목 라벨 + 근거 요약; 팀장반려면 팀장 코멘트), 맺음말.
  - `GET`에서 아직 통보가 없으면 이 초안을 계산해 `notice_body` 후보로 함께 반환(저장 전).

- **API 계약**
  - `GET /api/applications/[id]/rejection` → `{ notice: RejectionNotice | null, draft: { reason: string, notice_body: string, source: RejectionSource } }`. `draft`는 통보가 없을 때만 계산.
  - `POST /api/applications/[id]/rejection` body `{ reason, notice_body, source }`.
    - 가드: `reason` 비어있지 않음. 이미 `rejection_notices` 있으면 409.
    - `source=담당자판단`이면 신청 `status`가 `심사중`이어야 하고, 저장 시 `status = 반려`로 전이.
    - `source=팀장반려`면 신청 `status`가 이미 `반려`여야 함(아니면 400).
  - 별도 수정 엔드포인트 없음 — 통보는 1회 작성 후 읽기전용(수정 필요 시 향후).

- **UI**
  - `심사중` 상태: 심사보고서 카드 근처에 '위험 판단 — 반려 처리' 보조 버튼(danger). 누르면 반려 폼(심사보고서 위험/확인필요 항목 요약 + 사유 textarea(초안 프리필) + 통보문 textarea(초안 프리필) + 저장).
  - `반려` 상태 & 통보 없음: `Card title="반려 통보"` 안에 위 폼.
  - `반려` 상태 & 통보 있음: 반려 통보 카드 읽기전용(사유, 출처 뱃지, 통보문, 작성 시각) + 통보문 '복사' 버튼.

## Out of Scope

- 대리점에 실제 발송(이메일/문자/팩스). 통보문 작성·기록·복사까지만.
- AI 통보문 생성. 규칙 기반 템플릿만.
- 반려 철회/재심사 전환.
- 통보문 다국어/서식(PDF).
- 반려 통계·리포트.

## Further Notes

- `application_id` UNIQUE로 신청당 반려 통보 1건.
- 신청 삭제 시 `rejection_notices` 캐스케이드 삭제.
- 담당자판단 경로는 `simsa-bogoseo`의 '위험' 판정과 별개 액션이다(항목에 위험이 없어도 담당자가 반려할 수 있으나, 사유는 반드시 적는다).
- 심사 항목 라벨 상수는 `simsa-bogoseo`가 export한 것을 재사용.
