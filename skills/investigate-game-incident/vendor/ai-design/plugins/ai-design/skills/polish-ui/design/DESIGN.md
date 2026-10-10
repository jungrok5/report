# Clear: default design system

The default look for docs sites, explainer pages, internal tools and diagrams. Light theme "선명한 블루",
dark theme "그래파이트". A repo that has its own design system uses that instead (see SKILL.md, step 1).

| File | Content |
| --- | --- |
| `tokens.css` | every color, font, size, space and radius as a CSS variable, light and dark |
| `components.css` | base styles and `ds-` components built only from tokens |
| `theme.js` | light/dark switch for a `.theme-toggle` button; load in `<head>`, remembers the choice, fires `themechange` |
| `copy.js` | copy button for `.ds-cmd` command blocks |

Load order: `tokens.css`, `components.css`, then product CSS; `theme.js` in `<head>`, `copy.js` at the end of `<body>`. Optional web fonts (the stacks fall back to system fonts):

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+KR:wght@400;500;700&display=swap">
```

## Character

- White page, dark navy text, one blue for actions, links, the current item and a person's decision.
- Separation by 1 px lines and surface steps. No shadows except real overlays, no side stripes on boxes, no gradients.
- Radius 6 / 8 / 10 px by size. Badges 4 px. Nothing fully rounded except step numbers.
- Dark theme is graphite (`#1E2124`), not black, with a muted steel blue accent. Code blocks stay dark in both.
- Bold is spent on headings and the one thing per block that matters.

## Content form → component

The writing standard (docs/standard.md §1-1) decides the form; this table says which component renders it.

| Content | Component | Rule |
| --- | --- | --- |
| Explanation | `<p>` in `.ds-stack`, `.ds-lede` for the first one | short paragraphs, `max-width: var(--measure)` |
| What a tool printed (real run) | `.ds-output`; line classes `ds-err`, `ds-warn`, `ds-ok`, `ds-prompt` | paste the actual output, never write it by hand |
| Something the reader runs | `.ds-cmd` with a `복사` button | one command block per action; comments in `<span class="ds-c">` are not copied |
| A sequence (3+ steps) | `.ds-steps`, `.is-human` + `.ds-who` for a person's step | steps only for real sequences |
| 2+ actors or branches | `.ds-figure` with a Mermaid diagram or element-built diagram | diagram before the prose that explains it |
| Comparison, list of facts | `.ds-table` in `.ds-table-wrap` | header row in `--subtle`, no zebra stripes |
| Grouping | `.ds-panel` (`--sunk` for a quieter group) | do not nest panels |
| A remark that must not be missed | `.ds-note` (`--warn`, `--danger`) | at most one per section |
| State, owner, kind | `.ds-badge` (`--accent`, `--ok`, `--warn`, `--danger`) | color means state, never decoration |
| The one main action | `.ds-btn--primary` | one per view; others `.ds-btn` |

```html
<div class="ds-cmd"><code>make ai-implement ISSUE=42 POST=1</code><button type="button">복사</button></div>

<ol class="ds-steps">
  <li><div><h3>이슈 등록</h3><p>이슈 양식으로 작성합니다.</p></div></li>
  <li class="is-human"><div><h3>ai:ready 부여</h3></div><span class="ds-who">사람</span></li>
</ol>
```

## Rules for new CSS

- Colors, fonts, radius and spacing come from tokens. A raw hex/rgb value or font stack outside `tokens.css`
  is reported by the style check (`ui-raw-color`, `ui-raw-font`). Need a new value? Add a token here first.
- Mermaid: `theme: "base"` with `themeVariables` read from the tokens, or `default` / `dark` by `prefers-color-scheme`.
- Product pages may add one brand color as `--brand` for the logo only; actions stay `--accent`.
- Check both themes, 375 / 768 / 1024 / 1440 px, and the quality floor in SKILL.md.
