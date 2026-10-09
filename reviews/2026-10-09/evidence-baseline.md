# 장애 근거 시스템 적대적 검토

검사 기준: 2026-10-09 14:25:14–14:31 UTC. 기준 저장소 `/workspace/scratch/51f8bae0cc7a/incident-evidence-skill`. 14:26:28 UTC에 소스·사례·보존본을 `/tmp/evidence-adversarial-work/snapshot`으로 복사해 검사했다. 원본 수정, 운영 조회, 네트워크 호출, 외부 게시·메시지는 하지 않았다. 아래 재현은 합성 데이터를 이용한 로컬 단위/계약 반례이며 실제 장애·모델·운영 시스템의 검증 결과가 아니다.

검사 경로/시각/mtime/각 JSON 보존본 SHA-256은 `/tmp/evidence-adversarial-work/inspection-manifest.json`에 있다. 복사본과 manifest의 해시는 일치했으며 14:30 UTC 재확인에서 해당 검사 파일의 원본 변경은 없었다. 수정이 병행될 수 있으므로 아래 줄 번호는 이 스냅샷 기준이다.

| 주요 파일 | 검사 SHA-256 |
| --- | --- |
| `skills/investigate-game-incident/scripts/investigate.py` | `f2230428511e585f8751d37f552536257b8d1ea029fc102f1a7284e9cba7a15a` |
| `skills/investigate-game-incident/scripts/report_store.py` | `2c91b408e2482837b3e106770ab154bdad2e5288582d7bcd828dd56989e45cd5` |
| `skills/investigate-game-incident/scripts/validate_report.py` | `a468cdf074d1ff10b8cbb127aed6566a4053276f5f8718bd400593bcc10ca30a` |
| `web/src/model.mjs` | `3ff2b6d98593cd8fc49c69812b61d99d7afefc9bcbbcb13955f79e3cc34e4145` |

## 판단

현재 시스템은 사람이 정한 조회 카탈로그를 반복 수집하고, 근거 ID가 존재하는 예비 보고서 및 바이트 보존본을 만드는 범위에서는 설계가 일관된다. 하지만 **근거 내용과 보고서의 관측/결론을 묶는 검증, 배제의 관측 완전성, AI가 실제 읽은 범위, 수신한 검토 이력의 진위를 확인하는 기능은 충분하지 않다.** 형식/해시 통과를 곧바로 원인 입증·배제·정식 검토 이력의 유효성으로 해석하면 독자가 잘못된 확신을 얻을 수 있다.

## P1-1: 보고서의 표본·synthetic 표시·검증 결론과 실제 archive가 모순돼도 저장 및 UI 검증 통과

**위치:** `report_store.py:49–77`, `validate_report.py:72–82,144`, `web/src/model.mjs:286–326`.

**재현:** `docs/cases/db-lock/incident.json` 복사본에서 governance를 제거하고 다음만 바꿨다. 보존된 `evidence/*.json`은 한 바이트도 수정하지 않았다.

- `meta.synthetic=false`.
- summary: “운영 장애의 직접 원인은 모든 게임 DB 디스크 고장으로 검증됐다”, status=verified, evidence_ids=[E_host].
- verified 직접 원인 N1의 statement도 디스크 고장으로 변경하고 E_host를 인용.
- E_db의 보고서 내 sample을 `{disks_failed:true}`로 변경하되 원래 E_db archive 해시 유지.

`validate()`의 오류는 0개였다. `ReportStore.ingest()`는 revision 1을 저장하고, 로컬 승인 레코드 추가 후 export는 approved였다. Node에서 `verifyGovernance()`도 통과했다. 실제 E_host archive는 프로세스 가동/OOM 0/CPU 43%의 **synthetic** 표본이고 디스크 고장을 보여주지 않는다. E_db archive는 T742 row lock 자료다.

**왜 중요한가:** exact bytes 해시는 archive 자체의 일관성을 확인할 뿐 보고서 내 sample/결론의 진실을 확인하지 않는다. 기존 archive의 합성 표시를 지운 보고서가 “운영 검증됨·검토 완료”로 보일 수 있다. validator가 스스로 causal truth를 보장하지 않는다고 명시하는 것은 적절하나, import/store/UI를 잇는 사실 일치 조건이 전혀 없는 상태는 독자 재검증을 방해한다.

**최소 수정:**

1. archive format 별 파서를 도입해 report evidence의 sample/parameters/observed 범위가 실제 보존 payload에서 파생됐는지 확인한다. 표본은 archive에서 자동 생성하거나 `sample_pointer`와 정확한 추출 규칙으로 연결한다. Prometheus metrics와 snapshot events도 동일하게 archive에서 다시 정규화해 일치 여부를 검사한다.
2. archive 내 synthetic 선언이 true이면 사건을 production으로 등록하지 못하게 한다. 근거별 provenance의 `origin_kind=synthetic|operational|unknown`을 신뢰 가능한 ingest 단계에서 결정하며 혼합 근거는 범위를 명시한다.
3. `verified`는 단순한 node role 문자열 외에 구조화한 verification record(검증 대상 claim/실험 또는 직접 관계 확인의 evidence ID/환경·범위·대조 조건/결과/한계/검토 상태)를 요구한다. 이것도 인과 진실 자동 증명이 아니라 검토를 위한 필수 자료 조건으로 설명한다.

## P1-2: 관측값이 전부 없거나 짧은 관측 범위여도 후보 배제 가능

**위치:** `investigate.py:302,310–347,455–464`; 범용 validator `validate_report.py:78–80` 및 UI `model.mjs:140–153`.

**재현 A:** demo의 DB QPS Prometheus 형식 snapshot에서 26개 반환 value를 전부 문자열 `NaN`으로 변경했다. Engine은 모두 null로 정규화했지만 `collection_status=ok`, `incomplete=false`였다. 유효한 값이 0개인 E_db-qps를 인용하는 `status=excluded`, decision “DB 과부하 배제” 계획을 `Engine.accept()`가 수락했다.

**재현 B:** snapshot의 observed range를 21:10–21:11로 제한하고 limitations를 `one minute only`로 했다. 이 자료를 인용해 “전체 장애 기간 OOM 배제” 계획을 수락했다. `incomplete`는 실패 또는 한국어 `부분/상한/경고` 접두어 존재 여부만으로 설정되므로 기계적 coverage가 없다.

**추가 확인:** 사람이 import하는 db-lock 복사본의 I1 excluded에서 evidence_ids를 []로 바꿔도 `validate()`는 통과했다. E_metrics의 collection_status를 failed로 변경하고 verified summary/direct-cause가 이를 인용하도록 해도 통과했다. Engine의 guard를 우회하는 저장/import 경로가 있다.

**최소 수정:** `completeness`를 자유 문구가 아닌 기계 필드로 계산한다. 필요한 scope/시간 범위, 기대 표본 수/유효 표본 수, null 구간, 로그 truncation, ingest 실패를 기록하고 부재 기반 배제는 명시한 범위가 연속적으로 관측되었을 때만 허용한다. 모든 null/NaN 또는 부분 기간은 배제 불가다. Engine·Python validator·UI validator에서 failed/incomplete evidence를 인용하는 배제를 동일하게 거부하며, excluded에도 비어 있지 않은 근거를 요구한다. “해당 범위 배제”의 범위를 `tested_scope/time_range`로 구조화해야 한다.

## P1-3: snapshot의 보존 관측 범위보다 앞선 사건을 유효한 근거 사건으로 채택

**위치:** `investigate.py:268–273,349–360`; `validate_report.py:88–100,117–127`.

**재현:** observed_start=21:10, observed_end=21:11인 snapshot에 사건 at=21:02를 넣었다. 사건은 incident window 전체 안에 있으므로 `event_records()`가 수락했다. evidence collection_status=ok이며 보고서 validate 오류 0개였다. 사건 21:02를 확인한 근거의 명시적 관측 범위는 21:10 이후라는 모순이 그대로 남는다.

**왜 중요한가:** 각 근거에 관측 시작·끝이 있어도 실제 참조 사건과 묶이지 않는다. 범위가 맞지 않는 사건으로 원인→결과 순서를 만들거나 이미 지나간 시점의 부재를 주장할 수 있다.

**최소 수정:** snapshot events는 snapshot 관측 범위 안인지 검사한다. 사건 회고 기록이라 관측 범위와 발생 시각이 달라도 되는 경우에는 `recorded_at`/`occurred_at`/`covered_event_range`를 분리해 명시하고 그 규약을 검증한다. 보고서 validator는 event→evidence 링크의 시간 범위·scope를 재검사한다. occurrence time이 불확실한 사건은 단일 정확 시각으로 인과 순서를 확정하지 않는다.

## P1-4: AI는 전체 지표나 archive를 읽지 않는데 전체 근거에 대한 판정을 허용

**위치:** `investigate.py:299,393–398,455–476`.

**재현:** 정상 budget 내 1초 간격 800개 DB QPS 표본을 만들고 400번째 표본만 200,000 QPS로 했다. Engine.metrics에는 최고 200,000이 들어있다. 그러나 planner context keys는 `window,scope,catalog,evidence,events,history,failures`이며 **metrics가 없다**. evidence.sample은 앞 6,000자에서 잘린 불완전 JSON이고 이상값 200000은 포함되지 않았다. planner는 archive 파일을 읽거나 페이지를 추가 조회할 도구가 없으며 이미 수집한 query ID 재조회도 금지돼 있다.

**왜 중요한가:** “이미 수집한 성공 근거 ID를 인용하라”는 규칙은 실제로 모델에 보여준 바이트/표본의 범위를 보장하지 않는다. 이상값·모순·장애 후반 자료가 표본 뒤에 있으면 AI가 이를 보지 못하고 전체 E_db-qps의 근거 ID로 배제/후보/요약을 작성할 수 있다. limitations에 “전체는 보존본에서 확인”이라고 적혀 있어도 AI에게는 보존본 접근 경로가 없다.

**최소 수정:** 정규화한 metrics와 기계 계산 요약(유효/누락 범위·최소/최대·피크 시각·baseline·이상 구간)을 planner context에 넣는다. 전체 로그를 못 보내면 안전한 chunk 조회를 미리 정한 카탈로그로 제공하거나 `visible_ranges/truncated/omitted_points`를 구조화한다. 모델 판정은 실제 표시 범위에 제한하고, 잘린 자료로 부재/배제는 못 하게 한다. 요약·표본 추출은 claim별 pointer로 archive에 연결해 다른 팀이 같은 추출을 재실행할 수 있어야 한다.

## P1-5: governance의 보고서 해시 검사는 검토 이력·버전 표기의 진위를 검증하지 않음

**위치:** `report_store.py:101–113`; `model.mjs:236–260,286–326`.

**재현:** 원본 db-lock 사례 JSON의 content_canonical/content_sha256는 그대로 두고 governance만 다음처럼 수정했다.

- revision=999, history=[]
- reviews=[임의 검토자, approved, 임의 의견, reviewed_at=`not-a-timestamp`, version_sha=원래 내용 해시]
- delivery_status=approved
- identity_assurance=`SSO 인증 및 전자서명 완료`

`verifyGovernance()`는 통과했다. 검토 SHA는 공개된 보고서 SHA를 복사하면 되며 승인 상태는 공격자가 함께 바꾼 reviews로 재계산된다. history에 해당 revision/hash가 없어도 거부하지 않는다.

**판정 범위:** SQLite ingest가 supplied governance를 제거하고 저장소에서 생성한 리뷰를 export하는 점은 좋다. 이번 반례는 원격 공격이나 SQLite trigger 우회가 아니라 **외부 JSON import의 unsigned metadata를 정식 검토 완료로 표시하는 신뢰 경계** 문제다. 현재 “CLI 이름이며 SSO 아님” 설명은 기본 export의 정직한 한계 표시지만, 이 설명 자체도 import 데이터에 의해 변조 가능하다.

**최소 수정:** signature 없이 받은 JSON은 “검토 기록 포함(발급처 미확인)”으로 표시하고 verified delivery로 취급하지 않는다. 신뢰할 수 있는 발급처의 서명 또는 인증된 저장소 API를 통해 canonical report + report_id + revision + evidence hashes + review records + export 시점을 하나의 envelope로 검증한다. 최소 구조 검사로 revision/hash가 history의 해당 행과 일치, review timestamp 유효 및 생성 이후, reviewer 최신 판정의 명시적 순서/ID를 확인한다. identity assurance는 UI의 고정 신뢰 설명에서 결정한다. 저장소 재등록/서명 없이 파일 내 해시를 다시 만드는 것은 발급처 진위 보장이 아니다.

## P2: 인과 DAG·verified 표시와 실제 인과 판정 사이의 간격

**재현:** db-lock의 verified L1(N1 장시간 정산 트랜잭션→N2 로그인 잠금 대기)의 source/target만 뒤집었다. DAG는 여전히 비순환이며 Python validate가 오류 0개를 반환했다. 문장과 화살표의 원인 방향이 상충해도 허용된다. 이는 validator가 인과 진실을 증명하지 않는다는 명시된 계약에 속하지만 “실선=검증” 시각 표현은 이를 입증된 방향으로 읽게 만든다.

**최소 수정:** claim/node에 occurrence range와 claim kind, edge에 방향을 뒷받침하는 직접 관측 또는 intervention/experiment verification ID를 별도로 둔다. 명백한 시간 역전은 금지하고, DAG 통과와 인과 검증을 UI에서 분리해 표시한다. 검증자료 없는 수동 verified 관계는 review 대상이지 이미 검증 완료인 결과로 배포하지 않는다. 문장 자체의 의미적 인과 진실은 구조검사만으로 해결할 수 없으므로 사람이 판단할 반증 자료/대안/검증 조건을 남겨야 한다.

## 사례 자료에 대한 현재 판단

- restart/client-retry/db-lock 모두 현재 validate 오류 0개이고 모든 archive SHA-256은 파일 바이트와 일치했다. 실제 운영 자료인 것으로 평가하지 않았다.
- restart는 CacheMissError→종료를 supported로 유지하며 OOM 대안을 남긴다. warming 1,470/1,850≈79.5%와 요약 72%의 불일치를 명시하고 재집계 unknown에 연결한다. 이 불일치는 이미 보고서에서 인지됐으므로 신규 결함으로 세지 않았다. 서로 다른 요청 p99/클라이언트 로딩 p99도 구분한다.
- client-retry는 flag 중지 후 회복을 단독 확정 근거로 쓰지 않고 ISP/표본 구성 대안과 controlled reproduction 미실행을 명시한다. 동접 감소 기여 관계도 unknown이다. 다만 “18회 retry”는 비교 버전의 retry 분포가 없는 요약이고, 이전 버전 비교를 재실행할 원시 표본·선택 규칙은 제공되지 않는다. 후속 팀의 운영 조사에는 이 자료가 추가로 필요하다.
- db-lock의 E_test는 `same_workload=true`, blocker enabled/disabled p99와 waiters를 **작성한 합성 JSON**이다. 실제 통제 실험이 실행되었다는 근거가 아니다. summary/node/edge의 verified는 합성 사례 내 역할 예시로만 읽어야 한다. E_host의 “full_window=true,oom_count=0”도 작성한 합성 선언이며 운영 호스트/커널 수집의 완전성을 입증하지 않는다. 실제 프로토콜/스크립트·환경·반복 수·부하·수집 누락이 없는 운영 검증 완료로 승격하면 안 된다.

## AI 조사 루프가 실제 가능한 범위

코드로 확인되는 루프는 `bootstrap 수집→계획 수락→미조회 카탈로그 ID 수집→다음 모델 평가`다. Prometheus/Loki 조회 및 snapshot import와 Holmes `/api/chat` 또는 compatible `/chat/completions` 요청 구현이 있다. 하지만 이번 검토에서 실제 모델/서비스 호출은 전혀 하지 않았고 API/인증/모델 계획 품질의 운영 호환성은 확인되지 않았다.

DB·클라이언트·dump·배포 조사는 제공자가 만든 JSON snapshot을 읽는 수준이다. 직접 SQL, 임의 쿼리 작성, OpenSearch/Tempo 전용 수집, 코드 실행 또는 재현 실험은 구현되지 않는다. 사람이 정한 조회 ID만 실행하고 동일 ID는 한 실행에서 한 번, 시간 범위도 고정이다. 카탈로그에 없는 새 가설의 증거는 다음 담당자의 수동 export/새 실행이 필요하다. state.json은 resume 데이터가 아닌 감사 기록이다.

AI schema의 status는 unknown/supported/excluded이며 모델이 verified로 승격할 수 없다는 guard는 유효하다. 마지막 round에서 새 수집 후 예산이 종료되면 직전 판정으로 보고서가 생성되고 미평가 결과를 unknowns에 남긴다. 문서는 이 한계를 대체로 정확히 설명한다. Holmes의 `server_tools_disabled=true`는 실제 원격 서버의 도구 비활성화를 집행하는 기능이 아니라 운영자 선언이며 docs에도 그렇게 명시돼 있다. 로컬 fake/replay 테스트를 실제 운영의 도구 안전성·응답 품질·근본 원인 검증으로 간주하지 않는다.

## 로컬 재현 산출물

- Python 재현: `/tmp/evidence-adversarial-work/reproduce.py`
- Python 결과: `/tmp/evidence-adversarial-work/results.json`
- JS/UI model 재현: `/tmp/evidence-adversarial-work/governance-reproduce.mjs`
- 조작 governance JSON: `/tmp/evidence-adversarial-work/forged-governance.json`
- 기존 exact archive를 그대로 저장한 모순 report export: `/tmp/evidence-adversarial-work/forged-export/incident.json`
- 소스/전체 사례 JSON 보존본: `/tmp/evidence-adversarial-work/snapshot/`

검증 우선순위는 배제 guard의 관측 coverage와 archive→보고서 데이터 일치 조건을 먼저 고친 뒤, planner의 실제 가시 범위 및 unsigned 검토 이력의 표시/발급 진위 경계를 고치는 순서다. 모든 수정은 “더 강한 확신”보다 “근거가 허용하는 범위”를 정확히 표시하는 목적이어야 한다.
