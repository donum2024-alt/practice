# Spec — simsa-bogoseo (심사보고서 작성)

> 근거: `docs/PRD.md` 기능 3, `docs/domain-story.md`. 선행: `sincheong-jeopsu`, `seoryu-hwagin`.

## Problem Statement

담당자는 서류가 다 오면 위험한 가맹점인지 항목별로 판단해야 한다: 아예 안 되는 업종인지, 대표자가 과거에 문제 있던 사람인지, 매출 규모가 사업 형태에 비해 이상하지 않은지, 사업장이 실제 존재하는지, 다른 PG사에서 해지당한 이력이 있는지. 지금은 종이 심사보고서 양식에 항목별 판단 결과와 근거를 일일이 손으로 적는다. 양식이 자유서식이라 항목을 빠뜨리기도 하고, 나중에 팀장이 볼 때 근거가 흩어져 있다.

## Solution

신청마다 정해진 항목을 가진 심사보고서 양식을 화면으로 제공한다. 담당자는 5개 심사 항목 각각을 '이상없음 / 확인필요 / 위험'으로 판정하고 근거를 적는다. 마지막에 종합 의견과 수용/반려 제안을 남긴다. 항목이 고정돼 있어 빠뜨리지 않고, 팀장이 한 화면에서 근거까지 검토할 수 있다.

## User Stories

1. 담당자로서, '심사중' 신청의 상세에서 심사보고서 양식을 열고 싶다.
2. 담당자로서, 심사보고서에 사업자 정보(상호, 대표자, 업종, 사업 형태, 예상 매출)가 자동으로 채워져 보이길 원한다. 다시 옮겨 적지 않게.
3. 담당자로서, 업종 항목을 '이상없음/확인필요/위험'으로 판정하고 근거를 적고 싶다. (아예 안 되는 업종인지)
4. 담당자로서, 대표자 조회 항목을 판정하고 근거를 적고 싶다. (과거 문제 이력)
5. 담당자로서, 매출 규모 항목을 판정하고 근거를 적고 싶다. (사업 형태 대비 이상 여부)
6. 담당자로서, 사업장 실재 확인 항목을 판정하고 근거를 적고 싶다. (등기부등본/임대차계약서 기준)
7. 담당자로서, 타 PG사 해지이력 항목을 판정하고 근거를 적고 싶다.
8. 담당자로서, 작성 도중 저장하고 나중에 이어서 쓰고 싶다.
9. 담당자로서, 종합 의견을 자유 서술로 적고 싶다.
10. 담당자로서, 최종 제안을 '수용' 또는 '반려'로 선택하고 싶다.
11. 담당자로서, 항목 중 하나라도 '위험'이면 화면이 그 점을 눈에 띄게 보여주길 원한다.
12. 담당자로서, 근거가 빈 항목이 있으면 제출 전에 알려주길 원한다.
13. 담당자로서, 심사보고서 작성 진행도(채운 항목 수)를 보고 싶다.
14. 팀장으로서, 신청 상세에서 담당자가 쓴 심사보고서를 항목별 판정·근거까지 읽기 전용으로 보고 싶다.
15. 담당자로서, 심사보고서를 다 쓰면 팀장에게 올리는 액션으로 넘어가고 싶다. (실제 전이는 `paljang-seungin`)
16. 담당자로서, 이미 팀장에게 올린 뒤에는 심사보고서가 잠겨 실수로 수정되지 않길 원한다. (팀장이 되돌리면 다시 편집 가능)

## Implementation Decisions

- **모듈**
  - `schema.sql` — `review_reports` 테이블 추가.
  - `types/index.ts` — `ReviewReport`, `ReviewItemKey`, `Verdict`('이상없음'|'확인필요'|'위험'), `Recommendation`('수용'|'반려') 타입 추가.
  - `app/api/applications/[id]/report/route.ts` — `GET`(보고서, 없으면 빈 초안 생성 후 반환), `PATCH`(부분 저장).
  - `app/applications/[id]/page.tsx` — 심사보고서 섹션 컴포넌트 추가. `status`에 따라 편집/읽기전용 전환.

- **스키마** (`review_reports`)
  - `id` PK, `application_id` INTEGER NOT NULL UNIQUE(FK applications)
  - 항목별 컬럼(5쌍): `industry_verdict`/`industry_basis`, `representative_verdict`/`representative_basis`, `sales_verdict`/`sales_basis`, `premises_verdict`/`premises_basis`, `pg_termination_verdict`/`pg_termination_basis` — 전부 TEXT NULL.
  - `overall_opinion` TEXT, `recommendation` TEXT (`수용`|`반려`)
  - `ai_draft_generated_at` TEXT NULL — `simsa-bogoseo-ai-choan`이 사용(이 스펙에서 컬럼만 만들어 둠).
  - `submitted_at` TEXT NULL — 팀장에게 올린 시각(`paljang-seungin`이 세팅).
  - `created_at`, `updated_at` TEXT NOT NULL DEFAULT localtime.

- **심사 항목 정의** — 상수 배열로 관리(키, 한글 라벨, 설명). 순서: 업종 → 대표자 조회 → 매출 규모 → 사업장 실재 확인 → 타 PG사 해지이력. UI와 AI 프롬프트가 이 배열을 공유.

- **판정 값** (`Verdict`) — `이상없음` | `확인필요` | `위험`. 뱃지 색: 이상없음 green, 확인필요 yellow, 위험 red.

- **API 계약**
  - `GET /api/applications/[id]/report` → `ReviewReport`. 레코드 없으면 빈 보고서를 INSERT 후 반환. 신청이 `심사중` 이전 상태면 404 또는 409(정책: 409 + 안내).
  - `PATCH /api/applications/[id]/report` body: 위 컬럼들의 부분 집합. `submitted_at`이 이미 있으면(팀장에게 올린 상태) 409로 거부(되돌리기는 `paljang-seungin`이 `submitted_at`을 NULL로). `updated_at` 갱신.
  - 별도 제출 엔드포인트는 이 스펙에 없음 — '팀장에게 올리기'는 `paljang-seungin` 소관.

- **편집/읽기전용 규칙** — `review_reports.submitted_at`이 NULL이면 편집 가능, 값이 있으면 읽기전용. 신청 `status`가 `팀장승인대기`/`승인완료`/`반려`면 읽기전용.

- **완성도 검증** — "다 썼는지"는 5개 항목 모두 `verdict` 있고 `basis` 비어있지 않으며 `recommendation`이 있는 상태. 이 검증 로직은 재사용 가능한 함수로(클라이언트 표시 + `paljang-seungin`의 제출 가드 양쪽에서 사용). 이 스펙에서는 함수 제공 + 클라이언트 경고만.

- **UI** — `Card title="심사보고서"`. 항목마다: 라벨 + 설명 + 판정 라디오(3개) + 근거 textarea. 하단에 종합 의견 textarea + 제안 라디오(수용/반려). '위험' 항목 있으면 상단에 red 요약 배너. 진행도 "n/5 항목 작성". 저장 버튼(자동저장 아님, 명시적 저장).

## Out of Scope

- 팀장에게 올리기 / 승인 / 되돌리기 — `paljang-seungin`.
- AI 초안 생성 — `simsa-bogoseo-ai-choan` (컬럼 `ai_draft_generated_at`만 미리 둠).
- 반려 통보문 — `banryeo-tongbo`.
- 항목 커스터마이즈(항목 추가/삭제) — 5개 고정.
- 심사보고서 PDF 출력/인쇄.
- 과거 심사 이력 대비 비교.

## Further Notes

- `application_id`에 UNIQUE를 걸어 신청당 보고서 1개를 강제.
- 신청 삭제 시 `review_reports`도 캐스케이드 삭제.
- 항목 정의 상수는 `simsa-bogoseo-ai-choan`이 프롬프트 구성에 재사용하므로, `types/index.ts` 또는 공용 모듈(`lib/` 아님, `types/`나 API 공유 모듈)에서 export.
