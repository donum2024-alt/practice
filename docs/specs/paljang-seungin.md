# Spec — paljang-seungin (팀장 승인)

> 근거: `docs/PRD.md` 기능 4, `docs/domain-story.md`. 선행: `sincheong-jeopsu`, `simsa-bogoseo`.

## Problem Statement

담당자가 심사보고서를 다 쓰면 심사 결과를 팀장에게 올리고, 팀장이 최종 수용 여부를 승인한다. 승인을 거친 결과는 시스템에 등록되고 이 심사 업무가 끝난다. 지금은 종이 보고서를 들고 가 결재받고, 승인 결과를 따로 정리해 등록한다. 어떤 신청이 팀장 결재를 기다리는지, 팀장이 무슨 코멘트를 달았는지 흩어져 있다.

## Solution

담당자가 완성된 심사보고서를 '팀장에게 올리기'로 제출하면 신청이 '팀장승인대기'가 된다. 팀장은 승인 대기 목록에서 심사보고서를 읽고 '승인' 또는 '반려'를 코멘트와 함께 결정한다. 승인하면 신청이 '승인완료'로 종료되어 승인 결과(결정, 코멘트, 결재 시각)가 시스템에 남는다. 팀장이 보완이 필요하다고 보면 담당자에게 되돌린다.

## User Stories

1. 담당자로서, 완성된 심사보고서를 '팀장에게 올리기' 버튼으로 제출하고 싶다.
2. 담당자로서, 심사보고서가 미완성(항목/근거/제안 누락)이면 제출이 막히고 무엇이 빠졌는지 안내받고 싶다.
3. 담당자로서, 제출 후 신청이 '팀장승인대기'로 바뀌고 심사보고서가 잠기는 걸 보고 싶다.
4. 팀장으로서, '팀장승인대기' 신청만 모아 보는 목록이 필요하다.
5. 팀장으로서, 각 대기 신청의 상세에서 사업자 정보와 심사보고서를 항목별 판정·근거까지 읽고 싶다.
6. 팀장으로서, 담당자의 최종 제안(수용/반려)이 무엇인지 눈에 띄게 보고 싶다.
7. 팀장으로서, '승인' 결정을 코멘트와 함께 남기고 싶다.
8. 팀장으로서, '반려' 결정을 사유 코멘트와 함께 남기고 싶다.
9. 팀장으로서, 결정 전에 담당자에게 '보완 요청'으로 되돌려 심사보고서를 다시 열어주고 싶다.
10. 담당자로서, 팀장이 되돌리면 신청이 '심사중'으로 돌아오고 심사보고서를 다시 편집할 수 있길 원한다.
11. 담당자로서, 팀장의 보완 요청 코멘트를 확인하고 싶다.
12. 담당자로서, 승인이 완료되면 상세 화면에서 승인 결과(결정, 팀장 코멘트, 결재 시각)를 보고 싶다.
13. 팀장으로서, 이미 결정한 신청은 다시 결정 화면이 뜨지 않고 결과만 보이길 원한다.
14. 담당자로서, 홈 화면에서 '팀장승인대기' 건수를 보고 밀린 결재를 파악하고 싶다.
15. 팀장으로서, 승인/반려 액션이 담당자 화면과 시각적으로 구분된 영역에 있길 원한다. (역할 혼동 방지)

## Implementation Decisions

- **모듈**
  - `schema.sql` — `approvals` 테이블 추가.
  - `types/index.ts` — `Approval`, `ApprovalDecision`('승인'|'반려') 타입 추가.
  - `app/api/applications/[id]/submit/route.ts` — `POST`(담당자: 팀장에게 올리기).
  - `app/api/applications/[id]/approval/route.ts` — `GET`(승인 결과), `POST`(팀장: 승인/반려 결정), `DELETE` 또는 `POST /return`(보완 요청 되돌리기). 되돌리기는 `app/api/applications/[id]/return/route.ts` `POST`로 분리.
  - `app/applications/[id]/page.tsx` — 승인 섹션(팀장 결정 영역 + 승인 결과 표시) 추가.
  - `app/applications/page.tsx` — 상태 필터에 '팀장승인대기' 활용(이미 `sincheong-jeopsu`에 있음).

- **스키마** (`approvals`)
  - `id` PK, `application_id` INTEGER NOT NULL UNIQUE(FK applications)
  - `decision` TEXT NOT NULL (`승인` | `반려`)
  - `team_lead_comment` TEXT
  - `decided_at` TEXT NOT NULL DEFAULT localtime

- **제출 (`POST /api/applications/[id]/submit`)**
  - 가드: 신청 `status`가 `심사중`이어야 함. 심사보고서가 `simsa-bogoseo`의 완성도 검증 통과해야 함. 실패 시 400 `{ error, missing }`.
  - 효과: `review_reports.submitted_at = now`, 신청 `status = 팀장승인대기`.

- **결정 (`POST /api/applications/[id]/approval`)** body `{ decision, team_lead_comment }`
  - 가드: 신청 `status`가 `팀장승인대기`여야 함. 이미 `approvals` 있으면 409.
  - `decision = 승인` → `approvals` INSERT, 신청 `status = 승인완료`. (심사 종료 지점)
  - `decision = 반려` → `approvals` INSERT, 신청 `status = 반려`. 반려 통보 작성은 `banryeo-tongbo`가 이어받음(이 스펙은 상태만 `반려`로).

- **되돌리기 (`POST /api/applications/[id]/return`)** body `{ team_lead_comment }`
  - 가드: 신청 `status`가 `팀장승인대기`.
  - 효과: `review_reports.submitted_at = NULL`, 신청 `status = 심사중`. 팀장 코멘트는 `review_reports`에 `return_comment` 컬럼 추가해 저장(이 스펙에서 컬럼 추가). `approvals`에는 기록 안 함(최종 결정 아님).

- **API 계약**
  - `GET /api/applications/[id]/approval` → `Approval | null`.
  - 상세 페이지는 `status`로 UI 분기: `팀장승인대기` + 결과 없음 → 팀장 결정 폼 노출(별도 스타일 영역, 예: 어두운/강조 테두리 카드 "팀장 결재"). `승인완료`/`반려` → 승인 결과 카드(읽기전용).

- **UI**
  - 담당자 영역: 심사보고서 카드 하단 '팀장에게 올리기' 버튼(완성 시 활성). 되돌려진 경우 팀장 보완 코멘트를 yellow 배너로.
  - 팀장 영역: `Card title="팀장 결재"`, 시각적으로 구분(예: border 강조). 승인/반려 라디오 + 코멘트 textarea + '보완 요청' 보조 버튼.
  - 승인 결과 카드: 결정 뱃지(승인 green / 반려 red), 코멘트, 결재 시각.

## Out of Scope

- 실제 결재선/다단계 승인. 팀장 1명, 1단계.
- 사용자 인증으로 담당자/팀장 강제 분리. 화면 영역 구분만.
- 반려 통보문 작성·기록 — `banryeo-tongbo`.
- 승인 완료 후 가맹점 계약/등록 후속 업무 — 도메인 스토리의 끝나는 지점(승인 결과 시스템 등록)까지만.
- 알림/이메일.

## Further Notes

- 도메인 스토리 "끝나는 지점": 팀장 승인을 거친 승인 결과를 시스템에 등록하면 심사 업무 종료. `decision=승인` → `status=승인완료` + `approvals` 레코드가 그 등록에 해당.
- `review_reports`에 `return_comment` TEXT NULL 컬럼을 이 스펙에서 추가(스키마 변경은 `simsa-bogoseo`가 만든 테이블에 ALTER가 아니라 `schema.sql`의 CREATE 문에 컬럼 추가 — 앱은 스키마를 매 시작 실행하고 아직 개발 단계라 재생성 가정).
- 신청 삭제 시 `approvals` 캐스케이드 삭제.
