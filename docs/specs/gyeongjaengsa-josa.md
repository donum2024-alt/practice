# Spec — gyeongjaengsa-josa (조사 대상 경쟁사 관리)

> 근거: `docs/PRD.md` 기능 1, `docs/domain-story.md`. 이 스펙이 경쟁사 레코드와 조사 상태 모델의 정본을 소유한다. 나머지 모든 기능이 여기에 붙는다.

## Problem Statement

담당자는 평소 눈여겨보던 경쟁사, 또는 회장님·경영진이 언급한 경쟁사를 조사 대상으로 정한다. 여러 경쟁사를 동시에 들여다볼 때가 많은데, 지금은 어느 회사를 어디까지 조사했는지(자료만 모았는지, 항목별 정리까지 끝냈는지, 벤치마킹 지점을 뽑았는지)를 따로 관리할 곳이 없다.

## Solution

조사할 경쟁사를 도구에 등록하고 목록으로 관리한다. 경쟁사마다 이름·메모·회장님/경영진 언급 여부를 남기고, 조사 진행 상태를 한눈에 본다. 경쟁사 하나가 이 도구에서 이뤄지는 모든 작업(자료 수집 → 항목별 정리 → 비교 → 벤치마킹 지점 → 실행 전략)의 컨테이너가 된다.

## User Stories

1. 담당자로서, 새 경쟁사를 이름과 함께 등록해서, 조사 대상 목록에 올리고 싶다.
2. 담당자로서, 경쟁사 등록 시 간단한 메모(왜 조사하는지, 어디서 들었는지 등)를 남기고 싶다.
3. 담당자로서, 이 경쟁사가 회장님·경영진이 언급한 회사인지 표시해서, 우선순위를 구분하고 싶다.
4. 담당자로서, 경쟁사에 홈페이지 주소를 남겨서, 나중에 자료 수집의 출발점으로 쓰고 싶다.
5. 담당자로서, 등록한 경쟁사 전체를 한 목록에서 보고 싶다.
6. 담당자로서, 각 경쟁사의 조사 진행 상태(조사 중 / 자료 수집됨 / 정리 완료 / 벤치마킹 도출)를 목록에서 바로 확인하고 싶다.
7. 담당자로서, 회장님·경영진이 언급한 경쟁사를 목록에서 눈에 띄게 보고 싶다.
8. 담당자로서, 경쟁사 상태별로 걸러 보거나 정렬해서, 아직 손대지 않은 경쟁사를 빠르게 찾고 싶다.
9. 담당자로서, 경쟁사 하나를 눌러 상세 화면으로 들어가, 그 경쟁사의 수집 자료·정리 문서·벤치마킹 지점·실행 전략을 한자리에서 보고 싶다.
10. 담당자로서, 경쟁사 이름·메모·홈페이지·언급 여부를 나중에 수정하고 싶다.
11. 담당자로서, 잘못 등록했거나 더 이상 볼 필요 없는 경쟁사를 삭제하고 싶다. 단, 정리 문서나 벤치마킹 지점이 딸려 있으면 실수로 지우지 않도록 확인받고 싶다.
12. 담당자로서, 경쟁사의 조사 상태를 직접 바꿀 수 있으면 좋겠다(예: 정리를 마쳤으니 '정리 완료'로). 단, 자연스러운 진행은 각 기능이 자동으로 올려 주면 더 좋다.
13. 담당자로서, 홈에서 전체 경쟁사 수와 상태별 분포를 한눈에 보고, 눌러서 해당 목록으로 이동하고 싶다.
14. 담당자로서, 같은 경쟁사를 중복 등록하려 하면 알림을 받고 싶다.
15. 담당자로서, 경쟁사 목록을 최근 등록순 또는 최근 작업순으로 보고 싶다.

## Implementation Decisions

- **모듈**
  - `schema.sql` — `competitors` 테이블 블록 추가.
  - `types/index.ts` — `Competitor`, `CompetitorStatus`, 상태 상수/전이/가드 함수. 이 파일이 상태 모델 정본.
  - `app/api/competitors/route.ts` — `GET`(목록, `?status=` 필터), `POST`(등록).
  - `app/api/competitors/[id]/route.ts` — `GET`(상세), `PATCH`(수정: 이름·메모·홈페이지·언급 여부·상태), `DELETE`(삭제).
  - `app/competitors/page.tsx` — 경쟁사 목록 + 등록 폼.
  - `app/competitors/[id]/page.tsx` — 경쟁사 상세 쉘. 이후 기능들이 이 화면에 섹션을 추가한다.
  - `app/page.tsx` — 홈을 경쟁사 상태별 현황판으로 교체.
  - `app/layout.tsx` — nav에 '경쟁사' 링크 추가.
  - `components/StatusBadge.tsx` — 경쟁사 상태 뱃지로 교체(또는 신규 `CompetitorStatusBadge`).

- **스키마 (`competitors`)**
  - `id` INTEGER PK AUTOINCREMENT
  - `name` TEXT NOT NULL — 경쟁사 이름
  - `homepage` TEXT — 홈페이지 주소, 선택
  - `note` TEXT — 메모, 선택
  - `mentioned_by_exec` INTEGER NOT NULL DEFAULT 0 — 회장님·경영진 언급 여부
  - `status` TEXT NOT NULL DEFAULT '조사중'
  - `created_at`, `updated_at` TEXT NOT NULL DEFAULT (datetime('now','localtime'))

- **상태 모델** — `CompetitorStatus = '조사중' | '자료수집됨' | '정리완료' | '벤치마킹도출'`.
  - 순서가 있는 진행 단계다. 각 기능이 자연스러운 시점에 상태를 앞으로 올린다: `jaryo-suchip`에서 수집 자료가 처음 생기면 `자료수집됨`, `hangmokbyeol-jeongni`에서 정리 문서가 확정되면 `정리완료`, `benchmarking-jijeom`에서 지점이 처음 생기면 `벤치마킹도출`.
  - 담당자가 `PATCH`로 상태를 직접 지정할 수도 있다(뒤로 되돌리기 포함). 자동 전이는 "더 앞선 상태로만" 올리고, 이미 더 앞서 있으면 건드리지 않는다(monotonic forward).
  - `types/index.ts`에 `COMPETITOR_STATUSES` 배열, `isCompetitorStatus()` 가드, `advanceStatus(current, target)` 헬퍼(target이 더 앞이면 target, 아니면 current)를 export.

- **API 계약**
  - `POST /api/competitors` body `{ name, homepage?, note?, mentioned_by_exec? }`. `name` 필수·trim 후 비어 있으면 400. 같은 `name`(trim, 대소문자 무시)이 이미 있으면 409 + 기존 레코드 반환.
  - `GET /api/competitors?status=` — 상태 필터 선택. 정렬은 `updated_at DESC, id DESC`(최근 작업순). 알 수 없는 status는 400.
  - `PATCH /api/competitors/[id]` — 허용 필드 `name, homepage, note, mentioned_by_exec, status`. 부분 수정. `status`는 `isCompetitorStatus` 통과해야 함. 항상 `updated_at` 갱신.
  - `DELETE /api/competitors/[id]` — 딸린 데이터(수집 자료/정리 문서/벤치마킹 지점) 유무를 응답에 알려 주는 건 클라이언트 확인 다이얼로그용. 서버는 `?force=1`일 때만 실제 삭제, 아니면 409 + 딸린 데이터 건수. 삭제 시 자식 레코드도 함께 삭제(정리 문서, 수집 자료, 벤치마킹 지점, 실행 전략).

- **홈** — `GET /api/competitors`로 전체를 받아 상태별 건수 집계. 상태 카드 클릭 시 `/competitors?status=...` 로 이동. 총 건수 표시.

## Out of Scope

- 경쟁사 자료 수집 자체 — `jaryo-suchip`.
- 항목별 정리 문서 — `hangmokbyeol-jeongni`.
- 경쟁사 여러 곳 비교 화면 — `gyeongjaengsa-bigyo`.
- 산업/카테고리 분류 태그, 경쟁사 그룹화 — 이번 범위 아님. 필요하면 `note`로.
- 경쟁사별 담당자 지정 — 담당자 1인 사용 전제.

## Further Notes

- 예시 코드의 `applications` 관련 스키마·타입·라우트·페이지(`app/applications/*`, `app/api/applications/*`, `app/api/_shared/documents.ts`, `app/api/documents/*`)는 이 기능을 구현하면서 제거한다.
- nav 아이콘은 `lucide-react`에서 고른다(예: 경쟁사 목록에 `Building2` 또는 `Users`).
- 상태 뱃지 색: 조사중 gray, 자료수집됨 blue, 정리완료 teal, 벤치마킹도출 green 정도.
