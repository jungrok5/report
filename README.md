# Incident Evidence Report · v2

게임·서비스 장애를 **현상 시간축 → 원인·후보 요약 → 인과관계 → 조사 과정 → 근거 → 후속 조치·검토** 순서로 설명하는 보고서 화면과 읽기 전용 조사 엔진입니다. 기존 보고서의 내용·구성을 유지하면서 **React Flow 화면, 근거 저장소, 버전별 검토 기록**을 추가했습니다.

[보고서 열기](https://jungrok5.github.io/report/) · [DB 잠금 예시](https://jungrok5.github.io/report/?case=db-lock) · [클라이언트 재시도 예시](https://jungrok5.github.io/report/?case=client-retry)

페이지 상단에서 세 사례를 선택할 수 있습니다. **모두 가상 사례**이며 실제 과거 장애 3건을 분석한 결과가 아닙니다. 검토자·대조 실험도 명확히 표시된 합성 예시입니다. 실제 운영 시스템과 실제 AI 모델은 실행하지 않았습니다.

## 화면

- **현상부터:** 동접·DB 요청·지연을 한 시간축에 겹칩니다. 프로세스 종료·알림·재기동·로딩·회복을 같은 시간대에 표시합니다. 색과 선 모양을 구분하고 마우스·터치·키보드로 실제 값·단위·원본 표본 시각·설명을 확인합니다.
- **바로 아래 결론:** 직접 원인 또는 가장 유력한 후보, 메커니즘, 영향과 회복을 표시합니다. 유력·미확인·검증됨을 구분합니다.
- **원인 연결:** React Flow와 Dagre를 실제로 사용합니다. 확대·이동하고 노드 또는 연결선을 선택해 설명과 근거를 봅니다. 화면에서 노드를 옮기는 것은 배치 변경이며 인과관계 수정이 아닙니다.
- **조사 과정:** 질문 → 가설 → 예측 → 조회·관측 → 판정 → 다음 확인. 배제한 후보와 모순도 보존합니다.
- **근거:** 쿼리·변수·절대 시간·표본·한계·원본 조회·당시 보존본·SHA-256을 함께 표시합니다. 같은 출처의 보존본은 브라우저에서 실제 바이트 해시를 검증합니다.
- **전달:** 버전별 작성자·검토자·검토 의견·내용 해시를 기록합니다. 검토 완료는 원인 확정과 별개이며 새 버전에 자동 승계되지 않습니다.

단위가 다른 지표의 Y축은 각 관측 범위에 대한 상대 높이입니다. 실제 범위는 범례에, 원본 값은 툴팁에 표시합니다. 지표 간 절대 크기 비교를 뜻하지 않으며 보간하지 않습니다. null과 표본 공백은 끊어진 선으로 표현합니다.

`보고서 JSON 열기`는 파일을 브라우저 안에서만 읽습니다. 업로드하지 않습니다. JSON 다운로드·인쇄/PDF를 지원하고, 검토 의견은 **초안 파일**로 내려받습니다. 공유 기록 반영은 아래 저장소 CLI에서 수행합니다. 이 정적 페이지에는 계정 인증·공유 편집 서버가 없습니다.

## 실제 사용한 구성

| 구성 | 구현 상태 | 역할 |
| --- | --- | --- |
| React / React Flow / Dagre / Vite | **실제 사용** | 보고서 화면, 클릭 가능한 인과 그래프, 자동 배치, 빌드 |
| SVG / React | **실제 사용** | 공통 시간축·툴팁·사건 탐색. ECharts는 사용하지 않음 |
| Python 표준 라이브러리 / SQLite | **실제 사용** | 조회, 근거 바이트 보존, 보고서 버전·검토 저장, 오프라인 HTML/Markdown |
| Prometheus / Loki | 어댑터 구현·모의 HTTP 검증 | 동접·지연·DB 지표 및 게임 로그 range 조회 |
| DB·클라이언트·dump·배포 기록 | JSON import 구현 | 승인된 통계·표본·기록 파일. 직접 SQL 실행은 미구현 |
| HolmesGPT | 연결 코드·모의 HTTP 검증 | 저장된 근거에서 다음 카탈로그 조회·후보 판정 제안 |
| 자체 AI 조사 루프 | 연결 코드·모의 HTTP 검증 | Chat Completions 호환 모델을 같은 조회·검증 루프에 연결 |
| Playwright / GitHub Actions / Pages | 실제 사용 | 브라우저 검증·자동 검증·예시 배포 |
| Grafana / OpenSearch / OpenTelemetry / Quarto / ELK | 전용 조회·실행 미구현 | 실제 제공된 Grafana 조회 링크는 보고서에 표시 가능 |

운영 연결과 실제 모델 호출은 주소·쿼리·인증·자료가 준비된 환경에서 별도로 검증해야 합니다. 예시의 가상 계획 재생은 AI 성능 평가가 아닙니다.

## React 화면 실행

Node.js 24와 Python 3.10+를 사용합니다. 버전은 `package-lock.json`에 고정합니다.

```bash
npm ci
npm run dev
npm run build
```

개발 주소는 `http://127.0.0.1:5173/report/`입니다. 개발 서버에서 예시 파일을 읽도록 먼저 `npm run build`한 후 `npx vite preview --host 127.0.0.1`로 전체 패키지를 볼 수도 있습니다. 빌드 결과는 `site-dist/`이며 운영 자료는 포함하지 않습니다. 다른 저장소 이름으로 복제하면 `vite.config.mjs`의 base를 변경합니다.

## 스킬로 사용

Agent Skills를 지원하는 도구에 `skills/investigate-game-incident` 폴더를 설치합니다. ChatGPT Work에서는 `investigate-game-incident`로 사용할 수 있습니다.

```text
$investigate-game-incident를 사용해 첨부한 메트릭·로그·DB 자료로 보고서를 작성해줘.
현상 시간축을 맨 위에 두고, 원인 후보·배제 근거·남은 질문을 기록해줘.
근거 보존본과 보고서 버전을 저장하고 검토용 JSON도 만들어줘.
```

스킬은 실제 제공된 자료를 분석하고 [입력 규약](skills/investigate-game-incident/references/report-contract.md)에 따라 `incident.json`을 작성합니다. 이 JSON을 페이지에서 열어 같은 화면으로 읽을 수 있습니다. 시안 요청 외에는 가상 예시를 실제 보고서로 제출하지 않습니다.

Python만 있는 환경의 독립 HTML도 유지합니다. 외부 라이브러리나 CDN 없이 직접 열 수 있습니다.

```bash
python skills/investigate-game-incident/scripts/render_report.py incident.json \
  --out report.html --markdown-out report.md
```

[기존 오프라인 예시](https://jungrok5.github.io/report/legacy.html) · [조회 루프 재생 보고서](https://jungrok5.github.io/report/investigation.html)

## 조회·AI 조사·저장

```bash
# 네트워크·모델 없이 6개 조회와 3회 계획을 가상 재생
python skills/investigate-game-incident/scripts/investigate.py \
  skills/investigate-game-incident/assets/engine-demo/config.json \
  --planner replay --out /tmp/new-incident-demo \
  --store /tmp/incidents.sqlite --author '예시 작성자'

# 사람이 정한 bootstrap 조회만 수집하고 원인 미확인 예비 보고서 생성
python skills/investigate-game-incident/scripts/investigate.py config.json \
  --planner collect --out incident-001

# 준비된 endpoint: 수집 → 후보 평가 → 다음 카탈로그 조회 → 재평가
python skills/investigate-game-incident/scripts/investigate.py config.json \
  --planner compatible --out incident-002 --store incidents.sqlite --author '작성자'
# Holmes의 별도 planner 서버를 사용할 때는 --planner holmes
```

[설정 예제](skills/investigate-game-incident/assets/engine-config.example.json)의 주소·메트릭·라벨·기간·파일을 실제 값으로 바꿉니다. 인증은 환경변수로 전달합니다. 모델은 이미 등록된 읽기 카탈로그의 ID만 선택하며 새 URL·셸·SQL을 실행하지 않습니다. 후보를 자동으로 verified로 승격하지 않습니다. 자세한 계약·중단·마스킹·검증 범위는 [engine.md](skills/investigate-game-incident/references/engine.md)를 참조합니다.

결과는 `incident.json`, `report.html/md`, `evidence/*.json`, `plan-*.json`, `manifest.json`, `state.json`입니다. 실패·부분 결과도 예비 보고서에 보존합니다. 실제 모델 전송은 승인된 자료 범위에서 실행합니다.

## 버전과 검토

```bash
python skills/investigate-game-incident/scripts/report_store.py --db incidents.sqlite \
  ingest incident-001/incident.json --evidence-dir incident-001/evidence --author '작성자'

python skills/investigate-game-incident/scripts/report_store.py --db incidents.sqlite \
  export INC-EDIT-ME --revision 1 --out review-r1

# 페이지에서 저장한 검토 초안: report ID·revision·내용 해시가 모두 같아야 반영
python skills/investigate-game-incident/scripts/report_store.py --db incidents.sqlite \
  review-import INC-EDIT-ME-r1-review-draft.json

# 검토 반영 후 새 폴더로 export하여 공유
python skills/investigate-game-incident/scripts/report_store.py --db incidents.sqlite \
  export INC-EDIT-ME --revision 1 --out reviewed-r1
```

저장소는 exact archive bytes·내용 해시·revision·검토 기록을 추가하며 기존 행 UPDATE/DELETE를 거부합니다. DB 소유자가 스키마를 바꾸는 것을 막는 보안 장치는 아니며 검토자 이름도 SSO/전자서명이 아닙니다. 같은 보고서 ID로 수정본을 ingest하면 새 revision을 만들고 검토 대기로 시작합니다. 자세한 절차는 [workbench.md](skills/investigate-game-incident/references/workbench.md)를 참조합니다.

## 검증과 배포

```bash
python -m unittest discover -s skills/investigate-game-incident/scripts -p 'test_*.py' -v
python tests/check_demo.py
python tests/check_cases.py
npm run test:model
npm run build
npx playwright install chromium
npm run test:app
```

브라우저 검증은 세 사례, 노드·연결 선택, 공통 시각 탐색, 보존본 해시, 검토·버전, 로컬 import, 인쇄와 320/390/1100px 레이아웃을 확인합니다. CI는 Python·모델 규약·재생/예시 drift 검사·Vite 빌드를 실행합니다. 예시를 다시 만들 때는 **빈 출력 폴더**에 `python tools/build_cases.py /tmp/new-cases`를 실행합니다.

GitHub Pages는 **Settings → Pages → Source: GitHub Actions**로 설정합니다. main 변경 후 검증한 `site-dist/`만 배포합니다. 공개하는 `docs/cases`는 모두 합성 자료입니다. 운영 자료·실제 SQLite DB는 저장소에 올리지 않습니다.

MIT 라이선스. 외부 로그·메트릭의 권한과 보존 규정은 해당 자료의 조건을 따릅니다.
