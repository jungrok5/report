---
name: polish-ui
description: Build and restyle web UI on a design system (the project's own tokens, or the bundled default "Clear") and remove the generic AI look — landing pages, developer/API docs sites, SaaS dashboards — and meet an accessibility and Korean typography floor. Use whenever you build, restyle or review HTML/CSS/Tailwind/JSX/TSX/Vue/Svelte UI, or when asked to 디자인 다듬기, AI 티 빼기, polish the UI, make it look less generic, or review a page.
paths:
  - "**/*.html"
  - "**/*.css"
  - "**/*.scss"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
  - "**/*.astro"
---

# Polish UI

The standard is `docs/standard.md` in [jungrok5/ai-design](https://github.com/jungrok5/ai-design/blob/main/docs/standard.md). A deterministic check runs after every edit and
reports the mechanical tells (purple gradients, gradient text, emoji icons, disabled zoom…). This skill is the part
that needs judgment. Copy on the page follows `polish-writing`.

## 1. Design system first

Before writing any CSS, find the design system and use only its tokens and components.

1. The repo's own system: a tokens file (`tokens.css`, `theme.ts`, `tailwind.config.*` theme, `design/DESIGN.md`).
   If one exists, use it and stop here.
2. Otherwise use the default "Clear" in `design/` next to this file: read `design/DESIGN.md`, copy
   `tokens.css`, `components.css` and `copy.js` into the repo (for example `assets/design/`), and build with the
   `ds-` components. Content form decides the component (explanation, command to copy, steps, diagram, table).
3. If the user wants a look of their own, do not guess one: show 2–3 small mockups of the real page in the
   chosen style, get a pick, then write it down as tokens before building pages.

Never introduce a raw color, font stack or radius outside the tokens file; add a token instead. The style check
reports raw values (`ui-raw-color`, `ui-raw-font`).

Then start from the product: name the page's one job and use the product's own material as the visual (a real
command, a real result screen, a diagram of how it works), not blobs, stock gradients or a generic hero.

## 2. Avoid the defaults that read as generated

Centered hero + gradient + two CTAs + logo marquee + three identical feature cards with icon tiles; purple/indigo
gradients and glows; gradient-filled headline words; glass blur as decoration; `rounded-2xl` and the same soft
shadow on everything; ALL-CAPS eyebrow labels over every heading; `01 / 02 / 03` markers on things that are not steps;
`→` on every link; emoji as icons; fade-up animation on every section; invented testimonials, logos or "10,000+ teams".
Each is fine once, for a reason. Banning one default is not enough: do not swap it for the next default — decide
from the content.

## 3. Layout and type

- Layout follows content: tables for comparisons and specs, code next to its explanation, steps only for sequences.
- Korean text: `lang="ko"`, `word-break: keep-all` with `overflow-wrap: anywhere` for long URLs and code,
  body line-height about 1.6–1.8, fonts from the type tokens. Numbers in tables: `font-variant-numeric: tabular-nums`.
- Sentence-case headings. Spend boldness in one place per page.

## 4. Quality floor (not optional)

- Contrast 4.5:1 for body text, 3:1 for large text, UI components and focus rings (WCAG 2.2 SC 1.4.3, 1.4.11).
- Visible `:focus-visible` on everything interactive; never `outline: none` without a replacement.
- Targets 44 px (24 px absolute minimum, WCAG 2.2 SC 2.5.8); pinch zoom allowed.
- Respect `prefers-reduced-motion`; motion only where it explains a change (150–250 ms ease-out).
- Responsive at 375, 768, 1024 and 1440 px; light and dark themes both legible (`color-scheme`).
- Images have `width`/`height` and real `alt`; icon-only buttons have `aria-label`.

## 5. Verify

Render the page (Playwright is available: `executablePath` from `PLAYWRIGHT_BROWSERS_PATH`) at mobile and desktop
widths, look at the screenshots, and fix what looks generic or broken before you say it is done. Report what you
checked and what you could not.

Sources and licenses: `THIRD_PARTY_NOTICES.md` in this plugin.

