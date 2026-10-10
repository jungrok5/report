# Report authoring

보고서의 글과 화면을 작성·수정할 때 ai-design을 기본으로 적용한다.

- `skills/investigate-game-incident/vendor/ai-design/plugins/ai-design/skills/polish-writing/SKILL.md`와 `skills/investigate-game-incident/vendor/ai-design/docs/standard.md`를 읽는다.
- 화면 변경에는 `skills/investigate-game-incident/vendor/ai-design/plugins/ai-design/skills/polish-ui/SKILL.md`도 읽는다. 기존 보고서 디자인 토큰을 사용하고 색·글꼴을 컴포넌트에 직접 추가하지 않는다.
- 이슈 제목 → 무슨 일이 있었나(공통 시간축) → 원인 → 조사 과정·근거 순서를 유지한다. 단위·시간·수치·근거 상태·조회 URL·보존본을 문체 수정으로 변경하지 않는다.
- 문서는 합니다체로 작성한다. 제목·표·범례는 개조식으로 작성한다. 원인 후보를 확정 원인으로 바꾸지 않는다.
- 완료 전에 `npm run style`, `npm run build`와 변경에 해당하는 검증을 실행한다. 검사 결과를 근거로 보고서 진위를 주장하지 않는다.
