# 장애 근거 시스템 수정 후 독립 재검증

검사 시간: 2026-10-09 14:50:08–14:55:02 UTC. 저장소 `/workspace/scratch/51f8bae0cc7a/incident-evidence-skill`. 최종 동결본은 `/tmp/evidence-adversarial-retest-work/final-run/snapshot`이다. 원본 수정·운영/외부 조회·게시·메시지는 하지 않았다. compatible planner는 실제 메서드를 호출하되 transport만 로컬 함수로 바꾸어 요청 body를 검사했으며 모델/네트워크 호출은 없었다. 모든 결과는 합성 로컬 계약 검사다.

**결론:** 최종 소스에서 요청한 Engine 수정의 기존 반례는 차단됐다. 새 치명적 코드 결함이나 이 수정 범위의 실패는 최종 재시험에서 발견하지 못했다. 특히 실제 관측값 없음과 부분 기간을 배제 근거로 수락하던 결함, snapshot 관측 범위 밖 사건 수락, 후반 메트릭 피크 미전달 문제가 재현되지 않는다. 이 결과가 실제 운영 수집 완전성·AI 조사 품질·근본 원인·검토자 신원의 검증을 뜻하지는 않는다.

## 최종 재시험 결과

| 적대적 입력 / 양성 대조 | 실제 결과 | 판단 |
| --- | --- | --- |
| 26개 DB QPS 값 전부 NaN | 모두 null, quality.incomplete=true, missing_or_nonfinite_metric_points, excluded 거부 | 기존 반례 차단 |
| DB QPS에서 평가 시각 1개 제거 | 누락 point가 null, quality.incomplete=true, excluded 거부 | 누락 1개도 방어 |
| 모든 DB QPS 값 정상·전체 범위 | incomplete=false, excluded 수락 | 무조건 거부하는 구현은 아님 |
| snapshot 기간 21:10–21:11, coverage_complete=true | partial_observation_window, excluded 거부 | 선언으로 짧은 범위를 우회하지 못함 |
| 같은 snapshot에 사건 21:02 삽입 | collection_status=failed, extracted event 0개, excluded 거부 | 기존 범위 모순 차단 |
| 전체 기간 snapshot이나 coverage_complete 미제공 | snapshot_completeness_not_declared, excluded 거부 | 선언 없는 파일 완전성 불인정 |
| 전체 기간 snapshot, coverage_complete=true | incomplete=false, excluded 수락 | 정상 대조 수락 |
| 전체 기간·complete 선언 snapshot이지만 응답 9,207자 | excerpt_truncated=true, excluded 거부 | AI가 못 본 자료로 배제 방어 |
| 1,501개 DB QPS 표본, 400번째만 200,000 QPS | context.metrics.maximum에 정확한 피크 시각/값, points에도 피크 보존, valid=1501/missing=0, points_complete=false, excluded 거부 | 후반 피크 보임 + downsampling 한계 방어 |
| save_planner_input() 보존본 | JSON 내용=context, SHA-256=audit.sha256 | 로컬 입력 보존 일치 |
| compatible() 실제 조립 body, 로컬 transport | 저장된 입력 JSON=messages[1].content JSON, SHA-256 일치 | 실제 전달 context와 보존 context 일치 |
| Loki success, streams=[], completeness 미선언 | log_coverage_not_declared, incomplete=true, excluded 거부 | 중간 재시험에서 발견한 빈 로그 반례도 최종 수정에서 차단 |
| Loki success, streams=[], 카탈로그 coverage_complete=true | incomplete=false, excluded 수락 | 수집자 선언에 대한 정상 대조 |
| Python validator: excluded의 evidence_ids=[] | requires at least one evidence ID 오류 | import 경로도 방어 |
| Python validator: failed/incomplete 근거로 excluded | failed collection / incomplete evidence 오류 | import 경로도 방어 |
| UI validator: 근거 없는 excluded | 거부 | Python/UI 일치 |
| UI validator: incomplete/truncated 근거로 excluded | 거부 | Python/UI 일치 |
| UI validator: failed 근거로 positive claim | 거부 | Python/UI 일치 |
| governance revision=999 / history=[] | 현재 버전과 이력 불일치로 거부 | 기존 구조 반례 차단 |
| governance review 시각=`not-a-timestamp` 또는 생성 이전 | 검토 시각 오류로 거부 | 기존 시각 반례 차단 |
| 최종 restart/db-lock/client-retry 사례 | Python validator 및 UI verifyGovernance 모두 통과 | 정상 사례 호환 유지 |

## 검사 중 소스 변경의 구분

14:50 동결본에서는 Python validator가 근거 없는 excluded 및 failed/incomplete 근거의 excluded를 허용했고, 빈 Loki streams도 배제 가능했다. 검사 중 공유 소스가 바뀌었으므로 이 결과를 최종 실패로 남기지 않았다. 14:53 이후 소스 전체를 다시 동결하여 재시험했다. 최종 결과는 위 표와 같으며 해당 잔여 반례는 거부된다.

최종 검사본 해시와 원본 재확인 시각은 `final-manifest.json`에 기록했다. 14:55:02 UTC에 아래 파일은 최종 시험 동결본과 모두 일치했다.

| 파일 | 최종 SHA-256 |
| --- | --- |
| `skills/investigate-game-incident/scripts/investigate.py` | `53a78e15d86c2fd61b013e848e9105a424f58d38e17ce5c54032711d9aeef46b` |
| `skills/investigate-game-incident/scripts/validate_report.py` | `6aa82f1bd9e8bacbe2701fdf87a6651471f33d775eecd0b2702c319fdd222f9f` |
| `web/src/model.mjs` | `b81fed2f8d1f9e47a7ba3f2cbc525f6f92a5d264f5ebe40ac079da2b2e9ccfa6` |
| `skills/investigate-game-incident/scripts/report_store.py` | `2c91b408e2482837b3e106770ab154bdad2e5288582d7bcd828dd56989e45cd5` |

## 해석 범위와 남은 경계

- `coverage_complete=true`는 수집자의 선언이다. 이를 true로 바꾼 빈 Loki 결과는 배제에 사용 가능하며 코드가 실제 로그 파이프라인 정상/누락 없음/쿼리 선택 범위를 자동 입증하지 않는다. 부분 snapshot 기간은 선언으로 우회할 수 없지만, 선언 내용 자체의 진실은 별도 운영 근거가 필요하다. 이 경계를 문서에 유지한다는 수정 설명과 일치한다.
- planner input 보존은 모델에 보인 **context**와 그 해시다. 이번 테스트는 실제 모델의 추론·응답 품질을 평가하지 않았다. 256개 초과 지표는 downsampling이며 extrema 보존이 전체 패턴 판독을 뜻하지 않는다. points_complete=false 근거로 excluded를 거부하는 방어는 확인했다.
- 메타데이터 형식/시간/현재 revision 정합성은 강화됐지만 unsigned 검토 기록의 발급 진위와 검토자 신원 인증은 제공하지 않는다. 공개된 내용 SHA를 복사해 그럴듯한 새 리뷰를 만든 것을 암호학적 승인 증거로 해석할 수 없다. 이 제한은 이번 요청에서 유지한 범위다.
- 이전 `/tmp/evidence-adversarial.md`의 archive↔report sample/claim/synthetic provenance 결속 문제나 인과 진실의 의미 검증 문제를 이번 Engine 수정이 해결했다고 주장하지 않는다. report_store.py의 검사 해시는 기존과 같다. 이번 재검증은 요청된 누락·범위·planner 입력·excluded·메타 구조 방어를 독립적으로 확인한 결과다.

## 로컬 재현 파일

모든 최종 재현 파일은 `/tmp/evidence-adversarial-retest-work/final-run/` 아래에 있다.

- `retest.py`: Engine·snapshot/Loki·metric·compatible 입력·Python validator 반례 및 정상 대조.
- `results.json`: Python 실제 출력.
- `retest-model.mjs`: 정상 사례 및 governance 구조/시간 반례.
- `validate-extra.mjs`: UI의 excluded/failed 방어.
- `model-results.json`, `model-extra-results.json`: JS 실제 출력.
- `final-manifest.json`: 검사 경로·시각·해시·원본과 동결본 일치 여부.
- `snapshot/`: 최종 검사한 소스/합성 사례/asset 동결본.

시험 입력·출력 폴더를 따로 생성했으며 원본 저장소의 코드를 바꾸지 않았다. 현재 수정 범위에 추가 최소 수정안을 요구할 실패는 최종 재시험에서 남지 않았다.
