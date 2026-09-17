# Spec — benchmarking-jijeom (벤치마킹 지점)

> 근거: `docs/PRD.md` 기능 5, `docs/domain-story.md`. 선행: `gyeongjaengsa-josa`, `hangmokbyeol-jeongni`(참고), `gyeongjaengsa-bigyo`(참고).

## Problem Statement

담당자는 경쟁사별 정리·비교 내용을 보다가 "이건 우리도 따라 하면 좋겠다"는 지점을 발견하지만, 지금은 그 판단과 근거를 어디에도 구조적으로 남기지 않는다. 나중에 왜 그 지점을 골랐는지, 어느 경쟁사의 어떤 항목에서 나온 아이디어인지 추적하기 어렵고, 실제 사업에 반영됐는지 진행 상황도 따로 관리되지 않는다.

## Solution

정리·비교 내용을 보다가 따라 할 만하다고 판단한 지점을 경쟁사에 딸린 벤치마킹 지점으로 기록한다. 어느 항목(SKU 수/물류 운영 방식/가격 책정 방식/강점/차별화 요소)에서 나온 아이디어인지, 무엇을 따라 할 것인지, 왜 따라 할 만한지를 남긴다. 이후 실제 사업 반영 진행 상태(검토 중/전략 수립됨/사업 반영됨/보류)와 결과 메모를 담당자가 직접 갱신한다.

## User Stories

1. 담당자로서, 경쟁사 상세 화면에서 벤치마킹 지점을 새로 등록하고 싶다.
2. 담당자로서, 벤치마킹 지점을 등록할 때 어느 항목(SKU 수/물류 운영 방식/가격 책정 방식/강점/차별화 요소)에서 나온 아이디어인지 고르고 싶다.
3. 담당자로서, 무엇을 따라 할 것인지(설명)와 왜 따라 할 만한지(근거)를 각각 적고 싶다.
4. 담당자로서, 한 경쟁사에 여러 개의 벤치마킹 지점을 등록하고 싶다.
5. 담당자로서, 경쟁사 상세 화면에서 그 경쟁사의 벤치마킹 지점 목록을 보고 싶다.
6. 담당자로서, 등록된 벤치마킹 지점의 설명·근거·출처 항목을 나중에 수정하고 싶다.
7. 담당자로서, 더 이상 유효하지 않은 벤치마킹 지점을 삭제하고 싶다.
8. 담당자로서, 벤치마킹 지점마다 실제 사업 반영 상태(검토 중/전략 수립됨/사업 반영됨/보류)를 직접 바꾸고 싶다.
9. 담당자로서, 상태를 바꿀 때 순서를 강제로 지키지 않아도 되면 좋겠다(예: 검토 중에서 바로 보류로, 또는 되돌리기).
10. 담당자로서, 벤치마킹 지점마다 결과 메모(실행 후 어떻게 됐는지)를 자유롭게 적고 싶다.
11. 담당자로서, 경쟁사에 벤치마킹 지점이 하나라도 생기면 그 경쟁사의 조사 상태가 자동으로 '벤치마킹도출'로 올라가길 원한다.
12. 담당자로서, 모든 경쟁사의 벤치마킹 지점을 한 화면에서 전체 목록으로 보고 싶다. 어느 경쟁사에서 나온 것인지 함께 보이면서.
13. 담당자로서, 전체 벤치마킹 지점 목록을 사업 반영 상태로 걸러 보고 싶다. 예를 들어 '전략 수립됨'인 것만.
14. 담당자로서, 사이드바 네비게이션에서 전체 벤치마킹 지점 목록으로 바로 가고 싶다.
15. 담당자로서, 벤치마킹 지점이 어느 항목에서 나왔는지 목록에서 태그로 바로 보고 싶다.
16. 담당자로서, 벤치마킹 지점을 등록한 시각과 마지막으로 상태를 바꾼 시각을 알고 싶다.
17. 담당자로서, 벤치마킹 지점 목록에서 항목을 눌러 그 경쟁사의 정리 문서(해당 항목)로 돌아가 다시 확인하고 싶다.

## Implementation Decisions

- **모듈**
  - `schema.sql` — `benchmark_points` 테이블 블록 추가.
  - `types/index.ts` — `BenchmarkPoint`, `BenchmarkReflectionStatus`, `BENCHMARK_REFLECTION_STATUSES`, `isBenchmarkReflectionStatus` 추가.
  - `app/api/competitors/[id]/benchmark-points/route.ts` — `GET`(경쟁사별 목록), `POST`(등록).
  - `app/api/benchmark-points/[pointId]/route.ts` — `PATCH`(수정), `DELETE`.
  - `app/api/benchmark-points/route.ts` — `GET`(전체 목록, 경쟁사 이름 포함, `?status=` 필터) — 전체 현황 화면용.
  - `app/competitors/[id]/BenchmarkPointsSection.tsx` — 경쟁사 상세의 "벤치마킹 지점" placeholder를 대체하는 목록+등록 UI.
  - `app/benchmarks/page.tsx` — 전체 벤치마킹 지점 현황 화면(신규 페이지).
  - `app/layout.tsx` — nav에 '벤치마킹' 링크 추가.

- **스키마 (`benchmark_points`)**
  - `id` INTEGER PK AUTOINCREMENT
  - `competitor_id` INTEGER NOT NULL REFERENCES competitors(id)
  - `source_item` TEXT NOT NULL — `SummaryItemKey` 값 중 하나(SKU수/물류운영/가격책정/강점/차별화요소)
  - `description` TEXT NOT NULL — 무엇을 따라 할 것인지
  - `rationale` TEXT — 왜 따라 할 만한지, 선택
  - `reflection_status` TEXT NOT NULL DEFAULT '검토중'
  - `result_note` TEXT — 실행 결과 메모, 선택
  - `created_at` TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  - `updated_at` TEXT NOT NULL DEFAULT (datetime('now','localtime'))

  `BenchmarkReflectionStatus = '검토중' | '전략수립됨' | '사업반영됨' | '보류'`. 순서가 있는 값이지만 **강제 전이 없음** — `PATCH`로 어떤 값이든 자유롭게 바꿀 수 있다(경쟁사 상태와 달리 담당자가 전적으로 관리하는 값). `siljeon-jeonryak`이 실행 전략을 붙이더라도 이 상태를 자동으로 바꾸지 않는다 — 담당자가 직접 '전략수립됨'으로 올린다.

- **API 계약**
  - `POST /api/competitors/[id]/benchmark-points` body `{ source_item, description, rationale? }`. `source_item`은 `SummaryItemKey` 5개 값 중 하나가 아니면 400. `description` 필수. 이 경쟁사의 벤치마킹 지점이 하나도 없었다면 저장 후 `advanceStatus`로 경쟁사 상태를 `벤치마킹도출`로 올린다(모노토닉 전진).
  - `GET /api/competitors/[id]/benchmark-points` — 해당 경쟁사 목록, `created_at DESC, id DESC`.
  - `PATCH /api/benchmark-points/[pointId]` — 허용 필드 `source_item, description, rationale, reflection_status, result_note`. `reflection_status`는 `isBenchmarkReflectionStatus` 통과해야 함(순서 제약 없음). 항상 `updated_at` 갱신.
  - `DELETE /api/benchmark-points/[pointId]` — 204. (실행 전략이 딸려 있어도 별도 확인 없이 삭제 — 벤치마킹 지점 하나 단위 삭제는 경쟁사 삭제만큼 무겁지 않다고 본다. 딸린 `strategy_steps`는 함께 삭제한다.)
  - `GET /api/benchmark-points?status=` — 전체 경쟁사에 걸친 벤치마킹 지점 목록. 각 항목에 `competitor_name`을 조인해 포함한다. `updated_at DESC, id DESC`.

- **UI**
  - `BenchmarkPointsSection` — 등록 폼(항목 선택 + 설명 + 근거) + 목록(항목 뱃지, 설명, 근거, 상태 select, 결과 메모 인라인 편집, 삭제).
  - `app/benchmarks/page.tsx` — 상태 필터 탭 + 목록(경쟁사 이름 클릭 시 상세로 이동).
  - 상태 뱃지 색: 검토중 gray, 전략수립됨 blue, 사업반영됨 green, 보류 yellow.

## Out of Scope

- 벤치마킹 지점의 단계별 실행 전략 작성 — `siljeon-jeonryak`.
- 실제 성과(물류비 절감액 등) 계산·추적 — PRD 전체 Out of Scope.
- 벤치마킹 지점 우선순위 매기기, 담당자 배정.
- 삭제 시 자식(실행 전략) 존재 여부 확인 다이얼로그 — 경쟁사 삭제와 달리 여기서는 즉시 삭제로 충분하다고 본다.

## Further Notes

- `app/api/competitors/[id]/route.ts`의 `DELETE` 캐스케이드가 참조하는 `CHILD_TABLES` 배열에 `'benchmark_points'`가 이미 자리 잡혀 있다. 이번 스펙의 테이블명이 정확히 일치하므로 그 배열은 수정할 필요가 없다.
- 경쟁사를 삭제하면 `benchmark_points`가 캐스케이드 삭제되는데, 그 자식인 `strategy_steps`(아직 이 스펙 범위 아님)까지 지우는 일은 `siljeon-jeonryak` 스펙이 `DELETE /api/competitors/[id]`를 확장하며 처리한다 — `benchmark_points`는 `competitors`의 직접 자식이지만 `strategy_steps`는 `benchmark_points`를 거쳐야 하는 손자 관계라 현재의 단순 `CHILD_TABLES` 목록 방식만으로는 표현되지 않는다.
- `source_item`은 `hangmokbyeol-jeongni`의 `SummaryItemKey`와 값을 공유한다 — 새 타입을 만들지 않고 재사용한다.
