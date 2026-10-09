# 데이터 연동과 도입

## 현재 구현과 후보의 구분

현재 구현은 Python 표준 라이브러리 검증·렌더러와 직접 작성한 HTML/CSS/JavaScript/SVG 화면이다. 상단 그래프·툴팁·원인 그래프에 외부 런타임 라이브러리를 사용하지 않는다. Playwright는 화면 검증에만 사용하고 GitHub Actions/Pages는 테스트·배포에 사용한다. 아래 Prometheus/Grafana, OpenTelemetry, HolmesGPT, React Flow, Dagre/ELK, ECharts, Quarto는 연동·확장 후보 또는 참고 자료이며 현재 코드에 연결되지 않았다. 보고서 작성 절차를 구현한 것과 실데이터 자동 조사 엔진을 구현한 것을 혼동하지 말라.

기존 장애 3건으로 보고서 형식을 검증한 뒤 조회를 연결한다. 관측 시스템을 교체하지 않는다. Prometheus/Grafana, Loki/OpenSearch, DB 대기·쿼리 통계, 클라이언트 정보, dump, 배포·조치 기록에서 범위를 좁혀 읽고 각 결과를 evidence로 저장한다.

OpenTelemetry는 메트릭·로그·트레이스 연결에 활용한다. 게임 TCP는 요청 단위 span과 correlation ID를 연결한다. 장시간 연결 하나로 모든 요청을 분석하지 않는다. 개인·세션 ID를 메트릭 라벨로 무제한 추가하지 않는다.

HolmesGPT는 조사 엔진 후보다. 게임 고유 데이터, 조사 상태, 근거 보존, 보고서 규약은 별도 연동한다. 이 스킬은 백그라운드 모니터링이나 자동 복구 시스템이 아니다.

기본은 정적 HTML 렌더러를 사용한다. 편집·협업은 React Flow와 Dagre/ELK, 시계열 탐색은 ECharts를 검토한다. JSON과 근거는 기존 DB·객체 저장소에 보존한다. 첫 버전에 그래프 DB·벡터 DB를 필수로 추가하지 않는다.

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
