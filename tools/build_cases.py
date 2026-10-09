"""Build three explicitly synthetic examples and version/evidence export fixtures."""
import copy, hashlib, json, sys, tempfile
from datetime import datetime, timedelta
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
SKILL=ROOT/'skills/investigate-game-incident'
sys.path.insert(0,str(SKILL/'scripts'))
from report_store import ReportStore
from validate_report import validate
START=datetime.fromisoformat('2026-10-08T20:55:00+09:00')
TIMES=[(START+timedelta(minutes=i)).isoformat() for i in range(26)]
WINDOW={'start':TIMES[0],'end':TIMES[-1],'baseline_end':TIMES[6]}
CLOCK='2026-10-09T09:00:00+09:00'

def write(path,data):
 path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,ensure_ascii=False,allow_nan=False,indent=2)+'\n',encoding='utf-8')
def metric(i,label,unit,agg,values,eid):
 return dict(id=i,label=label,unit=unit,aggregation=agg,description=agg,interval_seconds=60,points=[[t,v] for t,v in zip(TIMES,values)],evidence_ids=[eid])
def event(i,minute,label,kind,detail):
 return dict(id=i,at=(START+timedelta(minutes=minute)).isoformat(),label=label,kind=kind,detail=detail,evidence_ids=['E_events'])
def evidence(i,title,sample,query=None):
 return dict(id=i,title=title,source='가상 관측·검증 표본',observed_start=TIMES[0],observed_end=TIMES[-1],retrieved_at=CLOCK,sample=sample,query=query,parameters={'synthetic':True,'window':WINDOW},source_url=None,archive_url=None,limitations='모든 자료·조회·실험은 설명을 위한 합성 예시. 실제 운영 조회·실험·모델 실행이 아님.')
def node(i,label,role,status,statement,refs,rationale='',limitations='가상 예시이며 실제 사건의 근거가 아님'):
 return dict(id=i,label=label,role=role,status=status,statement=statement,rationale=rationale or statement,evidence_ids=refs,limitations=limitations)
def edge(i,a,b,status,mechanism,refs):
 return dict(id=i,source=a,target=b,label=mechanism,status=status,mechanism=mechanism,evidence_ids=refs,limitations='가상 자료의 관측·검증 범위에 한함')
def step(i,question,hypothesis,prediction,observed,decision,status,refs,next_test):
 return dict(id=i,investigated_at=CLOCK,question=question,hypothesis=hypothesis,prediction=prediction,observed=observed,decision=decision,status=status,evidence_ids=refs,next_test=next_test)
def report(slug,title,summary,metrics,events,ev,nodes,edges,steps,unknowns):
 return {'meta':{'id':'INC-DEMO-'+slug.upper(),'title':title,'timezone':'Asia/Seoul','version':'2.0','synthetic':True,'scope':'KR · 가상 검증 사례'},'window':WINDOW,'summary':summary,'metrics':metrics,'events':events,'evidence':ev,'nodes':nodes,'edges':edges,'investigation':steps,'actions':[{'id':'A1','action':'후속 조치와 원인 검증 결과 검토','owner':'인프라·게임 서버·DB/클라이언트 담당','due':None,'status':'검토 필요','verification':'대안 가설·재현 조건·관측 공백과 재발 방지 완료 기준을 기록','evidence_ids':summary['evidence_ids']}],'unknowns':unknowns}

def build(out):
 out=Path(out);out.mkdir(parents=True,exist_ok=True)
 cache=json.loads((ROOT/'examples/investigation.json').read_text())
 cache['meta']['version']='2.0'
 ccu=[42000]*7+[40900,38700,35400,33000,31600,32000,32700,33700,35100,37000,38400,39700,40500,41200,41700,42000,42000,42000,42000]
 qps=[320]*7+[350,330,300,280,270,265,260,460,410,360,335,330,325,320,320,320,320,320,320]
 latency=[90]*7+[600,1200,2300,3500,4600,4900,5100,460,190,120,96,94,92,90,90,90,90,90,90]
 ms=[metric('M1','동접','명','1분 말 세션 수, 영향 월드',ccu,'E_metrics'),metric('M2','DB 완료 요청','QPS','1분 평균 완료 요청 수; 대기 요청은 포함하지 않음',qps,'E_metrics'),metric('M3','게임 요청 p99','ms','1분 응답 지연 p99, 영향 월드',latency,'E_metrics')]
 es=[event('V1',7,'정산 트랜잭션 시작','change','정산 작업 transaction T742가 같은 계정 행을 갱신하기 시작했다.'),event('V2',8,'DB 대기 증가','observation','login-state SELECT가 T742의 행 잠금을 기다리기 시작했다.'),event('V3',9,'지연 장애 알림','alert','관측 p99가 2초를 넘었다는 가상 알림 기록.'),event('V4',13,'지연 피크','observation','요청 p99 5,100ms, 동접 감소가 함께 관측됐다.'),event('V5',14,'블로커 종료 조치','intervention','정산 작업의 문제 트랜잭션 종료 조치가 기록됐다. 실제 시스템 조작은 수행하지 않았다.'),event('V6',17,'지연 정상화','recovery','p99 96ms로 관측됐다.'),event('V7',22,'동접 회복','recovery','동접 42,000명으로 회복했다.')]
 ev=[evidence('E_metrics','동접·DB 처리량·지연 표본',ms),evidence('E_events','작업·알림·조치 기록',es),evidence('E_db','DB 잠금 대기 그래프',{'blocker':'T742','waiter_query':'login-state SELECT FOR UPDATE','locked_row':'account:<masked>','waiters':186,'wait_type':'row_lock','lock_start':es[0]['at']},'승인된 DB 잠금 대기 통계 export'),evidence('E_test','잠금 경로 대조 재현',{'synthetic_experiment':True,'same_workload':True,'blocker_enabled':{'p99_ms':5020,'row_waiters':181},'blocker_disabled':{'p99_ms':95,'row_waiters':0}},'가상 통제 실험'),evidence('E_host','프로세스·호스트 대안 확인',{'process_up_full_window':True,'cpu_peak_pct':43,'oom_count':0,'scope':'영향 프로세스·커널 이벤트를 모두 포함한 가상 표본'})]
 ns=[node('N1','장시간 정산 트랜잭션','직접 원인','verified','정산 트랜잭션이 로그인과 공유하는 행의 잠금을 오래 유지했다.',['E_db','E_test']),node('N2','로그인 쿼리 잠금 대기','중간 원인','verified','186개 요청이 T742의 행 잠금을 기다렸다.',['E_db','E_test']),node('N3','요청 지연','결과','observed','요청 p99 5,100ms가 관측됐다.',['E_metrics']),node('N4','블로커 종료 이후 회복','완화 조치','observed','조치 후 지연과 동접이 회복했다.',['E_events','E_metrics']),node('N5','동접 감소','결과','observed','동접 42,000→31,600명이 함께 관측됐다.',['E_metrics'])]
 ls=[edge('L1','N1','N2','verified','공유 행 잠금으로 로그인 쿼리가 대기했다.',['E_db','E_test']),edge('L2','N2','N3','verified','대기 유무 대조 실험에서 요청 지연이 변했다.',['E_test','E_metrics']),edge('L3','N2','N4','supported','블로커 종료 후 대기·지연이 함께 줄었다.',['E_events','E_db','E_metrics']),edge('L4','N3','N5','unknown','요청 지연의 동접 감소 기여율은 세션 종료 자료로 별도 확인해야 한다.',['E_metrics'])]
 sts=[step('I1','서버가 떨어져 지연됐는가?','프로세스 종료/OOM이 로그인 실패를 만들었을 수 있다.','종료·커널 OOM 기록 또는 uptime 공백이 있어야 한다.','영향 프로세스는 전 구간 가동됐고 OOM 기록 0, CPU 최고 43%다.','제공된 완전한 가상 표본 범위에서 프로세스 종료/OOM 후보를 배제한다.','excluded',['E_host'],'DB 대기 종류 확인'),step('I2','DB 부하는 왜 높은 지연으로 나타났는가?','행 잠금이 요청 처리를 막았을 수 있다.','동일 blocker와 같은 행에 로그인 waiter가 연결돼야 한다.','T742가 186개 로그인 쿼리를 차단하는 대기 그래프가 있다.','처리 완료 QPS 하락은 부하가 없다는 근거가 아니다. 잠금 경로가 유력하다.','supported',['E_db','E_metrics'],'같은 부하에서 blocker 유무 대조'),step('I3','잠금이 직접 지연을 만들었는가?','T742의 행 잠금이 직접 원인이다.','같은 부하에서 blocker만 제거하면 대기와 지연이 줄어야 한다.','가상 대조에서 p99 5,020→95ms, 대기 181→0이다.','가상 자료 범위에서 직접 잠금→지연 관계가 검증됐다.','verified',['E_test'],'정산 작업의 트랜잭션 경계 개선·검토')]
 db=report('db-lock','정산 작업의 DB 잠금으로 로그인 지연',dict(status='verified',text='정산 작업의 장시간 트랜잭션이 로그인 쿼리와 공유하는 행을 잠갔습니다. 로그인 쿼리 대기로 요청 지연이 발생했고 동접 감소가 함께 관측됐습니다. 블로커 종료 후 회복했으며 동접 감소 기여율은 별도 확인이 필요합니다.',impact='동접 42,000→31,600명, 요청 p99 최고 5,100ms의 가상 표본.',recovery='21:09 블로커 종료 기록, 21:12 지연 정상화, 21:17 동접 회복.',evidence_ids=['E_db','E_test','E_metrics','E_events'],limitations='검증됨은 합성 대조 실험 범위를 뜻함. 실제 운영 사건·실험·사람 검토를 완료했다는 의미가 아님.'),ms,es,ev,ns,ls,sts,[{'question':'정산 작업이 잠금을 길게 유지한 코드 경로','owner':'DB·서버 개발팀','next_test':'트랜잭션 경계와 인덱스·배치 크기 확인'},{'question':'로그인 실패별 보상·데이터 정합성 영향','owner':'운영·게임 서버팀','next_test':'해당 세션의 저장·종료 기록을 별도 대조'}])
 ccu=[40000]*7+[39600,38200,36100,33700,30500,28000,27800,28300,29800,32000,34400,36100,37800,39000,39600,40000,40000,40000,40000]
 dbq=[280,278,281,283,280,279,281,282,284,281,282,280,285,283,282,281,280,282,281,280,280,279,280,280,282,280]
 lp=[120]*7+[600,1600,3500,5900,7100,8400,9100,8800,2300,600,240,160,145,130,120,120,120,120,120]
 ms=[metric('M1','동접','명','1분 말 세션 수, 전체 월드',ccu,'E_metrics'),metric('M2','DB 요청','QPS','1분 평균, 같은 DB 표본',dbq,'E_metrics'),metric('M3','클라이언트 로그인 p99','ms','Android 2.14 로그인 완료 시간 p99; 서버 응답 p99와 다른 지표',lp,'E_metrics')]
 es=[event('V1',7,'Android 2.14 배포','change','신규 로그인 재시도 경로가 포함된 클라이언트 버전 배포 기록.'),event('V2',8,'로그인 지연 신고','alert','Android 2.14 로딩 지연 신고와 표본 증가.'),event('V3',12,'동접 하락','observation','동접 28,000명으로 감소. 종료 기여율은 별도 확인 필요.'),event('V4',13,'클라이언트 지연 피크','observation','2.14 클라이언트 로그인 완료 p99가 9,100ms.'),event('V5',14,'재시도 기능 플래그 중지','intervention','신규 재시도 경로의 플래그 중지 기록. 실제 운영 변경을 수행한 것은 아님.'),event('V6',18,'로그인 지연 정상화','recovery','클라이언트 p99 160ms.'),event('V7',22,'동접 회복','recovery','동접 40,000명 회복.')]
 ev=[evidence('E_metrics','버전별 로그인 시간·동접·DB 표본',ms),evidence('E_events','배포·신고·조치 기록',es),evidence('E_server','영향 서버 상태 표본',{'process_up_full_window':True,'request_p99_ms':92,'db_qps_range':[278,285],'scope':'해당 세션이 연결한 가상 프로세스·DB'}),evidence('E_client','클라이언트 재시도 추적',{'version':'Android 2.14','retry_attempts_per_session':18,'configured_backoff_ms':0,'versions_2_13_ios':'같은 경로의 지연 상승 미관측','sample_count':860,'sampling':'로그인 시도 세션만; ISP별 분포 미제공'}),evidence('E_change','배포 변경 요약',{'path':'LoginRetry.Schedule','change':'backoff 250ms → 0ms','introduced_in':'2.14','flag_disabled_at':es[4]['at'],'controlled_reproduction':'미실행'})]
 ns=[node('N1','2.14 재시도 backoff 누락','원인 후보','supported','Android 2.14의 재시도 간격 누락이 후보이다.',['E_client','E_change'],limitations='플래그 중지와 회복이 연속됐으나 통제 실험·ISP 대안 확인은 미실행'),node('N2','세션별 반복 로그인','중간 원인','supported','표본 세션당 18회 재시도가 기록돼 있다.',['E_client']),node('N3','클라이언트 로그인 지연','결과','observed','클라이언트 완료 p99 9,100ms. 서버 응답 p99는 같은 값이 아니다.',['E_metrics','E_server']),node('N4','동접 감소','결과','observed','40,000→27,800명 감소가 관측됐다.',['E_metrics'])]
 ls=[edge('L1','N1','N2','supported','0ms backoff가 반복 시도를 늘렸을 가능성.',['E_change','E_client']),edge('L2','N2','N3','supported','재시도가 로그인 완료를 지연했을 가능성.',['E_client','E_metrics']),edge('L3','N3','N4','unknown','로그인 지연의 동접 하락 기여율은 미확인.',['E_metrics'])]
 sts=[step('I1','프로세스 종료가 로그인 지연을 만들었는가?','영향 서버가 종료됐을 수 있다.','해당 세션의 서버 uptime 공백이 있어야 한다.','가상 전체 구간의 uptime은 연속이며 서버 p99는 92ms이다.','이 표본 범위에서 프로세스 종료 후보를 배제한다. 모든 네트워크 문제의 배제는 아니다.','excluded',['E_server'],'버전별 클라이언트 완료 시간 비교'),step('I2','특정 버전에 문제가 집중됐는가?','2.14의 새 재시도 경로가 지연을 만들었을 수 있다.','이전 버전·iOS보다 재시도 수가 증가해야 한다.','2.14 표본 세션당 18회, backoff 0ms, 다른 버전의 같은 상승 미관측이다.','버전 변경 경로를 유력 후보로 유지한다. 표본 대표성은 미확인이다.','supported',['E_client','E_change'],'동일 네트워크·세션으로 버전/flag 대조'),step('I3','기능 중지 뒤 회복이 원인을 입증하는가?','재시도 경로 비활성화가 개선을 만들었을 수 있다.','같은 조건에서 활성/비활성 간 차이가 반복돼야 한다.','중지 후 회복 기록은 있으나 통제된 재현은 없다.','선후 관계만으로 확정하지 않고 ISP·샘플 구성 대안을 유지한다.','supported',['E_change','E_events','E_metrics'],'대조 실험과 ISP별 표본 확보')]
 client=report('client-retry','클라이언트 재시도 변경 이후 로그인 지연',dict(status='supported',text='Android 2.14의 재시도 backoff 누락이 로그인 지연의 유력 후보입니다. 서버 응답·DB 부하는 같은 시간대에 안정적이었고, 새 경로 중지 후 회복했습니다. 통제된 재현이 없어 확정하지 않습니다.',impact='클라이언트 로그인 완료 p99 최고 9,100ms, 동접 40,000→27,800명의 가상 표본.',recovery='21:09 기능 경로 중지 기록, 21:13 지연 정상화, 21:17 동접 회복.',evidence_ids=['E_client','E_change','E_server','E_metrics','E_events'],limitations='실제 장애가 아닌 가상 사례. ISP/버전별 표본 구성과 동접 감소 기여율은 미확인.'),ms,es,ev,ns,ls,sts,[{'question':'ISP·네트워크 상태가 같은 조건인지','owner':'클라이언트·인프라팀','next_test':'버전/지역/ISP/기기별로 같은 조건의 표본과 대조 실험 확보'},{'question':'로그인 지연의 동접 하락 기여율','owner':'서버·분석팀','next_test':'실제 종료 사유·로그인 세션을 연결하고 자연 이탈과 구분'}])
 catalog=[]
 for slug,data,label in [('restart',cache,'프로세스 다운·재기동 지연'),('db-lock',db,'DB 잠금·로그인 지연'),('client-retry',client,'클라이언트 재시도·로그인 지연')]:
  with tempfile.TemporaryDirectory() as tmp:
   tmp=Path(tmp);archives=tmp/'archives';archives.mkdir()
   data=copy.deepcopy(data);data.pop('governance',None)
   for e in data['evidence']:
    e['archive_url']=f'https://jungrok5.github.io/report/cases/{slug}/evidence/{e["id"]}.json'
    if slug=='restart':raw=(ROOT/'docs/evidence'/f'{e["id"]}.json').read_bytes()
    else:raw=(json.dumps({'synthetic':True,'evidence':{k:v for k,v in e.items() if k not in ['sha256','archive_url']}},ensure_ascii=False,allow_nan=False,indent=2)+'\n').encode()
    e['sha256']=hashlib.sha256(raw).hexdigest();(archives/f'{e["id"]}.json').write_bytes(raw)
   assert not validate(data),validate(data)
   store=ReportStore(tmp/'cases.sqlite')
   if slug=='restart':
    old=copy.deepcopy(data);old['summary']['status']='unknown';old['summary']['text']='수집을 시작한 초안입니다. 직접 원인은 아직 평가하지 않았습니다.';old['nodes']=[];old['edges']=[];old['investigation']=[]
    store.ingest(old,archives,'가상 예시 작성자',at=CLOCK)
   revision,_=store.ingest(data,archives,'가상 예시 작성자',at=CLOCK)
   if slug=='db-lock':store.review(data['meta']['id'],revision,'가상 검토자 · 예시 역할','approved','합성 대조 실험의 근거와 한계를 확인한 검토 예시. 실제 사람의 승인 기록이 아님.',at=CLOCK)
   exported=store.export(data['meta']['id'],revision,out/slug)
   store.close()
   catalog.append({'slug':slug,'label':label,'path':f'{slug}/incident.json','synthetic':True,'revision':revision,'delivery_status':exported['governance']['delivery_status']})
 write(out/'catalog.json',catalog)
 return catalog

if __name__=='__main__':
 target=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'docs/cases'
 build(target);print('Built three synthetic report cases with archived evidence and version/review fixtures.')
