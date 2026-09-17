# Spec — hangmokbyeol-jeongni (항목별 정리 문서)

> 근거: `docs/PRD.md` 기능 3, `docs/domain-story.md`. 선행: `gyeongjaengsa-josa`, `jaryo-suchip`.

## Problem Statement

담당자는 경쟁사별로 모은 수집 자료를 보면서 SKU 수, 물류 운영 방식, 가격 책정 방식, 강점, 차별화 요소를 항목별로 문서나 엑셀에 옮겨 적는다. 도메인 스토리에서 이 항목별 정리(3번)가 자료 검색 다음으로 오래 걸리는 지점으로 꼽힌다. 지금은 수집 자료와 정리 결과가 서로 다른 곳에 있어, 정리하면서 자료를 왔다 갔다 확인해야 한다.

## Solution

경쟁사 하나당 정리 문서 하나를 둔다. 5개 항목(SKU 수·물류 운영 방식·가격 책정 방식·강점·차별화 요소)을 자유 텍스트로 채우는 양식이며, 각 항목을 채울 때 그 항목과 관련된(같은 주제로 태그된) 수집 자료를 옆에서 바로 볼 수 있다. 담당자는 아무 때나 저장할 수 있고, 정리가 끝났다고 판단되면 "정리 완료"로 확정한다. 확정은 경쟁사 조사 상태를 앞으로 올리는 계기가 된다.

## User Stories

1. 담당자로서, 경쟁사 상세 화면에서 SKU 수·물류 운영 방식·가격 책정 방식·강점·차별화 요소 5개 항목을 채우는 정리 문서를 보고 싶다.
2. 담당자로서, 각 항목을 자유 텍스트로 적고 언제든 수정하고 싶다.
3. 담당자로서, 항목을 채우다가 저장하지 않고 나가도 지금까지 쓴 내용이 남아 있길 원한다(항목별로 독립적으로 저장).
4. 담당자로서, 각 항목을 채울 때 그 항목과 관련된 태그가 붙은 수집 자료를 바로 옆에서 보고 싶다. 매번 자료 목록으로 옮겨 다니지 않도록.
5. 담당자로서, 관련 수집 자료의 내용을 한 번에 복사해서 정리 항목에 붙여넣고 다듬고 싶다.
6. 담당자로서, 어떤 항목에 참고할 수집 자료가 하나도 없으면(태그된 자료 없음) 그 사실을 눈에 띄게 보고 싶다. 지인·회의로 보완해야 할지 판단하려고.
7. 담당자로서, 항목별 정리가 아직 초안 단계인지, 정리 완료로 확정됐는지 구분해서 보고 싶다.
8. 담당자로서, 5개 항목을 다 채우지 않아도 "정리 완료"로 확정할 수 있으면 좋겠다. 일부 항목은 자료가 끝내 부족할 수 있으니까.
9. 담당자로서, "정리 완료"로 확정하면 경쟁사의 조사 상태가 자동으로 앞단계로 올라가길 원한다.
10. 담당자로서, 이미 정리 완료로 확정한 뒤에도 내용을 자유롭게 더 고치고 싶다(자유로운 수정은 계속 허용).
11. 담당자로서, 확정을 취소하고 다시 초안 상태로 되돌릴 수 있으면 좋겠다. 잘못 확정했을 때를 대비해서.
12. 담당자로서, 정리 문서가 마지막으로 저장되거나 확정된 시각을 보고 싶다.
13. 담당자로서, 아직 정리 문서를 시작하지 않은 경쟁사라면 빈 양식으로 시작하는 걸 자연스럽게 보고 싶다(별도 "생성" 버튼 없이).
14. 담당자로서, 항목 이름이 도메인에서 쓰는 용어(SKU 수, 물류 운영 방식 등) 그대로 표시되길 원한다.
15. 담당자로서, 정리 문서 화면에서 이 경쟁사의 수집 자료 전체 목록으로 바로 이동할 수 있으면 좋겠다.
16. 담당자로서, 저장 중 오류가 나면 어떤 항목이 저장되지 않았는지 알고 싶다.

## Implementation Decisions

- **모듈**
  - `schema.sql` — `summaries` 테이블 블록 추가.
  - `types/index.ts` — `Summary`, `SummaryItemKey`, `SUMMARY_ITEM_KEYS` 추가.
  - `app/api/competitors/[id]/summary/route.ts` — `GET`(조회, 없으면 빈 기본값), `PUT`(upsert 저장/확정).
  - `app/competitors/[id]/ItemSummarySection.tsx` — 정리 문서 UI. `app/competitors/[id]/page.tsx`의 "항목별 정리" placeholder 자리를 대체한다.

- **스키마 (`summaries`)** — 경쟁사당 1행(1:1).
  - `id` INTEGER PK AUTOINCREMENT
  - `competitor_id` INTEGER NOT NULL UNIQUE REFERENCES competitors(id)
  - `sku_count` TEXT — SKU 수
  - `logistics` TEXT — 물류 운영 방식
  - `pricing` TEXT — 가격 책정 방식
  - `strengths` TEXT — 강점
  - `differentiation` TEXT — 차별화 요소
  - `confirmed` INTEGER NOT NULL DEFAULT 0 — 정리 완료 확정 여부
  - `confirmed_at` TEXT — 확정 시각, 미확정이면 NULL
  - `updated_at` TEXT NOT NULL DEFAULT (datetime('now','localtime'))

  `SummaryItemKey = 'SKU수' | '물류운영' | '가격책정' | '강점' | '차별화요소'` — `jaryo-suchip`의 `MaterialTopic`에서 `기타`를 뺀 4자와 동일한 값. 자료-항목 매칭에 그대로 재사용한다. `SUMMARY_ITEM_KEYS`는 컬럼 순서(SKU수→물류운영→가격책정→강점→차별화요소)와 일치하는 배열로 export해, 화면에서 항목 순회에 쓴다.

- **API 계약**
  - `GET /api/competitors/[id]/summary` — 행이 없으면 모든 텍스트 필드가 `null`, `confirmed: false`인 기본 객체를 200으로 반환(별도 생성 없이). 경쟁사 자체가 없으면 404.
  - `PUT /api/competitors/[id]/summary` body `{ sku_count?, logistics?, pricing?, strengths?, differentiation?, confirmed? }`. 행이 없으면 생성, 있으면 부분 갱신(제공된 필드만). `confirmed`가 `false → true`로 바뀌는 순간에만 `confirmed_at`을 현재 시각으로 세팅하고 `advanceStatus`로 경쟁사 상태를 `정리완료`로 올린다. `true → false`(확정 취소)는 `confirmed_at`을 `null`로 되돌리되 경쟁사 상태는 건드리지 않는다(모노토닉 전진 원칙 — 자동 강등 없음). `true → true`(이미 확정된 문서를 계속 수정)는 `confirmed_at`을 그대로 둔다.

- **관련 자료 참조 패널** — 항목별로 `GET /api/competitors/[id]/materials?topic=<해당 SummaryItemKey>`를 호출해 옆에 읽기 전용으로 나열한다. 각 자료 항목에 "이 내용 복사" 버튼을 두어 클릭 시 해당 항목 텍스트 영역 끝에 자료 내용을 붙여넣는다(자동 저장은 아님 — 담당자가 다듬은 뒤 저장).

- **UI** — 5개 항목을 세로로 나열, 각 항목 좌측에 텍스트 영역(정리 내용), 우측에 관련 자료 리스트(비어 있으면 "관련 자료 없음" 안내). 상단에 확정 상태 뱃지(초안/정리완료)와 확정/확정취소 버튼, 마지막 저장·확정 시각 표시.

## Out of Scope

- 항목별 정리 내용의 AI 자동 초안 생성 — `jeongni-ai-choan`.
- 여러 경쟁사 정리 문서를 나란히 비교 — `gyeongjaengsa-bigyo`.
- 항목 추가/삭제(항목 종류를 담당자가 늘리거나 줄이는 것) — 5개 항목은 고정.
- 정리 문서 버전 이력(과거 수정 내역 조회) — 최신 상태만 관리.

## Further Notes

- `app/api/competitors/[id]/route.ts`의 `DELETE` 캐스케이드가 참조하는 `CHILD_TABLES` 배열에는 이미 `'summaries'`가 자리를 잡아 두고 있다(향후 스펙이 실제 테이블명을 넣는다는 전제로 미리 추측된 이름). 이번 스펙의 테이블명이 정확히 `summaries`이므로 그 배열은 수정할 필요가 없다 — 존재 확인 후 정상적으로 카운트·캐스케이드 삭제 대상에 포함된다.
- 관련 자료 참조 패널은 `jaryo-suchip`의 `topic` 태그에 의존한다. 태그가 없는(미분류) 자료는 어떤 항목 패널에도 나타나지 않는다 — 이는 의도된 동작이다(미분류 자료는 자료 목록 전체에서만 보임).
