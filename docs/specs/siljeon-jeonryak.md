# Spec — siljeon-jeonryak (단계별 실행 전략)

> 근거: `docs/PRD.md` 기능 6, `docs/domain-story.md`. 선행: `benchmarking-jijeom`.

## Problem Statement

벤치마킹 지점을 뽑아도, 그것을 실제로 어떻게 실행할지 구체적인 프로세스와 단계별 방법이 없으면 사업에 반영되지 않고 아이디어로만 남는다. 지금은 이 실행 계획을 남길 곳이 없다.

## Solution

벤치마킹 지점마다 실행을 위한 단계를 순서대로 추가·편집한다. 각 단계는 짧은 실행 방법 설명이다. 담당자가 벤치마킹 지점과 관련 수집 자료를 바탕으로 한 AI 초안 제안을 요청하면, AI가 단계 후보를 제안하고 담당자가 검토해 선택한 것만 실제 단계로 저장한다.

## User Stories

1. 담당자로서, 벤치마킹 지점 하나에 실행 단계를 순서대로 추가하고 싶다.
2. 담당자로서, 각 단계는 짧은 설명(무엇을 어떻게 하는지)으로 적고 싶다.
3. 담당자로서, 이미 추가한 단계의 내용을 수정하고 싶다.
4. 담당자로서, 필요 없어진 단계를 삭제하고 싶다.
5. 담당자로서, 단계 순서를 위아래로 옮겨 재배치하고 싶다.
6. 담당자로서, 벤치마킹 지점 화면에서 그 지점에 딸린 실행 단계 목록을 순서대로 보고 싶다.
7. 담당자로서, "AI 초안 제안" 버튼을 눌러 벤치마킹 지점 내용과 관련 수집 자료를 바탕으로 한 단계 후보를 받고 싶다.
8. 담당자로서, AI가 제안하는 동안 진행 상황이 스트리밍으로 보이면 좋겠다.
9. 담당자로서, AI가 제안한 단계 후보 중 필요한 것만 골라 실제 단계로 저장하고 싶다.
10. 담당자로서, AI 제안을 그대로 쓰지 않고 저장 전에 문구를 다듬고 싶다.
11. 담당자로서, AI 제안이 실패하면(claude CLI 오류 등) 에러를 보고 다시 시도하고 싶다.
12. 담당자로서, AI 제안을 진행 중에 중단할 수 있으면 좋겠다.
13. 담당자로서, 실행 단계가 하나도 없는 벤치마킹 지점은 "아직 실행 전략 없음"으로 구분해서 보고 싶다.
14. 담당자로서, 벤치마킹 지점을 삭제하면 그에 딸린 실행 단계도 함께 정리되길 원한다.
15. 담당자로서, 경쟁사를 통째로 삭제할 때도 그 경쟁사의 모든 벤치마킹 지점과 실행 단계가 함께 정리되길 원한다.
16. 담당자로서, 각 단계가 몇 번째 단계인지 번호로 보고 싶다.

## Implementation Decisions

- **모듈**
  - `schema.sql` — `strategy_steps` 테이블 블록 추가.
  - `types/index.ts` — `StrategyStep` 타입 추가.
  - `app/api/benchmark-points/[pointId]/steps/route.ts` — `GET`(순서대로 목록), `POST`(단계 추가).
  - `app/api/strategy-steps/[stepId]/route.ts` — `PATCH`(설명 수정 또는 순서 변경), `DELETE`.
  - `app/api/ai/draft-strategy/route.ts` — `POST { benchmarkPointId }`. SSE 스트리밍. `CLAUDE.md`의 `spawn` + `ReadableStream` + `text/event-stream` 패턴.
  - `app/competitors/[id]/BenchmarkPointsSection.tsx` — `benchmarking-jijeom`이 만든 컴포넌트를 확장해, 각 벤치마킹 지점 항목 안에 실행 단계 목록 + 추가/편집/삭제/순서이동 + AI 초안 제안 UI를 덧붙인다(새 컴포넌트를 따로 만들지 않는다).
  - `app/api/competitors/[id]/route.ts` — `DELETE` 캐스케이드 확장(아래 참고).

- **스키마 (`strategy_steps`)**
  - `id` INTEGER PK AUTOINCREMENT
  - `benchmark_point_id` INTEGER NOT NULL REFERENCES benchmark_points(id)
  - `step_order` INTEGER NOT NULL — 1부터 시작하는 순번
  - `description` TEXT NOT NULL
  - `created_at` TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  - `updated_at` TEXT NOT NULL DEFAULT (datetime('now','localtime'))

- **순서 규칙**
  - 새 단계 추가 시 `step_order`는 해당 벤치마킹 지점의 현재 최대값 + 1(없으면 1)로 자동 부여한다. 클라이언트가 순서를 지정하지 않는다.
  - 순서 이동(`PATCH`로 `step_order` 변경)은 대상 단계와 그 자리에 있던 단계를 맞바꾸는 방식(swap)으로 처리한다 — 전체 재정렬 없이 인접 단계와 값을 교환.
  - 삭제 시 뒤 단계들의 `step_order`를 1씩 당겨 빈 번호가 생기지 않게 한다.

- **API 계약**
  - `GET /api/benchmark-points/[pointId]/steps` — `step_order ASC` 정렬.
  - `POST /api/benchmark-points/[pointId]/steps` body `{ description }`. `description` 필수.
  - `PATCH /api/strategy-steps/[stepId]` body `{ description? }` 또는 `{ direction: 'up' | 'down' }`(순서 이동 전용, 인접 단계와 `step_order` swap). 두 종류의 요청을 한 엔드포인트가 받되 body 형태로 구분한다.
  - `DELETE /api/strategy-steps/[stepId]` — 204. 삭제 후 같은 `benchmark_point_id`의 뒤 단계 `step_order`를 재정렬.

- **AI 초안 제안 (`POST /api/ai/draft-strategy`)**
  - 입력: `benchmarkPointId`로 `benchmark_points` 레코드(설명·근거·출처 항목) 및 소속 `competitors` 레코드를 조회. 없으면 404. 같은 `source_item`으로 태그된 해당 경쟁사의 `collected_materials`도 함께 조회해 프롬프트에 포함한다.
  - 프롬프트: "다음 벤치마킹 지점을 실제로 실행하기 위한 단계별 실행 방법을 제안하라. 각 단계는 한두 문장으로, 실행 순서대로 나열할 것." + 벤치마킹 지점 설명/근거 + 관련 수집 자료 요약.
  - 출력: JSON 한 덩어리 `{ steps: [string, ...] }`. "JSON 외 다른 텍스트를 출력하지 말 것" 명시.
  - 스트리밍·파싱·중단·에러 처리는 `jaryo-suchip`의 `app/api/ai/collect-materials/route.ts`와 동일한 패턴(줄 단위 `data: ` 프레이밍, 코드펜스 제거 후 JSON 파싱, `AbortController`, ENOENT 메시지 등)을 그대로 따른다. 이 스펙에서 새로 정의하지 않고 재사용한다.
  - 파싱 성공 시 각 단계 문자열을 체크박스 목록으로 보여주고, 선택한 것만 순서대로 `POST /api/benchmark-points/[pointId]/steps`로 저장한다(선택 순서 = 저장 순서 = `step_order`).

- **UI** — 벤치마킹 지점 항목을 펼치면: 실행 단계 번호 목록(수정/삭제/위·아래 이동 버튼) + 하단에 "단계 추가" 입력 + "AI 초안 제안" 버튼(스트리밍 원문 접이식 표시 → 체크박스 검토 → 선택 저장).

- **DELETE 캐스케이드 확장** — `strategy_steps`는 `competitors`의 직접 자식이 아니라 `benchmark_points`를 거친 손자 테이블이므로, `app/api/competitors/[id]/route.ts`의 `CHILD_TABLES` 이름 목록 방식으로는 걸러지지 않는다. 이 스펙이 그 라우트를 다음과 같이 확장한다: 자식 건수 집계 시 `SELECT COUNT(*) FROM strategy_steps WHERE benchmark_point_id IN (SELECT id FROM benchmark_points WHERE competitor_id = ?)`를 추가 항목으로 합산하고, 실제 삭제(`force=1`) 시에도 `benchmark_points` 삭제 **이전에** 이 하위 쿼리로 `strategy_steps`를 먼저 지운다(FK 순서상 자식부터 삭제).

## Out of Scope

- 실행 전략의 담당자 지정, 마감일·일정 관리.
- 단계별 완료 체크(진행률 추적) — 벤치마킹 지점의 `reflection_status`가 전체 진행 상태를 담당한다.
- AI 초안의 자동 저장 — 항상 담당자 선택 후 저장.
- 여러 벤치마킹 지점의 실행 전략을 한 화면에 모아 보는 별도 뷰.

## Further Notes

- AI 초안 제안은 PRD가 "있으면 좋은 수준"으로 표시한 기능이다. 단계별 양식(추가/편집/삭제/순서이동)이 핵심이고, AI 제안은 그 위에 가벼운 보조 기능으로 얹는다 — 이 기능이 없어도 실행 전략 작성 자체는 완결된다.
- `app/api/ai/draft-strategy/route.ts`는 `jaryo-suchip`의 SSE 프레이밍(각 줄 `data: ` 프리픽스) 구현을 그대로 재사용한다. 새 프레이밍 방식을 고안하지 않는다.
