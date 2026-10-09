# 조회·조사 엔진

## 목차

- 실행 모드와 연결 범위
- 운영 설정과 조회 카탈로그
- 조사 반복과 중단
- 보존본·링크·마스킹
- 검토 및 검증 범위

## 실행 모드와 연결 범위

`scripts/investigate.py`는 Python 3.10+ 표준 라이브러리로 실행한다. HTML 화면과 분리된 CLI다. 운영 데이터는 이 CLI에서 조회하고 HTML은 보존된 결과를 표시한다.

```bash
# 네트워크·모델 없이 가상 응답과 작성된 계획을 3회 재생
python scripts/investigate.py assets/engine-demo/config.json --planner replay --out /tmp/new-demo

# 설정한 bootstrap 쿼리만 조회. 원인 미확인 예비 보고서 생성
python scripts/investigate.py /path/to/config.json --planner collect --out /path/to/incident-001

# 수집 근거 → Holmes 계획 → 카탈로그 조회 → 새 근거 평가를 반복
python scripts/investigate.py /path/to/config.json --planner holmes --out /path/to/incident-002
```

출력 폴더는 비어 있어야 한다. 기존 결과를 덮어쓰지 않는다. 재실행은 새 디렉터리에 저장한다. `state.json`은 감사·중단 기록이며 자동 resume 기능은 아니다.

| 연결 | 구현 범위 |
| --- | --- |
| Prometheus | GET `/api/v1/query_range`, 명시적 시간·step·timeout |
| Loki | GET `/loki/api/v1/query_range`, 순방향·로그 상한 |
| DB·클라이언트·dump·배포 기록 | 관측 범위를 가진 JSON 파일 import. 직접 SQL 실행은 미구현 |
| HolmesGPT | POST `/api/chat`, 비스트리밍 structured output의 `analysis` JSON 문자열 해석 |
| Grafana | 입력 근거의 실제 URL을 이용한 재조회. 엔진 기본 링크는 Prometheus/Loki 조회 API URL |
| OpenSearch·Tempo·OpenTelemetry | 전용 조회 어댑터 미구현 |

`replay`는 명시적인 `meta.synthetic=true`에서만 허용한다. 가상 예제를 실제 장애 결론으로 쓰지 말라. 실제 모델 없이 고정 계획을 재생하는 것이며 LLM 성능 평가가 아니다.

## 운영 설정과 조회 카탈로그

`assets/engine-config.example.json`을 사건 작업 디렉터리로 복사하고 주소·시간대·범위·메트릭 이름·라벨·쿼리를 실제 환경에 맞춰 편집하라. `example.invalid`, `YOUR-*`, 예제의 메트릭 이름은 운영 설정이 아니다. DB QPS와 요청 지연의 단위·집계가 실제 쿼리와 맞는지 확인하라. p99는 histogram을 적절히 합친 후 계산하며 여러 p99를 평균하지 말라.

`meta.synthetic`는 필수 boolean이다. `window.start/end/baseline_end`는 timezone-aware ISO 시각이고 end는 미래일 수 없다. `meta.timezone`은 화면 표시용 IANA 이름이다.

```json
{
  "sources": {
    "prom": {
      "kind": "prometheus",
      "base_url": "https://YOUR-PROMETHEUS",
      "bearer_env": "INCIDENT_PROM_TOKEN"
    },
    "logs": {
      "kind": "loki",
      "base_url": "https://YOUR-LOKI",
      "headers_env": {"X-Scope-OrgID": "INCIDENT_LOKI_TENANT"}
    },
    "files": {"kind": "snapshot"}
  },
  "bootstrap": ["ccu", "timeline"]
}
```

토큰·비밀번호는 설정 파일에 쓰지 않고 환경변수로 전달하라. 인증 불필요한 소스에는 `bearer_env/headers_env`를 지정하지 말라. credential이 있는 HTTP는 loopback 테스트 외에는 거부한다. 리다이렉트는 따르지 않는다. TLS 검증은 기본 활성화이며 private CA는 Python 환경에 설정한다.

쿼리 카탈로그는 사람이 정한 읽기 범위다. Planner는 다음 쿼리 ID만 선택하고 PromQL·LogQL·URL·SQL·셸 명령을 새로 만들어 실행할 수 없다. 같은 ID는 한 실행에서 한 번만 조회한다. 전체 batch의 ID와 예산을 요청 전에 검증한다.

Prometheus 쿼리는 정확히 한 시계열을 반환하거나 `series_labels`의 명시적인 일치로 한 시계열을 선택해야 한다. 여러 시계열을 자동 합산/평균하지 않는다. 반환 시각은 range 평가 시각이고 scrape 시각과 다를 수 있다. lookback으로 이전 표본이 사용될 수 있음을 기록한다. 미반환 평가 표본과 NaN/Inf는 null이다. 원래 반환된 평가 시각도 유지한다.

Loki는 streams만 처리한다. `extract_events=true`이면 JSON 로그의 명시적 `at/label/kind/detail` 필드만 사건으로 변환한다. 아래 형태가 아닌 로그도 마스킹 보존하지만 사건 발생 시각을 추측하지 않는다. 자유 형식 로그의 해석은 스킬에서 별도로 하라.

```json
{"at":"2026-10-08T21:05:00+09:00","label":"재기동","kind":"intervention","detail":"조치 기록의 실제 내용"}
```

파일 소스는 설정 파일 위치를 기준으로 읽는다. `format`은 `snapshot`(기본), `prometheus`, `loki`다. 후자의 두 형식은 API 응답 JSON을 그대로 import한다. snapshot 규약:

```json
{
  "observed_start":"2026-10-08T21:02:00+09:00",
  "observed_end":"2026-10-08T21:07:00+09:00",
  "observations":{"db_wait":"제공된 실제 관측","client_sample_count":860},
  "events":[],
  "limitations":"샘플 범위·마스킹·수집 한계"
}
```

설정한 기간 밖의 표본·사건은 오류다. 임의의 전체 DB 접근 대신 해당 사건에서 승인된 통계 export를 import하라.

## 조사 반복과 중단

1. bootstrap 카탈로그 항목을 조회하고 마스킹 보존본·해시를 기록한다.
2. 이미 얻은 근거·사건·질문·판정·실패와 미조회 카탈로그 제목을 planner에 제공한다.
3. planner가 질문/가설/예측/관측/판정/다음 확인 및 `query_ids`를 반환한다.
4. 기존의 성공한 근거 ID만 판정·요약·후보에서 인용할 수 있다. 아직 요청하지 않은 데이터는 판정 근거가 될 수 없다.
5. 계획을 보존하고 새 query ID를 읽는다. 다음 planner 호출에서 새 결과를 평가한다.
6. 새 쿼리가 없으면 종료한다. 횟수·쿼리·기간·응답 크기·시계열 표본·로그 상한을 지킨다.

기본 budget: 12 queries / 4 rounds / 2시간 / 조회 요청당 15초 / planner 요청당 60초 / 응답 2MB / 지표 2,000 points / 로그 500개. 설정 파일에서 조절한다. 총 실행 시간은 각 호출의 timeout과 호출/round budget으로 제한되며 별도 global deadline은 없다.

Planner 계약은 `investigate.py`의 `PLAN_SCHEMA`다. `status`는 unknown/supported/excluded만 허용한다. 원인 후보·연결은 supported로 표시한다. 모델은 verified로 승격할 수 없다. 후보의 `target_event_ids`는 수집한 실제 사건 ID여야 한다. 통제 실험·직접 관계 검증은 사람이 검토하고 별도 보고서 규약으로 기록하라.

로그 상한·API 경고·사건 추출 누락이 있는 근거로 후보를 배제할 수 없다. 조회 실패는 근거 부재나 서비스 정상의 증거가 아니다. 오류가 발생해도 마지막으로 받아들인 분석과 수집 자료로 예비 보고서를 만든다. 실패가 있으면 CLI는 종료 코드 2를 반환한다. 설정 오류는 실행을 중단한다.

### Holmes 서버 설정

`holmes.base_url`, 선택적 `model`, 환경변수 헤더를 설정한다. `model`은 서버의 modelList 키다. **모든 서버 toolset을 끈 별도 planner 인스턴스**를 사용하라. 설정을 확인한 뒤 `server_tools_disabled=true`를 기록한다. 이 값은 운영자가 확인했다는 선언이며 원격 서버 권한을 제한하는 보안 기능이 아니다. HTTP 응답의 tool_calls가 있으면 분석을 거부하지만 이미 실행된 서버 동작을 되돌릴 수는 없다. 이 엔진에 운영 변경 도구를 연결하지 말라.

`enable_tool_approval=true`만으로 읽기 전용을 보장하지 않는다. 모델에는 마스킹된 표본 최대 6,000자/근거와 조회 카탈로그 제목이 전달된다. 해당 데이터의 모델 제공자 전송이 승인된 범위에서만 Holmes 모드를 실행하라. 로그 내용은 신뢰할 수 없는 입력으로 취급한다.

## 보존본·링크·마스킹

산출물:

- `incident.json`, `report.html`, `report.md`: 예비 보고서
- `evidence/E_<query-id>.json`: 쿼리 변수·마스킹 응답·조회 시각·해석 한계
- `plan-<round>.json`: 받아들인 계획·판정
- `manifest.json`: 마스킹 설정·카탈로그
- `state.json`: 쿼리/계획 감사 기록·실패·중단 이유·보존본 해시

SHA-256은 **마스킹 보존본의 정확한 파일 바이트**를 해시한다. 마스킹 전 원본의 무결성 증명이라고 주장하지 말라. 개인정보·토큰 키, JSON 내부 문자열, 알려진 인증 환경값, Bearer 문자열, 이메일, 설정한 `redact_patterns`를 마스킹한다. 임의의 모든 민감정보를 식별할 수 없으므로 공유 전에 결과를 검토한다. 전부 마스킹한 원본을 따로 공개하는 기능은 없다.

원본 링크는 실제 성공/실패 조회에 쓴 API URL과 절대 시간 범위다. 가상 replay에는 운영 원본 링크를 만들지 않는다. 제공된 Grafana URL은 보고서 입력에 별도로 기록할 수 있다. 보존본을 승인된 내부 웹 위치에 올린 경우에만 `archive_base_url`을 설정하라. 엔진은 파일을 업로드하지 않는다. 로컬 보고서는 `evidence/...json` 위치를 기록하며, 예시 사이트에서는 실제 게시한 가상 보존본에 링크한다.

공개 예시에 운영 데이터를 복사하지 말라. docs에 올리는 것은 synthetic 예시만이다.

## 검토 및 검증 범위

로컬 fake HTTP 서버로 Prometheus·Loki 요청 파라미터, Holmes `/api/chat` 요청/응답 계약, 에러 보존, 참조 검증, 예산, redirect 거부, 크기 제한, null 및 다중 시계열 처리 등을 테스트했다. 가상 재생 전체 실행도 테스트했다. 실제 Holmes 서비스/모델·운영 Prometheus/Loki·직접 DB 연결은 이 예시에서 실행하지 않았다. API 버전·인증·쿼리·시간대·누락·모델 비용과 데이터 전송 정책은 연결 환경에서 확인하라.

공식 API 문서(2026-10-09 확인):
- https://prometheus.io/docs/prometheus/latest/querying/api/
- https://grafana.com/docs/loki/latest/reference/loki-http-api/
- https://holmesgpt.dev/latest/reference/http-api/
