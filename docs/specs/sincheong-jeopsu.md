# Spec — sincheong-jeopsu (신청 접수)

> 근거: `docs/PRD.md` 기능 1, `docs/domain-story.md`.

## Problem Statement

영업대리점에서 새 가맹점 신청이 서류묶음으로 들어온다. 담당자는 지금 이 신청들을 종이·엑셀로 관리해서, 어떤 신청이 어느 단계에 있는지(서류 기다리는 중인지, 심사 중인지, 팀장 승인 기다리는지) 한눈에 보기 어렵다.

## Solution

가맹점 신청을 시스템에 등록하고, 전체 신청을 상태별로 보는 목록과 신청별 상세 화면을 제공한다. 신청 하나가 접수부터 승인/반려까지 거치는 상태를 이 기능이 정의하고, 나머지 모든 기능이 이 상태 값을 공유한다.

## User Stories

1. 담당자로서, 대리점이 보낸 신청의 사업자 정보를 입력해 시스템에 등록하고 싶다. 그래야 심사 대상으로 추적할 수 있다.
2. 담당자로서, 신청 등록 시 상호, 사업자등록번호, 대표자, 업종, 사업 형태, 예상 매출 규모, 보낸 영업대리점을 입력하고 싶다. 그래야 이후 심사 항목 판단의 근거 자료가 된다.
3. 담당자로서, 등록 직후 신청이 '접수' 상태로 심사 대기 목록에 뜨는 걸 보고 싶다.
4. 담당자로서, 전체 신청을 목록으로 보고 싶다. 그래야 오늘 처리할 일을 파악한다.
5. 담당자로서, 목록에서 신청을 상태별(접수 / 서류보완 / 심사중 / 팀장승인대기 / 승인완료 / 반려)로 필터링해서 보고 싶다.
6. 담당자로서, 목록에서 각 신청의 상호, 대표자, 업종, 현재 상태, 접수일을 한 줄로 보고 싶다.
7. 담당자로서, 목록에서 신청을 클릭해 상세 화면으로 이동하고 싶다.
8. 담당자로서, 상세 화면에서 그 신청의 사업자 정보 전체와 현재 상태, 상태가 마지막으로 바뀐 시각을 보고 싶다.
9. 담당자로서, 상세 화면에서 잘못 입력한 사업자 정보를 수정하고 싶다.
10. 담당자로서, 대리점이 신청을 취소했거나 중복 등록한 경우 신청을 삭제하고 싶다.
11. 팀장으로서, 목록에서 '팀장승인대기' 상태의 신청만 빠르게 골라 보고 싶다.
12. 담당자로서, 상세 화면에서 이 신청이 지금 어떤 다음 행동을 기다리는지(서류 확인, 심사보고서 작성, 팀장 승인 등) 알고 싶다.
13. 담당자로서, 사이드바 네비게이션에서 심사 목록으로 바로 가고 싶다.
14. 담당자로서, 홈 화면에서 상태별 신청 건수 요약을 보고 싶다.

## Implementation Decisions

- **모듈**
  - `schema.sql` — `applications` 테이블 추가.
  - `types/index.ts` — `Application`, `ApplicationStatus` 타입 추가.
  - `app/api/applications/route.ts` — `GET`(목록, 쿼리로 상태 필터), `POST`(등록).
  - `app/api/applications/[id]/route.ts` — `GET`(상세), `PATCH`(사업자 정보 수정 / 상태 전이), `DELETE`.
  - `app/applications/page.tsx` — 목록 + 상태 필터 + 등록 폼(또는 등록 페이지 링크).
  - `app/applications/[id]/page.tsx` — 상세.
  - `app/page.tsx` — 상태별 건수 요약으로 교체.
  - `app/layout.tsx` — nav에 '심사 목록' 추가.

- **스키마** (`applications`)
  - `id` INTEGER PK AUTOINCREMENT
  - `biz_name` TEXT NOT NULL — 상호
  - `biz_reg_no` TEXT NOT NULL — 사업자등록번호
  - `representative` TEXT NOT NULL — 대표자
  - `industry` TEXT NOT NULL — 업종
  - `business_type` TEXT NOT NULL — 사업 형태 (예: 개인, 법인)
  - `expected_sales` TEXT NOT NULL — 예상 매출 규모 (자유 입력, 예 "월 3,000만원")
  - `agency` TEXT — 영업대리점
  - `status` TEXT NOT NULL DEFAULT '접수'
  - `created_at` TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  - `updated_at` TEXT NOT NULL DEFAULT (datetime('now','localtime'))

- **상태 모델** (`ApplicationStatus`) — 이 스펙이 전체 전이의 정본이다.
  - `접수` — 등록 직후.
  - `서류보완` — 서류묶음에 빠진 게 있어 대리점에 재요청한 상태. (`seoryu-hwagin`이 설정)
  - `심사중` — 서류 확인 완료, 심사보고서 작성 중. (`seoryu-hwagin` 완료 시 진입)
  - `팀장승인대기` — 심사보고서를 팀장에게 올린 상태. (`paljang-seungin` 대상)
  - `승인완료` — 팀장 승인으로 종료. (`paljang-seungin`이 설정)
  - `반려` — 담당자 위험 판단 또는 팀장 반려로 종료. (`banryeo-tongbo`가 설정)
  - 전이: `접수 → 서류보완 ⇄ 심사중 → 팀장승인대기 → 승인완료`, 그리고 `심사중` 또는 `팀장승인대기 → 반려`. `팀장승인대기 → 심사중`(팀장이 보완 요청) 허용.
  - `PATCH /api/applications/[id]`가 상태 전이의 단일 통로. body에 `status`가 오면 위 전이표에 맞는지 검증하고, 안 맞으면 400.

- **API 계약**
  - `GET /api/applications?status=심사중` → `Application[]` (`created_at` 내림차순). `status` 없으면 전체.
  - `POST /api/applications` body: 사업자 정보 필드 전체. `status`는 무조건 `접수`로 세팅(클라이언트 값 무시). → 생성된 `Application`.
  - `GET /api/applications/[id]` → `Application` (없으면 404).
  - `PATCH /api/applications/[id]` body: 사업자 정보 필드(부분) 또는 `status`. `updated_at` 갱신.
  - `DELETE /api/applications/[id]` → 204. 연결된 하위 레코드(서류 확인/심사보고서 등)도 함께 삭제.

- **상세 화면의 "다음 행동" 표시** — `status` 값에서 파생해 문구로 보여준다(별도 컬럼 없음): `접수`→"서류묶음 확인 필요", `서류보완`→"대리점 서류 회신 대기", `심사중`→"심사보고서 작성", `팀장승인대기`→"팀장 승인 대기", `승인완료`/`반려`→"심사 종료".

- **UI** — 상태 뱃지 색: `접수` gray, `서류보완` yellow, `심사중` blue, `팀장승인대기` yellow, `승인완료` green, `반려` red. `components/ui/Badge`, `Button`, `Card` 사용.

## Out of Scope

- 서류묶음 체크리스트, 심사보고서, 승인, 반려 통보 — 각각 별도 스펙. 이 스펙은 `applications` 레코드와 상태 뼈대, 목록/상세 화면만.
- 사용자 인증·권한. 담당자/팀장 역할 구분은 화면 라벨 수준.
- 검색(상호/사업자번호), 페이지네이션 — 나중에 필요하면.
- 서류 원본 파일 업로드.

## Further Notes

- 상세 화면의 하위 섹션(서류 확인, 심사보고서, 승인)은 후속 스펙이 이 페이지에 컴포넌트를 붙이는 방식으로 확장한다. 이 스펙에서는 자리(빈 영역 또는 안내 문구)만 잡아둔다.
- `updated_at`는 애플리케이션 코드에서 `datetime('now','localtime')`로 명시적으로 갱신한다(트리거 안 씀).
