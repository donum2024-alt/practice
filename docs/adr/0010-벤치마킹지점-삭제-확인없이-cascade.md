# ADR-0010 — 벤치마킹 지점 삭제는 확인 절차 없이 즉시 처리하고 실행 전략도 함께 지운다

## 맥락

벤치마킹 지점에는 딸린 실행 전략(strategy_steps)이 있을 수 있는데, 삭제 시 이를 어떻게 다룰지 정해야 했다. 경쟁사 삭제는 딸린 자식 데이터가 많아 `force` 파라미터 없이는 409로 막힌다.

## 버린 대안

- **경쟁사 삭제처럼 자식(실행 전략) 존재 여부를 확인하는 다이얼로그/`force` 파라미터를 거치게 하는 방식** — 벤치마킹 지점 하나 단위 삭제는 경쟁사 삭제만큼 무겁지 않다고 판단했다.

## 결과

`DELETE /api/benchmark-points/[pointId]`는 추가 확인 없이 204를 반환하며, 같은 트랜잭션에서 딸린 `strategy_steps`도 함께 삭제한다.

## 동작

`tests/benchmarking-jijeom.test.ts`, `tests/siljeon-jeonryak.test.ts` 참조
