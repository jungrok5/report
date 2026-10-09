# 장애 보고서 목적 적합성 — 외부 관련팀의 적대적 검토

대상: `/workspace/scratch/51f8bae0cc7a/incident-evidence-skill`

검토 목적: 제목 → 무슨 일이 있었나 → 원인으로 핵심을 빠르게 파악하고, 조사 과정을 따라 결론을 납득하며 원본 근거를 다시 확인할 수 있는가. 서버 다운·동접 급락·지연을 장비·DB·클라이언트·개발자 로그로 반복적으로 좁히는가.

판정: **화면·저장 형식은 그 목적의 일부를 담고 있지만, 현재 상태로는 조사 엔진의 배제 판정과 PDF 전달 결과를 신뢰하고 업무를 인수하기 어렵다.** 공개 사례의 합성 표시가 부족하다는 주장이 아니다. 실제 자료에 적용할 때 정보 손실이 발생하고, 성공한 단기 예시만으로 그 손실이 드러나지 않는다는 문제다.

소스는 수정하지 않았다. 운영 시스템이나 공개 사이트를 조회하지 않았다. 브라우저 재현은 `site-dist`를 Playwright request routing으로 전부 로컬 응답한 결과다. 코드를 최초 읽은 시각은 2026-10-09 14:24:55 UTC, 아래 경로별 재확인·해시는 14:28:57 UTC에 기록했다. 독립 수정이 가능한 공유 작업 환경이므로 이후 변경에는 이 결과를 그대로 적용할 수 없다.

## P1 — 모델은 후반부 메트릭을 못 보는데 조사 결과에는 그 메트릭이 있다

근거: `scripts/investigate.py:299`는 `sample = dumps(raw)[:6000]`으로 자른다. `context():393–398`은 evidence와 events를 보내지만 `self.metrics`는 보내지 않는다. 원본 보존본 경로는 모델이 읽을 수 있는 도구가 아니고, `accept():466–467`은 이미 수집한 query ID를 다시 선택할 수 없게 한다.

로컬 반례:

```text
121개 1분 메트릭, 마지막 값만 987654321
metric_final = 987654321.0
sample_len = 6000
spike_in_context = false
metrics_in_context = false
incomplete = false
```

즉, 보고서 차트에는 큰 이상값이 있는데 planner에게 전달한 어떤 문자열에도 그 값이 없다. 장애가 창 후반부에 발생하거나 개발자 로그·클라이언트 표본의 앞부분이 정상 기록으로 채워졌을 때, 조사 모델은 원인 관련 근거를 수집하고도 못 읽는다. 사람이 원본을 확인해 다른 결론에 도달하면 전달된 자동 조사 이력을 납득할 수 없다.

최소 수정: UI 표시용 excerpt와 조사 입력을 분리한다. 수집한 normalized metrics, 각 원본의 전체 크기·실제 절단 여부·누락 구간을 planner context에 전달한다. 입력 예산을 넘으면 전체 시간범위를 대표하는 구간별 요약과 이상 구간 원본을 우선 제공하거나, 저장된 근거의 구간을 다시 읽는 제한된 기능을 제공한다. 단순히 6,000자를 늘리는 변경은 최대 2,000포인트/2MB 입력까지 일반화되지 않는다. 현재 context가 실제로 본 근거 범위를 기록해야 한다.

재현 스크립트: `/tmp/purpose-adversarial-work/repro.py`의 `TAIL_SPIKE`.

## P1 — 표본 대부분이 누락돼도 incomplete=false이고 배제 판정을 통과시킨다

근거: `prometheus():331–336`은 반환되지 않은 평가 시각을 null로 만든다. 그러나 incomplete 판단에 쓰이는 limitations에 `부분`이 붙는 경우는 `not values`뿐이다(`343–346`). `collect():302`는 문자열 접두어로 incomplete를 판정하고, `accept():463–464`는 그 flag만 보고 excluded를 막는다.

로컬 반례: 26개 예상 시각 중 처음·마지막 두 표본만 50,000을 반환했다.

```text
null_points = 24
incomplete = false
accepted_status = excluded
```

그 근거로 “전 구간 동접 정상으로 종료 후보를 배제한다”는 plan을 `accept()`에 주면 오류 없이 수용된다. 동접만으로 프로세스 종료를 배제하는 의미 오류까지 자동 검사하라는 요구가 아니다. **명백한 시간범위 누락을 알고도 ‘불완전 자료로 배제하지 않음’이라는 기존 방어선을 통과시키는 것**이 문제다. 실제 모델도 정상 앞뒤 표본만 보고 같은 실수를 낼 수 있다.

최소 수정: 예상 평가 시각 수, 실제 유효값 수, null/비유한값 수, 최대 연속 누락, 커버된 범위를 구조화해 기록한다. 누락이 있는 근거로 전구간 부재를 주장하는 배제는 막거나 실제 완전한 하위 범위로 제한한다. sparse 값이 있는 경우를 포함한 반례를 추가한다.

재현 스크립트: `/tmp/purpose-adversarial-work/repro.py`의 `SPARSE_EXCLUDED`.

## P1 — 인쇄/PDF에는 선택하지 않은 조사 단계의 판단 근거가 빠진다

근거: `main.jsx:425,570–587`은 선택한 조사 단계 한 개의 가설·예측·관측·다음 확인만 렌더링한다. 조사 목록(`554–567`)은 모든 질문과 판정만 담는다. 인쇄 CSS(`style.css:525–578`)는 hidden 탭을 열지만 선택하지 않은 상세 데이터를 새로 렌더링하지 않는다. 원인 노드·edge 상세도 선택한 항목 한 개만 렌더링된다(`main.jsx:520–538`).

DB 잠금 사례를 기본 선택 상태에서 print media로 바꿔 확인:

| 단계 | 가설 | 예측 | 관측 |
| --- | --- | --- | --- |
| I1: 서버 종료/OOM 배제 | 있음 | 있음 | 있음 |
| I2: DB 대기 경로 조사 | 없음 | 없음 | 없음 |
| I3: 잠금→지연 대조 검증 | 없음 | 없음 | 없음 |

특히 결론을 verified로 만드는 I3의 대조 실험 설명이 보고서 본문에서 사라진다. 사용자가 I3를 먼저 클릭하면 I3는 나오고 I1/I2가 빠진다. 따라서 같은 보고서 revision이라도 **클릭 상태가 전달 내용을 바꾼다.** 증거 부록에 E_test 원시 sample이 존재하는 것은 조사 논증의 누락을 해결하지 않는다.

`tests/react-browser.cjs:233–235`의 인쇄 검증은 `.print-evidence`가 visible인지 확인할 뿐, 전체 조사 내용이 인쇄되는지 검사하지 않는다. 사건 상세는 이 사례의 E_events 원시 JSON 부록에 포함되므로 “모든 사건 데이터가 없어짐”이라고 단정하지 않는다. 다만 사건 버튼 목록은 인쇄에서 숨겨져, 차트의 사건 번호를 자연스럽게 읽는 본문 목록도 빠진다.

최소 수정: 인쇄용 독립 본문에 전체 사건 목록, 전체 노드·edge의 설명/판단/한계, 전체 조사 단계의 가설·예측·관측·판정·근거 ID·다음 확인을 렌더링한다. 현재 화면의 선택 상태를 인쇄 입력으로 사용하지 않는다. 모든 핵심 필드 포함 여부를 검증한다.

재현 스크립트: `/tmp/purpose-adversarial-work/browser.cjs`의 `PRINT`.

## P2 — 첫 화면에서 ‘무슨 일이 있었나’와 원인을 함께 읽을 수 없다

근거: `main.jsx:458–459`은 전체 인터랙티브 Timeline을 결론보다 먼저 둔다. Timeline은 325px 차트 외에 범례·설명·탐색기·설명·사건 버튼·선택 사건 상세·주의 문장을 모두 포함한다. 요약 현상 문단은 따로 없고, 사용자가 차트와 현재 선택한 사건에서 조합해야 한다.

1100×800 viewport, DB 잠금 기본 화면의 실제 위치:

```text
제목 y = 218.8px
원인 요약 시작 y = 1103.8px
화면 높이 = 800px
```

즉, 제목을 보고 “로그인 지연”을 안 다음, 원인 상태와 검증 범위까지 알려면 화면을 더 내려야 한다. 첫 사건은 정산 작업 시작이고, 그것을 장애 전체의 현상 설명으로 읽기 어렵다. 좁은 화면은 더 많은 설명/버튼 줄바꿈이 있다. 공개 restart 제목 `자동 조사 예시 · 다운과 재기동 후 지연 후보`는 실제 사건으로 사용할 제목 규칙을 충분히 보여주지도 못한다.

최소 수정: 제목 아래 현상 1–2문장(대상, 실제 이상 발생/회복 시각, 사용자 영향)을 놓고, 바로 이어 원인/유력 후보와 검증 범위를 짧게 둔다. 그 다음 확장 가능한 상세 시간축을 배치한다. 시간축을 상단에 유지해야 한다면 첫 화면에는 compact 현상 요약+축만 보여주고 긴 탐색 설명은 접는다. 검증 기준은 “제목·현상·원인 상태가 일반 데스크톱 첫 화면에 함께 있음”으로 잡는다.

## P2 — 합성 ‘검증됨’ 사례는 실제로 필요한 재현 근거의 모습을 보여주지 않는다

근거: `docs/cases/db-lock/incident.json`은 summary와 직접 원인, N1→N2→N3 연결을 verified로 둔다. 근거 E_test sample은 아래뿐이다.

```json
{
  "blocker_disabled": {"p99_ms":95,"row_waiters":0},
  "blocker_enabled": {"p99_ms":5020,"row_waiters":181},
  "same_workload":true,
  "synthetic_experiment":true
}
```

실제 사건이 아님은 명시돼 있다. 이 항목을 실제 검증으로 오인했다는 비판이 아니다. 그러나 관련팀이 “어떻게 같은 부하를 만든 것인가, 어떤 로그인 경로·빌드·DB 격리수준·표본 수에서 재현한 것인가, blocker 외 다른 변수가 달랐는가”를 재확인할 자료 형식을 이 사례는 제시하지 않는다. `same_workload: true`는 원본 검증 절차 대신 결론을 한 번 더 기록한 주장이다. E_db도 blocker·waiters 숫자 요약이며 재조회 query는 `승인된 DB 잠금 대기 통계 export`라는 표시용 문구다.

최소 수정: 합성 예시에도 실험 run ID, 대상 빌드/환경, 부하 정의/스크립트, 동일 조건과 변경 변수, 실행 시각, 요청 수와 p99 산출 범위, 반복 결과/원본 실행 기록을 넣는다. 해당 요소가 없으면 `대조 결과 요약(절차 원본 없음)`이라는 한계를 E_test에 직접 표시한다. 실행 환경 연결을 지금 하라는 요구는 아니다.

## P2 — 로컬 조사 결과를 전달할 때 원본 보존본 확인 절차가 화면에서 끊긴다

근거: 실제 설정 예제에는 `archive_base_url`이 없다. 엔진은 로컬 evidence 파일을 만들지만 archive_url은 null(`investigate.py:291–300`). `main.jsx:117–138`은 HTTP(S) archive_url이 있어야 링크와 해시 버튼을 제공한다. 저장소 export(`report_store.py`)는 evidence 폴더를 함께 만들지만, JSON을 UI에 import해도 그 폴더를 읽는 선택 기능은 없다.

따라서 공개 합성 사례에서는 가능한 “보존본 해시 확인”이 기본 실제 수집→저장→export→JSON 열기 흐름에서는 제공되지 않는다. evidence 파일이 존재하고 CLI ingest의 해시 검사도 있으므로 **보존본이 소실되는 문제는 아니다.** 관련팀 독자는 외부 게시 위치를 준비하거나 수동으로 파일/해시를 찾는 추가 절차를 밟아야 한다. 긴 자료는 표본만 받아 보면 P1의 잘린 내용과도 연결된다.

최소 수정: evidence 보존본 파일을 로컬 선택해 해시 확인·원본 전체 열람하는 기능을 추가하거나, 전달 묶음에 반드시 넣을 파일과 독자의 로컬 해시 확인 방법을 UI에서 직접 안내한다. 실제 내부 게시 주소가 준비됐을 때만 archive_url을 생성하는 기존 원칙은 유지한다.

## 미검증 영역 및 해석 제한

- 실제 Holmes/compatible 모델, 실제 Prometheus/Loki, 직접 DB·클라이언트 연계는 호출하지 않았다. 어떤 모델이 반례를 잘 피하는지와 실제 운영 RCA 정확도는 이 검토로 알 수 없다.
- 브라우저 검증은 기존 `site-dist` 빌드의 로컬 replay다. 당시 빌드 인쇄 로직과 읽은 소스가 같은 패턴임은 확인했지만, 빌드를 새로 만들어 source-to-build byte 대응을 확인하지 않았다.
- full PDF 생성·페이지 나눔·한국어 폰트 인쇄 품질은 확인하지 않았다. 위 누락은 브라우저 print media의 visible text에서 확인했다.
- 6,000자 문제는 원본 후반에만 있는 수치 메트릭으로 재현했다. 모든 로그 문자열 유형과 부분 JSON을 모델이 읽는 행동은 확인하지 않았다.
- 저장소의 version/review 구조는 읽었지만 DB 변조·동시성·신원 인증을 보안 평가하지 않았다. 원인 검증과 검토 승인을 별개로 표시하는 기존 문구는 본 검토의 문제 대상이 아니다.
- UI가 실제 관련팀 독자의 이해 시간을 얼마나 줄이는지 사용자 연구는 없다. P2 화면 위치는 측정 결과이며 이해도 결론은 그 목적에 대한 리뷰어 판단이다.
- 공개 세 사례는 한정된 25분 창과 세 메트릭이다. 날짜를 넘는 장애, 시계 오차, 여러 월드의 상반된 현상, 후속 장애, 두 개 동시 원인, 장기 조사 revision을 독자가 구분하는 능력은 확인하지 않았다.

## 검토 파일 시각과 해시

최초 내용 읽기: 2026-10-09T14:24:55Z부터 14:28:57Z까지. 아래는 해당 경로를 다시 읽어 기록한 UTC 시각과 SHA-256이다. 경로의 기준 디렉터리는 `/workspace/scratch/51f8bae0cc7a/incident-evidence-skill/`이다.

| 경로 | 재확인 시각 UTC | SHA-256 |
| --- | --- | --- |
| `web/src/main.jsx` | 2026-10-09T14:28:57.094967+00:00 | `b809e9435dcce21eb224690fa9bb054bdd06e083fde12ec822c0c90bc804575c` |
| `web/src/model.mjs` | 2026-10-09T14:28:57.095443+00:00 | `3ff2b6d98593cd8fc49c69812b61d99d7afefc9bcbbcb13955f79e3cc34e4145` |
| `web/src/Timeline.jsx` | 2026-10-09T14:28:57.095525+00:00 | `3c5361a277fffb6d7a14b149dfd8db2a889c06e3417b8f1df0f1ebf644668104` |
| `web/src/style.css` | 2026-10-09T14:28:57.095568+00:00 | `40751fcdf64215e1bb64b953c73f264a207751882ca07f9ce6d83bda9153cb18` |
| `skills/investigate-game-incident/scripts/investigate.py` | 2026-10-09T14:28:57.095668+00:00 | `f2230428511e585f8751d37f552536257b8d1ea029fc102f1a7284e9cba7a15a` |
| `skills/investigate-game-incident/scripts/validate_report.py` | 2026-10-09T14:28:57.095765+00:00 | `a468cdf074d1ff10b8cbb127aed6566a4053276f5f8718bd400593bcc10ca30a` |
| `skills/investigate-game-incident/scripts/report_store.py` | 2026-10-09T14:28:57.095869+00:00 | `2c91b408e2482837b3e106770ab154bdad2e5288582d7bcd828dd56989e45cd5` |
| `skills/investigate-game-incident/scripts/render_report.py` | 2026-10-09T14:28:57.095927+00:00 | `d2e73e2640bbd2e2876d837c23f2b4edf1ce1a09464c65406edf9ccd1ac3d9d7` |
| `skills/investigate-game-incident/references/report-contract.md` | 2026-10-09T14:28:57.095992+00:00 | `3c01d8a73bf71e2d22e2df30359ecad59aae8cf2ce905e65c644f73c315e5a1d` |
| `skills/investigate-game-incident/references/engine.md` | 2026-10-09T14:28:57.096036+00:00 | `184c4f56b32c96fb3f053cb57e0adeb21d1c13cf031cc0d4f0759b754b0f4e37` |
| `skills/investigate-game-incident/references/workbench.md` | 2026-10-09T14:28:57.096083+00:00 | `14c50ec434114520ef5800f4d4ee45d5a505086fd65147520650ab0053463653` |
| `skills/investigate-game-incident/references/writing.md` | 2026-10-09T14:28:57.096156+00:00 | `ca36a018086aed23a22f0e75fa8ba48c9260126ea30924f8b77cbff7673b30d5` |
| `skills/investigate-game-incident/assets/engine-demo/config.json` | 2026-10-09T14:28:57.096221+00:00 | `b3f0d2526078ee1012cf843e5c9a83db1526e53390fd1beac21f6e9a35a2bd5d` |
| `skills/investigate-game-incident/assets/engine-config.example.json` | 2026-10-09T14:28:57.096254+00:00 | `8a1b2ef463a4ed1466d8f3f68ed3360254bcc6e9ac9977596a2ada6b1b82ea4d` |
| `docs/cases/restart/incident.json` | 2026-10-09T14:28:57.096434+00:00 | `eb119b329304db2967b2d45b5d57fd4ab7c1e39a916ba90d684e639cba456007` |
| `docs/cases/db-lock/incident.json` | 2026-10-09T14:28:57.096634+00:00 | `aa3b6ac89e5f41b7c5c340483ddb0b4f6cc018a389d6d678b55f363cbddec7f7` |
| `docs/cases/client-retry/incident.json` | 2026-10-09T14:28:57.096760+00:00 | `b609c4a5e9356f95d7b7dd7ffefa369f12e874b372dea3df916a4dc57b8d75a7` |
| `tests/react-browser.cjs` | 2026-10-09T14:28:57.096863+00:00 | `9431d9c528707c6fd6a9be44a750a12671a12d2cc1691c768805e66ddf970dfe` |
| `README.md` | 2026-10-09T14:28:57.097033+00:00 | `29581cfce5f98d2a0f9e7c4d41270c62e4a6fe9e4bb2f9072d89fea2100892e6` |
| `site-dist/index.html` | 2026-10-09T14:28:57.097086+00:00 | `4d71c5be9beec77ee50b00b8e770fc3866242f75496a077c04aa833759620df2` |
