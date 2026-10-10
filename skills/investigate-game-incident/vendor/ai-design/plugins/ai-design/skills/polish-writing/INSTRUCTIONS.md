---
name: polish-writing
description: Remove the AI tone from Korean or English prose — product and developer-site copy, API docs, README, docs/, design docs, PR and issue text — and make it concrete, consistent and human. Use whenever you write or revise text people will read (pages, headlines, buttons, error messages, documentation), or when asked to 다듬어, 윤문, AI 티 빼기, polish, rewrite or edit copy.
paths:
  - "**/*.md"
  - "**/*.mdx"
  - "**/*.html"
  - "**/locales/**"
  - "**/i18n/**"
---

# Polish writing

The standard is `docs/standard.md` in [jungrok5/ai-design](https://github.com/jungrok5/ai-design/blob/main/docs/standard.md). A deterministic check runs after every edit
(`style_check.py`, rules in `style/rules.toml`); its findings come back to you as context. This skill covers what a
regex cannot judge.

## Hard limits (never break these while polishing)

- Do not add facts, numbers, names, quotes, customers or claims that are not in the source. If copy needs a number
  you do not have, leave `[숫자 필요]` / `[TODO: metric]` and say so.
- Leave code, commands, paths, identifiers, link targets, API names, units and quoted text exactly as they are.
- Keep the author's meaning and technical precision; cut words, not content.

## Order of work

1. **Reader and job.** Who reads this and what must they do or decide after? Product page: what the product does
   for them. API docs: how to call it and what can go wrong. Internal doc: what to do and why.
2. **One speech level: 합니다체.** Docs, README, sites and design docs use 합니다체 in a written, documentary
   register: subject and verb explicit, no conversational endings (`~거예요`, `~잖아요`), no talking to the reader
   (`걱정하지 마세요`, `살펴볼까요`), no personifying work or tools (`일이 흘러가요`, `알아서 챙겨요` → name who does
   what). Lists and table cells are noun phrases (개조식). A product UI that decides on 해요체 turns `ko-haeyo` off in
   the project's `.style/rules.toml`. English: plain, sentence-case headings.
3. **Concrete over impressive.** Replace every adjective of praise with what it means: a number with a unit
   (`1 ms`, `64 KB`, `50,000원`), a condition, or an action. If you cannot, delete the adjective.
4. **Headlines say the user outcome; buttons say what happens next** (`API 키 발급`, `결제하기`, `Save changes`),
   never `시작하기`/`Submit` for everything. Errors say what happened and what to do, without apologizing.
5. **Cut the scaffolding:** run-ups (`이제 ~을 알아보겠습니다`, `Let's dive in`), summaries of what was just said
   (`결론적으로`, `In summary`), significance inflation (`시사하는 바가 크다`, `pivotal`), contrast theater
   (`단순한 X를 넘어`, `It's not X, it's Y`), forced triplets, rhetorical questions, emoji markers, decorative bold.
6. **Natural Korean.** Prefer verbs to nominalizations (`삭제 작업을 수행합니다` → `삭제합니다`), active voice with a real
   subject, and Korean particles over translationese (`~을 통해` → `~로`, `~에 있어서` → `~에서`, `~을 가지고 있다` →
   `~이 있다`). One term per concept; expand an abbreviation once on first use, e.g. `SSR(Server-Side Rendering)`.
7. **Read it aloud.** If a sentence carries two ideas, split it. If a paragraph's first sentence repeats the heading,
   delete it.

## Content form

Match the form to the content: explanation (why/what) as short paragraphs; actions as copyable command blocks or
numbered steps (with a copy button on pages); structure, flow or relations with three or more steps or two or more
actors as a diagram first, prose only for conditions and exceptions; comparisons and criteria as tables; numeric trends
as charts. Never write an action as an explanation, an explanation as a list of commands, or repeat one fact in prose,
table and diagram.

## Page-level tells (the style check sees sentences, not pages)

A page can pass every rule and still read as generated. Before you finish, read the whole page once for these:

- **Show, then describe.** When the text introduces a tool, paste its real output from an actual run (a command and
  what it printed). An example the reader can copy must be one you ran; if the result depends on a condition (a
  threshold, a flag), say so next to it.
- **Numbers carry their source.** Give a measurement its condition (`5 KB 파일 하나에 약 0.1초`, measured how). A count
  that changes with the code (rules, tests, files) appears once, and every document in the repo states the same value.
  When parts and a total appear together, the parts add up to the total. Do not call a made-up sample "real" or "typical".
- **Scope is the real precondition.** Replace `어느 프로젝트에나`, `모든`, `항상` with what is actually required. A tool
  page also says when not to use it and what it gets wrong.
- **Say each point once.** A section does not open by restating its heading, and a later section repeats an earlier
  fact only to add something new. If a steps list or diagram shows a flow, the hero lead and the section text do not
  narrate the same flow again.
- **Break the stamp.** If three sections share one frame (number, heading, lead, body) or three sentences share one
  shape (`X는 A로, Y는 B로`), change the form of at least one; let the content set the number of items. Splitting a
  paired sentence into two matching short sentences is the same stamp. Do not run three or more short sentences in a
  row; join a cause and its result in one sentence. Lists of exactly three examples need a reason to be three.
- **Literal verbs, one subject.** Name what the thing does (`검사합니다`, `알립니다`, `막습니다`), not a metaphor
  (`걸러 냅니다`, `덜어 줍니다`). Keep one subject per sentence; do not start with the product and end with something else.
- **One name per concept, one concept per name.** Do not rotate synonyms (흔적 / AI 티, 결과 / 출력) to avoid
  repetition, and do not use one word for two actors (the AI that wrote the text and the AI that fixes it). An internal
  name (a theme or code name) gets a plain noun the first time.
- **Say who made it and why**, when the reader will ask: one honest paragraph from facts you have, never invented.

## Output

When asked to polish existing text, return the revised text, then at most 5 bullets naming the biggest changes. When
writing new text, just write it to this standard. Fix every `error` from the style check; for a `warning`, fix it or
keep it on purpose. To quote a bad example on purpose, mark the line with `style-ignore`.

Sources and licenses: `THIRD_PARTY_NOTICES.md` in this plugin.
