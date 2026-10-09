# 보고서 입력 규약 v1

Python 3.10+와 UTF-8 JSON을 사용한다. 모든 시각은 timezone이 포함된 ISO 8601로 기록한다. `null` 표본은 관측 누락이며 0과 다르다. 상세 예시는 `../assets/example-restart.json`을 참고한다.

## 필수 최상위 필드

| 필드 | 내용 |
| --- | --- |
| `meta` | `id`, `title`, `timezone`(IANA), `version`, `synthetic`(bool), `scope` |
| `window` | `start`, `end`, `baseline_end`; 사건 전후의 관측 범위 |
| `summary` | `status`, `text`, `impact`, `recovery`, `evidence_ids`, `limitations` |
| `metrics` | `id`, `label`, `unit`, `aggregation`, `interval_seconds`, `evidence_ids`, `points` |
| `events` | `id`, `at`, `label`, `kind`, `detail`, `evidence_ids` |
| `evidence` | 근거 배열; 아래 규약 참고 |
| `nodes` | 인과 노드 배열; 아래 규약 참고 |
| `edges` | 검증된 또는 후보인 인과 연결 배열 |
| `investigation` | 조사 기록 배열; 사건 발생 순서와 다름 |
| `actions` | 담당과 완료 기준이 있는 조치 배열 |
| `unknowns` | 미확인 질문 배열; 빈 배열 가능 |

`phases`는 선택 사항이다. `start`, `end`, `label`을 담는다. 인과가 아닌 관측 구간 이름을 사용한다.

## 메트릭·사건

`points`는 `["2026-10-08T21:00:00+09:00", 50000]` 형태의 배열이다. 시간순으로 정렬하고 중복 시간을 금지한다. 적어도 2개 표본을 둔다. 빈 값은 null로 기록하며 NaN/Infinity를 쓰지 않는다. 집계 의미를 `1분 말 세션 수`, `1분 p99, 월드 07` 등으로 명시한다. 선택적 `description` 문자열은 툴팁에 설명으로 표시되며 없으면 aggregation을 사용한다. 지표는 실제 관측 범위만 넣는다.

서로 다른 단위도 하나의 시간축에 색·선 모양을 달리해 겹친다. 표시 전용 범위는 `low=min(0, 관측 최솟값)`, `high=max(0, 관측 최댓값)`이며 높이는 `(원본 값-low)/(high-low)×100%`다. 둘이 같으면 high에 1을 더해 0 나눗셈을 피한다. 이 범위와 정규화를 범례·축에 명시한다. 원본 points는 변환하지 않는다. 선의 높이는 지표 간 절대 크기 비교를 뜻하지 않는다. 툴팁은 커서 시각에 가까운 원본 표본과 실제 표본 시각을 보여주며 보간하지 않는다. null이나 수집 간격보다 큰 공백은 선을 끊는다.

사건 kind는 `observation`, `alert`, `intervention`, `recovery`, `change` 중 하나다. 알림·조치·회복을 관측과 구분한다. `at`은 발생 시각이다. 수신 시각을 써야 한다면 detail에 그렇게 표시한다. 정렬된 원본 사건을 사용한다.

## 근거

필수: `id`, `title`, `source`, `observed_start`, `observed_end`, `retrieved_at`, `sample`, `limitations`.

선택: `query`, `parameters`(object), `source_url`, `archive_url`, `sha256`.

`sample`은 string 또는 JSON object/array다. `source_url`과 `archive_url`은 제공·검증된 HTTP(S) 주소만 사용한다. 토큰·로그인 정보가 들어간 주소를 쓰지 않는다. 실제 링크가 없으면 null로 둔다. 파일 경로는 sample 또는 parameters에 적을 수 있으나 가짜 웹 링크로 바꾸지 않는다. 자료와 쿼리가 실제 없으면 null 또는 미확인이라고 적는다. 가상 예시는 meta.synthetic로 구분한다.

## 인과관계

node 필수: `id`, `label`, `role`, `status`, `statement`, `rationale`, `evidence_ids`, `limitations`.

role은 표시용 텍스트(직접 원인, 촉발 조건, 기여 요인, 중간 원인, 결과)다. status는 `observed`, `verified`, `supported`, `unknown`, `excluded`다. observed 노드는 현상을 확인한 것이며 원인의 검증을 뜻하지 않는다.

edge 필수: `id`, `source`(node ID), `target`, `label`, `status`, `mechanism`, `evidence_ids`, `limitations`. 검증된 노드가 연결됐어도 edge가 자동으로 검증되는 것은 아니다. 모든 연결은 DAG로 작성한다. 재시도 폭주와 같은 순환은 시간 단계별 노드로 나누고 실제 시각·근거를 구분한다. 제외 후보는 보통 조사 과정에 남긴다.

verified/observed/supported 항목은 최소 한 개 근거 ID가 있어야 한다. unknown은 빈 근거 배열이 가능하다. summary.status는 `verified`, `supported`, `unknown`이다. 요약이 verified일 때 최소 한 개 직접 원인 노드를 verified로 두고 role을 `직접 원인` 또는 `direct cause`로 쓴다.

## 조사·조치·미확인

investigation 필수: `id`, `investigated_at`, `question`, `hypothesis`, `prediction`, `observed`, `decision`, `status`, `evidence_ids`, `next_test`.

actions 필수: `id`, `action`, `owner`, `due`, `status`, `verification`, `evidence_ids`. due는 YYYY-MM-DD 또는 null, status는 표시용 문자열이다. 완료라고 쓸 때는 결과 근거를 연결한다.

unknowns 필수: `question`, `owner`, `next_test`.

## 출력과 검증

`validate_report.py`는 필수 필드, 시간대, 범위·정렬, ID 참조, URL scheme, 유한 수치, DAG, 근거 없는 강한 상태를 검사한다. 이것은 형식 검사이며 실제 원인 정확도를 보증하지 않는다.

`render_report.py`는 검증 후 네트워크 요청 없이 단일 HTML과 선택적 Markdown을 생성한다. `--fragment-out`은 대화 내 미리보기를 위한 HTML 조각을 함께 생성한다. 원본 조회는 사용자 클릭으로만 수행한다. 입력 텍스트와 JSON을 HTML에 안전하게 이스케이프한다. 민감 데이터 익명화와 내용 판단은 작성자가 수행한다.
