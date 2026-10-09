# 데이터 연동과 도입

## 현재 구현과 후보의 구분

현재 구현은 React / React Flow / Dagre 보고서 화면, Python 표준 라이브러리 검증·오프라인 렌더러, 읽기 전용 조회·조사 CLI와 SQLite 근거·버전 저장소다. 현상 차트는 SVG로 작성했다. Prometheus/Loki API 조회 어댑터와 DB·클라이언트·dump 파일 import, 근거 보존, HolmesGPT HTTP planner와 Chat Completions 호환 자체 planner 연결을 구현했다. [workbench.md](workbench.md)는 보고서 화면·버전·검토 절차를 설명한다. 상세 설정과 검증 범위는 [engine.md](engine.md)를 읽어라. Playwright는 검증에만 쓰고 GitHub Actions/Pages로 가상 예시를 배포한다. 실제 운영 주소나 Holmes 모델이 없는 예제에서는 가상 응답·고정 계획을 재생하며 실제 시스템/모델을 실행하지 않는다.

React Flow와 Dagre는 사용 중이다. ECharts, ELK, Quarto, OpenSearch, Tempo, OpenTelemetry 전용 연동은 미구현 확장 후보다. 보고서 작성 절차·조회 어댑터·LLM 연결 코드·실제 운영 검증을 구분하라.

기존 장애 3건으로 보고서 형식을 검증한 뒤 조회를 연결한다. 관측 시스템을 교체하지 않는다. Prometheus/Grafana, Loki/OpenSearch, DB 대기·쿼리 통계, 클라이언트 정보, dump, 배포·조치 기록에서 범위를 좁혀 읽고 각 결과를 evidence로 저장한다.

OpenTelemetry는 메트릭·로그·트레이스 연결에 활용한다. 게임 TCP는 요청 단위 span과 correlation ID를 연결한다. 장시간 연결 하나로 모든 요청을 분석하지 않는다. 개인·세션 ID를 메트릭 라벨로 무제한 추가하지 않는다.

HolmesGPT는 선택적인 다음 가설·쿼리 ID planner로 연결한다. 근거 수집과 게임 고유 자료 import, 상태·해시 보존, 보고서 변환은 이 CLI가 수행한다. 이 스킬은 백그라운드 모니터링이나 자동 복구 시스템이 아니다.

배포 페이지는 React Flow와 Dagre를 사용하고 독립 HTML 렌더러는 유지한다. 공유 편집·SSO는 미구현이며 시계열 탐색 확장이 필요하면 ECharts를 검토한다. JSON·근거 바이트·검토는 SQLite에 저장하고 내부 객체 저장소로 내보낼 수 있다. 첫 버전에 그래프 DB·벡터 DB를 필수로 추가하지 않는다.

원본 링크의 내부 권한을 유지한다. Grafana 절대 시간과 query/datasource/variables를 보존한다. Snapshot은 쿼리를 제거하므로 유일한 증거로 쓰지 않는다. 결과·표본 파일 해시를 보존하고 공유본은 익명화한다.

참고(2026-10-09 확인):
- https://sre.google/sre-book/effective-troubleshooting/
- https://sre.google/sre-book/example-postmortem/
- https://grafana.com/docs/grafana/latest/visualizations/dashboards/share-dashboards-panels/
- https://github.com/HolmesGPT/holmesgpt
- https://opentelemetry.io/docs/
- https://reactflow.dev/learn/layouting/layouting
- https://github.com/apache/echarts
- https://quarto.org/docs/computations/ojs.html
