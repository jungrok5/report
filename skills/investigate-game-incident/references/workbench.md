# React Flow 화면·근거 저장·검토

## 목차

- 보고서 화면과 조사 엔진의 경계
- 버전 저장과 검토 전달
- 수정본과 검토 초안
- 가상 사례와 실제 장애 3건 검증

## 보고서 화면과 조사 엔진의 경계

GitHub 저장소 `https://github.com/jungrok5/report`의 `web/`는 React / React Flow / Dagre를 실제로 사용하는 보고서 화면이다. 기존 순서인 현상 시간축 → 핵심 결론 → 인과관계 → 조사 과정 → 근거·후속 조치를 유지한다. SVG 시계열은 React로 작성하며 ECharts는 사용하지 않는다. Vite로 번들링하여 CDN 없이 배포한다. Python 스킬의 독립 HTML 템플릿도 유지한다.

페이지 `https://jungrok5.github.io/report/`에서 `incident.json`을 브라우저 내부로 import할 수 있다. 업로드·공유 저장·운영 조회는 하지 않는다. 그래프 이동은 배치만 바꾸며 사실·연결을 편집하지 않는다. 화면은 노드와 연결 각각의 근거 상태를 표시하고 클릭하면 근거를 읽는다. 자료 import 전에 validate_report.py를 실행하라. 화면도 시간·참조·DAG·상태·검토 내용 해시를 검사한다.

원본 조회 주소와 당시 마스킹 보존본 주소를 구분하라. 파일은 읽는 사람에게 허용된 내부 위치에 별도로 게시한다. archive_url이 같은 origin이면 브라우저가 정확한 파일 바이트를 받아 SHA-256을 비교한다. 외부 origin은 해당 시스템에서 다운로드한 파일로 검증한다. 로컬 파일 위치를 가짜 웹 주소로 바꾸지 말라.

## 버전 저장과 검토 전달

모든 evidence에 sha256과 `<evidence-id>.json` 원본 보존 바이트가 있어야 `report_store.py`에 등록할 수 있다. 엔진은 이를 생성한다. 사람이 입력한 과거 사건 자료도 조회·범위·표본·마스킹 결과를 별도로 보존하고 정확한 바이트 해시를 입력해야 한다.

```bash
python scripts/report_store.py --db /internal/incidents.sqlite ingest /incident/incident.json \
  --evidence-dir /incident/evidence --author '작성자'
python scripts/report_store.py --db /internal/incidents.sqlite export INC-001 \
  --revision 1 --out /internal/review-r1
```

out은 비어 있어야 한다. export는 `incident.json`과 `evidence/*.json`을 생성한다. 화면에서 export JSON을 열거나 독립 HTML을 생성한다. `governance`의 revision·작성자·내용 해시·created_at·검토 의견·이력을 전달본에 포함한다. `content_canonical`은 검토 메타데이터를 붙이기 전 저장한 JSON 문자열이다. 브라우저는 그 정확한 UTF-8 해시와 실제 화면 내용의 동등성을 확인한다.

SQLite는 evidence bytes를 SHA별로 저장하고 버전은 보고서 ID별로 증가한다. 자료와 version_evidence 참조를 한 transaction으로 저장한다. UPDATE/DELETE를 거부하는 trigger가 있지만 DB 소유자가 스키마를 바꾸는 것을 막는 보안 경계는 아니다. 내용 해시는 서명이나 근거의 진실성 증명이 아니다.

## 수정본과 검토 초안

페이지에서 검토자·의견·판정을 입력하면 **초안 JSON만 다운로드**한다. report_id·revision·version_sha가 저장된 버전과 일치할 때만 CLI로 반영하라.

```bash
python scripts/report_store.py --db /internal/incidents.sqlite review-import review-draft.json
# 직접 입력도 지원
python scripts/report_store.py --db /internal/incidents.sqlite review INC-001 --revision 1 \
  --reviewer '검토자' --decision changes_requested --note '대조 실험과 관측 공백 확인 필요'
```

검토 후 새 빈 폴더에 export하라. 같은 검토자의 마지막 의견을 사용하고, 누구든 마지막 의견이 수정 요청이면 delivery_status는 changes_requested다. 한 명 이상 검토 완료이고 수정 요청이 없으면 approved이며, 의견이 없으면 pending이다. 필수 검토자 수·조직 권한·SSO는 이 CLI에 구현하지 않았다. 이름은 입력 기록이며 인증된 신원이라고 주장하지 말라.

같은 report ID의 수정본을 ingest하면 새 revision이 생기며 이전 검토가 승계되지 않는다. 입력 JSON의 governance는 버리고 저장소에서 새 이력을 만든다. 브라우저는 내용이 검토 버전과 다른 JSON을 거부한다. 미등록 초안을 편집할 때는 governance를 제거하고, 검토 전달 전 새 버전으로 등록하라.

**검토 완료와 원인 검증은 별개다.** 후보 보고서를 검토 완료할 수도 있고 검증된 원인을 가진 보고서가 전달 검토 대기일 수도 있다. review가 nodes/edges/summary.status를 verified로 바꾸지 않는다. 실제 재현·직접 관계·개입 근거를 검토한 뒤 사람이 JSON의 해당 노드와 연결만 근거와 함께 변경하여 새 버전으로 저장하라.

## 가상 사례와 실제 장애 3건 검증

현재 페이지는 프로세스 종료·재기동, DB 잠금, 클라이언트 재시도 세 **합성 사례**다. 실제 과거 장애 3건을 검증했다고 주장하지 말라. DB 사례의 통제 실험과 검토 역할도 가상이다. 모델 연결 코드는 모의 HTTP로 검증했으며 실제 모델과 운영 주소를 실행하지 않았다.

실제 자료가 제공되면 과거 장애 3건을 이 형식으로 사람이 작성한다. 각 사건의 결론·노드·연결·배제 후보·남은 질문·근거 링크를 남긴다. 담당 팀이 추가 설명 없이 원인을 이해하고 원본 자료에 도달할 수 있는지 확인하고 의견을 해당 revision에 기록한다. 부족한 자료는 unknown으로 남기며 합성 수치를 채워 넣지 말라. 주소가 없어도 제공 자료의 보고서 작성과 저장은 진행하라.
