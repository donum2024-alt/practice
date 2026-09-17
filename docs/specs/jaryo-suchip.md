# Spec — jaryo-suchip (자료 수집)

> 근거: `docs/PRD.md` 기능 2, `docs/domain-story.md`. 선행: `gyeongjaengsa-josa`.

## Problem Statement

담당자가 경쟁사를 정하면, 그 경쟁사의 홈페이지·뉴스·관련 기사를 하나씩 검색해 필요한 내용을 모은다. 도메인 스토리에서 담당자가 첫 번째로 꼽은 불편이 바로 이 검색이 오래 걸린다는 점이다. 원하는 정보가 자료로 잘 안 나오는 경쟁사는 뉴스·기사를 더 찾고, 그래도 부족하면 업계 지인에게 묻거나 내부 회의에서 논의해 얻는데, 이렇게 얻은 조각 정보도 흩어져 관리된다.

## Solution

경쟁사별로 수집 자료를 한곳에 쌓는다. 경쟁사 이름(과 홈페이지)을 넣고 '자료 수집'을 누르면 AI가 웹에서 홈페이지·뉴스·기사를 검색해 찾은 내용을 자료 항목으로 정리해 준다. 담당자는 결과를 검토해 필요한 것만 남기고, 직접 찾은 기사나 업계 지인·내부 회의에서 얻은 정보를 자료로 붙여넣어 보완한다. 각 자료에는 출처(웹 검색 / 직접 입력 / 지인·회의)와 원문 링크를 남긴다. 여기 모인 수집 자료가 `hangmokbyeol-jeongni`와 `jeongni-ai-choan`의 입력이 된다.

## User Stories

1. 담당자로서, 경쟁사 상세 화면에서 '자료 수집' 버튼을 눌러, AI가 그 경쟁사를 웹에서 조사하게 하고 싶다.
2. 담당자로서, AI가 경쟁사 홈페이지·뉴스·관련 기사를 검색 대상으로 삼는다는 걸 알고 싶다.
3. 담당자로서, AI가 조사하는 동안 진행 상황(무엇을 찾고 있는지)이 실시간으로 보이면 좋겠다. 다 끝날 때까지 빈 화면을 기다리지 않게.
4. 담당자로서, AI가 찾은 내용을 여러 개의 자료 항목으로 나눠 받고 싶다. 각 항목에는 요지, 출처 이름, 원문 링크가 있으면 좋겠다.
5. 담당자로서, AI가 찾은 자료 중 쓸모없는 것은 버리고 필요한 것만 남기고 싶다.
6. 담당자로서, AI 조사를 한 번 더 돌려서 자료를 추가로 모을 수 있으면 좋겠다. 이미 모은 자료는 그대로 두고 새로 찾은 것만 더해지길 원한다.
7. 담당자로서, 내가 직접 찾은 기사 내용을 붙여넣고 출처와 링크를 달아 자료로 추가하고 싶다.
8. 담당자로서, 업계 지인이나 내부 회의에서 들은 내용을 자료로 적고, 출처를 '지인·회의'로 표시하고 싶다.
9. 담당자로서, 자료마다 어떤 항목(SKU 수 / 물류 운영 방식 / 가격 책정 방식 / 강점 / 차별화 요소 / 기타)에 관한 것인지 태그를 달아 두면, 나중에 정리할 때 편할 것 같다.
10. 담당자로서, 자료 내용을 나중에 수정하거나 삭제하고 싶다.
11. 담당자로서, 경쟁사의 모든 수집 자료를 한 목록에서 보고, 출처별·항목별로 걸러 보고 싶다.
12. 담당자로서, AI 조사가 실패하면(claude CLI 오류, 검색 불가 등) 에러 메시지를 보고 다시 시도하고 싶다.
13. 담당자로서, AI 조사를 진행 중에 중단할 수 있으면 좋겠다.
14. 담당자로서, AI가 찾은 정보는 부정확할 수 있으니 항상 내가 검토한 뒤 저장된다는 걸 알고 싶다.
15. 담당자로서, 수집 자료가 하나라도 생기면 경쟁사 상태가 '자료 수집됨'으로 올라가면 좋겠다.
16. 담당자로서, AI가 찾은 자료인지 내가 넣은 자료인지 구분해서 보고 싶다.
17. 담당자로서, 자료가 언제 수집됐는지 시각을 보고 싶다.
18. 담당자로서, AI가 확실한 정보를 못 찾은 항목은 "자료 부족"이라고 알려 주면, 지인에게 물어볼 목록으로 삼고 싶다.

## Implementation Decisions

- **모듈**
  - `schema.sql` — `collected_materials` 테이블 블록 추가.
  - `types/index.ts` — `CollectedMaterial`, `MaterialSource`, `MaterialTopic` 타입과 상수.
  - `app/api/competitors/[id]/materials/route.ts` — `GET`(경쟁사의 자료 목록), `POST`(수동 자료 추가).
  - `app/api/materials/[materialId]/route.ts` — `PATCH`(수정), `DELETE`.
  - `app/api/ai/collect-materials/route.ts` — `POST` body `{ competitorId }`. SSE 스트리밍. `CLAUDE.md`의 `spawn('claude', ['-p', prompt])` + `ReadableStream` + `text/event-stream` 패턴. `claude`가 웹 검색 도구를 쓰도록 실행.
  - `app/competitors/[id]/page.tsx` — '수집 자료' 섹션: 'AI 자료 수집' 버튼 + 스트리밍 수신 + 결과 검토/선택 UI + 수동 자료 추가 폼 + 자료 목록.

- **스키마 (`collected_materials`)**
  - `id` INTEGER PK AUTOINCREMENT
  - `competitor_id` INTEGER NOT NULL REFERENCES competitors(id)
  - `content` TEXT NOT NULL — 자료 내용(요지 또는 붙여넣은 원문)
  - `source_type` TEXT NOT NULL — `웹검색` | `직접입력` | `지인회의`
  - `source_name` TEXT — 출처 이름(매체명, 사이트명 등), 선택
  - `source_url` TEXT — 원문 링크, 선택
  - `topic` TEXT — `SKU수` | `물류운영` | `가격책정` | `강점` | `차별화요소` | `기타`, 선택(미분류 허용)
  - `created_at` TEXT NOT NULL DEFAULT (datetime('now','localtime'))

- **AI 자료 수집 (`POST /api/ai/collect-materials`)**
  - 입력: 라우트가 `competitorId`로 `competitors` 레코드 조회(이름, 홈페이지, 메모). 없으면 404.
  - 프롬프트: "다음 건설자재 유통 경쟁사를 웹에서 조사해, 홈페이지·뉴스·기사에서 확인되는 사실을 정리하라. 특히 SKU 수(취급 품목 수), 물류 운영 방식, 가격 책정 방식, 강점, 차별화 요소에 주목하라." 출처와 링크를 반드시 함께 낼 것, 확인 안 되는 항목은 추측하지 말고 "자료 부족"으로 표시할 것을 명시.
  - `claude` 실행 시 웹 검색이 가능하도록 필요한 플래그/권한 옵션을 붙인다(`--allowedTools` 등 CLI가 요구하는 형태). 정확한 플래그는 구현 시 `claude` CLI 도움말로 확정.
  - 출력 형식: **JSON 한 덩어리** — `{ materials: [{ content, source_name, source_url, topic }], gaps: [string] }`. `topic`은 위 6개 값 중 하나 또는 생략. `gaps`는 "자료 부족" 항목 설명.
  - "JSON 외 다른 텍스트를 출력하지 말 것" 명시.

- **스트리밍 & 파싱**
  - 서버: `claude` stdout 청크를 `data: <chunk>\n\n`로 그대로 전달. `close` 시 종료. 오류/비정상 종료 시 `event: error\ndata: <메시지>\n\n` 후 종료. `claude.stdin?.end()` 호출과 중단 시 child `kill` 정리 포함.
  - 클라이언트: 청크를 이어 붙여 raw 텍스트를 접이식 "조사 중" 영역에 흘려보여 줌. 스트림 종료 후 코드펜스 제거 + 첫 `{`/마지막 `}` 슬라이스 후 `JSON.parse`.
  - 파싱 성공: `materials` 각 항목을 체크박스 목록으로 보여 주고, 담당자가 선택한 것만 `POST /api/competitors/[id]/materials`(source_type=`웹검색`)로 저장. `gaps`는 안내 문구로 표시(지인에게 물어볼 목록).
  - 파싱 실패: 에러 표시 + raw 텍스트 유지 + '다시 시도'.

- **중단** — 클라이언트 `AbortController`로 `fetch` 취소. 서버는 request abort/스트림 취소 시 `claude` child `kill`.

- **에러 처리** — `claude` 실행 불가(ENOENT) → error 이벤트 "claude CLI를 찾을 수 없습니다". 비정상 종료 → stderr 수집분을 error 이벤트로. 클라이언트는 red 메시지 + '다시 시도'.

- **재실행** — 이미 자료가 있어도 새로 실행 가능. 결과는 기존 자료에 더해지며 덮어쓰지 않는다. 중복 방지는 하지 않는다(담당자가 선택 단계에서 거른다).

- **상태 연동** — 자료가 처음 하나 생기면(수동/AI 무관) `advanceStatus`로 경쟁사 상태를 `자료수집됨`으로 올린다.

- **API 계약**
  - `POST /api/competitors/[id]/materials` body `{ content, source_type, source_name?, source_url?, topic? }`. `content` 필수. `source_type`은 3개 값 중 하나. AI 저장 시에도 이 엔드포인트 재사용.
  - `PATCH /api/materials/[materialId]` — 허용 필드 `content, source_name, source_url, topic`.
  - `GET /api/competitors/[id]/materials?source=&topic=` — 필터 선택. 정렬 `created_at DESC, id DESC`.

## Out of Scope

- 자료 원본 파일(PDF, 엑셀, 이미지) 업로드·저장·OCR — 텍스트로만.
- AI 검색 결과의 자동 저장(담당자 선택 없이) — 항상 검토 후 저장.
- 경쟁사 소식 자동 모니터링·주기 실행·알림 — 담당자가 수동 실행.
- 자료 원문 전체 크롤링·아카이브 — 요지 + 링크만.
- 자료 중복 자동 감지·병합.
- 웹 검색 외 유료 DB(신용정보 등) 연동.

## Further Notes

- `CLAUDE.md`의 AI 패턴 스니펫을 기준으로 하되, 웹 검색을 켜는 CLI 옵션은 구현 시 `claude --help`로 확정하고 스펙에 반영한다.
- AI 응답이 코드펜스(```json)를 붙일 수 있으므로 파싱 전 방어.
- `topic` 태그는 정리 단계(`jeongni-ai-choan`)에서 자료를 항목별로 묶는 데 쓰인다. 필수는 아니다.
- 검색 품질이 낮은 경쟁사(비상장 소형사 등)에서는 `gaps`가 길게 나올 수 있고, 이는 정상이다. 담당자가 지인·회의 경로로 보완한다.
