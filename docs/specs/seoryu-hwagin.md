# Spec — seoryu-hwagin (서류묶음 확인)

> 근거: `docs/PRD.md` 기능 2, `docs/domain-story.md`. 선행: `sincheong-jeopsu`.

## Problem Statement

대리점이 서류를 빠뜨리고 보내는 경우가 많다. 담당자는 서류묶음(사업자등록증, 통장사본, 등기부등본이나 임대차계약서)이 다 왔는지 확인하고, 빠진 게 있으면 대리점에 다시 요청하고 받을 때까지 기다린다. 이 재요청·대기 과정을 종이로 관리하다 보니 무엇을 언제 요청했는지, 어느 신청이 서류를 기다리는 중인지 놓친다. 담당자가 제일 귀찮아하는 지점이다.

## Solution

신청마다 서류묶음 확인 체크리스트를 둔다. 담당자는 서류 항목별로 '받음/안받음'을 체크하고, 빠진 서류가 있으면 대리점에 재요청한 내역(요청일, 요청한 서류 목록)을 기록한다. 서류를 다 기다리는 동안 신청은 '서류보완' 상태로 목록에서 구분되고, 서류가 다 채워지면 '심사중'으로 넘어가 심사보고서 작성을 시작할 수 있다.

## User Stories

1. 담당자로서, 신청 상세에서 서류묶음 확인 체크리스트를 보고 싶다. 그래야 무엇이 왔고 무엇이 빠졌는지 안다.
2. 담당자로서, 기본 서류 항목(사업자등록증, 통장사본, 등기부등본/임대차계약서)이 미리 준비된 체크리스트를 보고 싶다.
3. 담당자로서, 각 서류 항목을 '받음'으로 체크하거나 다시 해제하고 싶다.
4. 담당자로서, 서류 항목에 메모(예: "임대차계약서로 갈음", "사본 흐림 재요청")를 남기고 싶다.
5. 담당자로서, 빠진 서류가 있을 때 신청을 '서류보완' 상태로 표시하고 싶다. 그래야 목록에서 서류 대기 중인 신청이 구분된다.
6. 담당자로서, 대리점에 서류를 재요청한 내역(요청일, 요청한 서류)을 기록하고 싶다. 그래야 언제 무엇을 요청했는지 남는다.
7. 담당자로서, 한 신청에 대해 재요청을 여러 번 기록하고 싶다(1차 요청 후에도 또 빠뜨려 보내는 경우).
8. 담당자로서, 재요청 내역을 시간순으로 보고 싶다.
9. 담당자로서, 회신이 와서 서류가 다 채워지면 신청을 '심사중'으로 넘기고 싶다. 그래야 심사보고서 작성 단계로 간다.
10. 담당자로서, 서류가 다 체크되지 않았는데 '심사중'으로 넘기려 하면 막히거나 경고를 받고 싶다.
11. 담당자로서, 목록에서 '서류보완' 상태 신청만 필터링해 오늘 회신 왔는지 확인할 신청을 추리고 싶다.
12. 담당자로서, 상세 화면에서 서류 확인 진행도(예: 2/3 받음)를 한눈에 보고 싶다.
13. 담당자로서, 필요 시 표준 항목 외 추가 서류 항목을 체크리스트에 더하고 싶다.

## Implementation Decisions

- **모듈**
  - `schema.sql` — `document_checks`, `document_requests` 테이블 추가.
  - `types/index.ts` — `DocumentCheck`, `DocumentRequest`, `DocType` 타입 추가.
  - `app/api/applications/[id]/documents/route.ts` — `GET`(해당 신청의 체크리스트 + 재요청 내역), `POST`(체크 항목 추가), `PATCH`는 항목별.
  - `app/api/documents/[checkId]/route.ts` — `PATCH`(received 토글 / 메모), `DELETE`(추가 항목 제거).
  - `app/api/applications/[id]/document-requests/route.ts` — `POST`(재요청 기록 추가).
  - `app/applications/[id]/page.tsx` — 서류 확인 섹션 컴포넌트 추가.

- **스키마**
  - `document_checks`: `id` PK, `application_id` NOT NULL(FK applications), `doc_type` TEXT NOT NULL, `received` INTEGER NOT NULL DEFAULT 0, `note` TEXT, `created_at` TEXT DEFAULT localtime.
  - `document_requests`: `id` PK, `application_id` NOT NULL(FK), `requested_docs` TEXT NOT NULL(요청한 서류, 자유 서술 또는 쉼표구분), `requested_at` TEXT NOT NULL DEFAULT localtime.

- **표준 서류 항목** — 상수로 관리: `사업자등록증`, `통장사본`, `등기부등본/임대차계약서`. 신청이 처음 서류 확인 화면에 진입할 때(GET에서 체크 레코드가 0건이면) 이 3개를 자동 생성한다.

- **상태 전이 연동** (`sincheong-jeopsu`의 전이표 사용)
  - '서류보완으로 표시' 액션 → `PATCH /api/applications/[id]` `status: 서류보완`. 재요청 기록과 별개 액션이되, 재요청 기록 시 상태가 `접수`/`심사중`이면 자동으로 `서류보완`으로 전이.
  - '심사 시작' 액션 → 모든 `document_checks.received = 1`인지 서버에서 검증. 하나라도 안 받았으면 400(`{ error, missing: string[] }`). 통과 시 `status: 심사중`.

- **API 계약**
  - `GET /api/applications/[id]/documents` → `{ checks: DocumentCheck[], requests: DocumentRequest[] }`. `checks`가 비어 있으면 표준 3항목을 생성 후 반환.
  - `POST /api/applications/[id]/documents` body `{ doc_type }` → 생성된 `DocumentCheck`.
  - `PATCH /api/documents/[checkId]` body `{ received?: boolean, note?: string }` → 갱신된 `DocumentCheck`.
  - `DELETE /api/documents/[checkId]` → 204 (표준 3항목도 삭제 허용).
  - `POST /api/applications/[id]/document-requests` body `{ requested_docs }` → 생성된 `DocumentRequest`, 필요 시 신청 상태를 `서류보완`으로 전이.

- **UI** — 서류 확인 섹션은 `Card title="서류묶음 확인"`. 각 항목 체크박스 + 메모 인풋. 진행도 "n/m 받음" 텍스트. 하단에 재요청 폼(텍스트 + 버튼)과 재요청 이력 리스트(요청일 + 서류). '심사 시작' 버튼은 전부 받음일 때만 활성, 미충족 시 비활성 + 안내.

## Out of Scope

- 서류 원본 파일 업로드·저장·판독(OCR). 받았는지 여부와 메모만.
- 대리점에 실제 재요청 발송(이메일/문자). 내역 기록까지만.
- 서류 내용의 유효성(사업자등록번호 일치 등) 검증 — 심사보고서 항목에서 담당자가 판단.
- 재요청에 대한 회신 도착 알림/리마인더.

## Further Notes

- `doc_type`을 자유 문자열로 두어 추가 항목을 허용하되, 표준 3항목은 상수 배열로 `types/index.ts` 또는 API 모듈에 정의해 재사용한다.
- '심사 시작' 검증은 서버가 정본. 클라이언트 비활성화는 편의일 뿐.
- 신청 삭제 시 `document_checks`, `document_requests`도 함께 삭제(`sincheong-jeopsu`의 DELETE 캐스케이드에 포함).
