# Design System — Phase 1 Tokens

This directory is the **single source of truth for every visual primitive
used by the SPA**: colors, spacing, radius, typography, shadows, motion,
z-index, and overlays.

Everything is defined as CSS custom properties on `:root` in
[`globals.css`](./globals.css). Every component — JSX, CSS, inline — is
expected to reference these tokens by name, not by literal value.

This README documents:
- The Phase 1 token catalog
- Authoring rules (what to use when)
- The lint rule that enforces it
- Migration policy for existing violations

> Phase 1 covers tokens + enforcement. Component / layout / report
> standardization happens in Phases 2–7 of the migration plan.

---

## Token catalog

### Spacing — multiples of 4 px

| Token            | Value | Use for                                        |
| ---              | ---   | ---                                            |
| `--space-0-5`    | 2 px  | Hairline transforms, micro shifts, badge dots  |
| `--space-0-75`  | 3 px  | Tight chip insets (date-range, pill paddings)  |
| `--space-1`      | 4 px  | Icon-to-text gap, smallest visible spacing     |
| `--space-1-5`    | 6 px  | Button-sm vertical padding, badge gap          |
| `--space-2`      | 8 px  | Inline action groups, table cell horizontal    |
| `--space-2-5`    | 10 px | Dense list rows, sidebar nav padding           |
| `--space-3`      | 12 px | Form-field grid gap, card-internal stack       |
| `--space-3-5`    | 14 px | Sidebar brand padding, mid-range layout gap    |
| `--space-4`      | 16 px | Section internal padding (default)             |
| `--space-4-5`    | 18 px | Card-header padding, slightly-larger nav       |
| `--space-5`      | 20 px | Card body padding                              |
| `--space-6`      | 24 px | Section-to-section vertical rhythm             |
| `--space-7`      | 28 px | Page-header → first section                    |
| `--space-8`      | 32 px | Modal body padding (lg)                        |
| `--space-9`      | 36 px | Avatar-lg, input height                        |
| `--space-10`     | 40 px | Hero spacing                                   |
| `--space-12`     | 48 px | Top-of-page reset                              |
| `--space-16`     | 64 px | Empty-state vertical                           |

Naming convention: `--space-N` is **N × 4 px**. Half steps use the
`-X-Y` suffix (`--space-0-5` is 0.5 × 4 = 2 px).

### Radius

| Token              | Value     | Use for                                  |
| ---                | ---       | ---                                      |
| `--radius-xs`      | 4 px      | Small chips, tags                        |
| `--radius-sm`      | 6 px      | Inputs, sort buttons, compact controls   |
| `--radius-md`      | 8 px      | Banners, payment-form lists              |
| `--radius`         | 10 px     | Cards, tables, modals (default)          |
| `--radius-lg`      | 16 px     | Elevated cards, primary action targets   |
| `--radius-xl`      | 24 px     | Hero panels                              |
| `--radius-pill`    | 9999 px   | Status pills, badges                     |
| `--radius-circle`  | 50 %      | Avatars, indicator dots                  |

### Color palette (primitives)

Defined in `:root`. Keep using the palette names for component-internal
styling that doesn't carry semantic meaning.

| Token              | Value                       |
| ---                | ---                         |
| `--accent`         | `#f5a623`                   |
| `--accent-dark`    | `#c2801a`                   |
| `--accent-glow`    | `rgba(245,166,35,0.18)`     |
| `--green`          | `#22c55e`                   |
| `--green-bg`       | `rgba(34,197,94,0.12)`      |
| `--red`            | `#ef4444`                   |
| `--red-bg`         | `rgba(239,68,68,0.12)`      |
| `--blue`           | `#3b82f6`                   |
| `--blue-bg`        | `rgba(59,130,246,0.12)`     |
| `--amber`          | `#f59e0b`                   |
| `--amber-bg`       | `rgba(245,158,11,0.14)`     |

### Color semantics (preferred for NEW code)

Aliases on top of the palette. Use these to describe **meaning** rather
than hue.

| Token            | Aliases of      | Use for                              |
| ---              | ---             | ---                                  |
| `--success`      | `--green`       | Approved, paid, confirmed states     |
| `--success-bg`   | `--green-bg`    | Success badge / banner background    |
| `--danger`       | `--red`         | Destructive actions, rejected states |
| `--danger-bg`    | `--red-bg`      | Danger banner background             |
| `--info`         | `--blue`        | Informational, in-progress           |
| `--info-bg`      | `--blue-bg`     | Info banner background               |
| `--warning`      | `--amber`       | Warnings, pending review             |
| `--warning-bg`   | `--amber-bg`    | Warning banner background            |

### Border tones — for pills, banners, callouts

| Token              | Value                            |
| ---                | ---                              |
| `--accent-border`  | `rgba(245,166,35,0.35)`          |
| `--success-border` | `rgba(34,197,94,0.32)`           |
| `--danger-border`  | `rgba(239,68,68,0.32)`           |
| `--info-border`    | `rgba(59,130,246,0.32)`          |
| `--warning-border` | `rgba(245,158,11,0.32)`          |

### Surfaces

| Token            | Value     | Use for                                  |
| ---              | ---       | ---                                      |
| `--bg`           | `#0f1117` | Page background (deepest)                |
| `--bg-2`         | `#161923` | Primary card                             |
| `--bg-3`         | `#1e2330` | Nested card, hover state                 |
| `--bg-elevated`  | `#1f2638` | POS headers, sub-bar elevations          |
| `--bg-4`         | `#252c3a` | Emphasized panel                         |
| `--bg-deep`      | `#07090f` | Gradient stops (login card, hero)        |

### Overlays — neutral whites for glass, dividers, subtle bg

| Token                 | Value                          |
| ---                   | ---                            |
| `--overlay-white-04`  | `rgba(255,255,255,0.04)`       |
| `--overlay-white-06`  | `rgba(255,255,255,0.06)`       |
| `--overlay-white-08`  | `rgba(255,255,255,0.08)`       |
| `--overlay-white-12`  | `rgba(255,255,255,0.12)`       |

### Text

| Token        | Value     | Use for                                  |
| ---          | ---       | ---                                      |
| `--text`     | `#e8ecf4` | Body                                     |
| `--text-2`   | `#8a95a8` | Secondary                                |
| `--text-3`   | `#5a6478` | Tertiary / disabled                      |

### Typography scale

| Token           | Value     | Use for                                   |
| ---             | ---       | ---                                       |
| `--font-2xs`    | 0.68 rem  | Micro labels, eyebrows                    |
| `--font-xs`     | 0.72 rem  | Captions, table headers                   |
| `--font-sm`     | 0.82 rem  | Secondary text, hints                     |
| `--font-md`     | 0.88 rem  | Body text, form labels                    |
| `--font-base`   | 0.95 rem  | Emphasized body, inputs                   |
| `--font-lg`     | 1.1 rem   | Section titles                            |
| `--font-xl`     | 1.4 rem   | Page titles                               |
| `--font-2xl`    | 1.8 rem   | Large numerics, KPI values                |
| `--font-mono`   | `'DM Mono', monospace` | IDs, codes, table numerics  |
| `--line-tight`  | 1.25      | Title line-height                         |
| `--line-normal` | 1.45      | Body line-height                          |

### Icons

| Token            | Value | Use for                                  |
| ---              | ---   | ---                                      |
| `--icon-xs`      | 12 px | Inline icons in tight rows               |
| `--icon-sm`      | 14 px | Default in text                          |
| `--icon-md`      | 16 px | Buttons                                  |
| `--icon-lg`      | 20 px | Section headers                          |
| `--icon-xl`      | 24 px | KPI cards                                |
| `--icon-2xl`     | 32 px | Empty-state icons                        |

### Form inputs

| Token               | Value | Use for                              |
| ---                 | ---   | ---                                  |
| `--input-height`    | 36 px | Standard input height                |
| `--input-padding-x` | 12 px | Horizontal padding                   |
| `--input-padding-y` | 8 px  | Vertical padding                     |

### Layout sizes

| Token            | Value     | Use for                                  |
| ---              | ---       | ---                                      |
| `--sidebar-w`    | 230 px    | Default sidebar width                    |
| `--header-h`     | 58 px     | Default header height                    |

### Shadows

| Token              | Value                                                                  |
| ---                | ---                                                                    |
| `--shadow`         | `0 2px 12px rgba(0,0,0,0.4)`                                           |
| `--shadow-lg`      | `0 8px 32px rgba(0,0,0,0.5)`                                           |
| `--shadow-popover` | `0 12px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35)`             |

### Motion

| Token            | Value                                       |
| ---              | ---                                         |
| `--duration-fast`| `120ms`                                     |
| `--duration-base`| `180ms`                                     |
| `--duration-slow`| `240ms`                                     |
| `--ease-out`     | `cubic-bezier(0.16, 1, 0.3, 1)`             |
| `--ease-in-out`  | `cubic-bezier(0.4, 0, 0.2, 1)`              |
| `--transition`   | `150ms ease`                                |

### Focus

| Token            | Value                                        |
| ---              | ---                                          |
| `--ring-focus`   | `0 0 0 3px var(--accent-glow)`               |
| `--ring-danger`  | `0 0 0 3px rgba(239, 68, 68, 0.22)`          |

### Z-index scale

| Token          | Value  |
| ---            | ---    |
| `--z-base`     | 1      |
| `--z-sticky`   | 50     |
| `--z-overlay`  | 100    |
| `--z-dropdown` | 500    |
| `--z-modal`    | 1000   |
| `--z-popover`  | 2000   |
| `--z-toast`    | 5000   |

### Breakpoints

| Token       | Value     | Use for                                       |
| ---         | ---       | ---                                           |
| `--bp-xs`   | 480 px    | POS header search width / smallest reflow     |
| `--bp-sm`   | 640 px    | Sidebar collapse on mobile, table reflow      |
| `--bp-md`   | 720 px    | Report filter reflow, purchasing tablet       |
| `--bp-lg`   | 960 px    | Two-column → single-column on settings        |
| `--bp-xl`   | 1280 px   | Dashboard widget reflow                       |

CSS doesn't support `var(...)` inside `@media`, so these tokens are
useful for JS-driven breakpoints and as a documented source-of-truth for
fixed media queries.

---

## Authoring rules

### CSS files — always use tokens

```css
/* ✗ */
.my-card { padding: 16px; border-radius: 8px; background: #1f2638; }

/* ✓ */
.my-card {
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
}
```

### JSX inline styles — banned for design properties

Inline `style={{}}` should never contain numeric / px / rem / em literals
for design properties. Use:
- A CSS class (preferred), or
- A token reference inside the style prop:

```jsx
// ✗ Phase 1 violation — will WARN
<div style={{ marginTop: 16, padding: '0 0 8px', fontSize: '0.84rem' }}>

// ✓ Tokenized
<div style={{
  marginTop: 'var(--space-4)',
  padding: '0 0 var(--space-2)',
  fontSize: 'var(--font-sm)',
}}>

// ✓✓ Even better — extract to a CSS class
<div className="my-thing">
```

### Whitelisted inline numeric properties

These properties are inherently unitless and can use bare numbers:

`fontWeight`, `opacity`, `zIndex`, `flex`, `flexGrow`, `flexShrink`,
`order`, `lineHeight`, `tabSize`, `columnCount`, `gridRow`, `gridColumn`.

```jsx
// ✓ Allowed
<div style={{ fontWeight: 500, opacity: 0.7, zIndex: 1000 }}>
```

### Picking the right spacing token

| Situation | Use |
| --- | --- |
| Icon and label sit next to each other | `--space-2` (8 px) |
| Form field grid gap | `--space-3` (12 px) or `--space-4` (16 px) |
| KPI card padding | `--space-5` (20 px) |
| Section internal padding | `--space-4` (16 px) |
| Section-to-section vertical | `--space-6` (24 px) |
| Page-header to first section | `--space-7` (28 px) |

### Picking the right radius

| Element | Token |
| --- | --- |
| Input, sort header | `--radius-sm` (6 px) |
| Banner, callout card | `--radius-md` (8 px) |
| Card, table, modal | `--radius` (10 px) |
| Elevated card, primary CTA | `--radius-lg` (16 px) |
| Hero panel | `--radius-xl` (24 px) |
| Status pill / chip | `--radius-pill` |
| Avatar, indicator dot | `--radius-circle` |

### Color: palette vs semantic

For status badges, banners, callouts — use **semantic** tokens so the
meaning is in the code:

```jsx
// ✓ Meaning is explicit
<Badge style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
  Paid
</Badge>
```

For one-off accents or component-internal styling — palette names are
fine.

---

## Lint enforcement

A flat ESLint config at the project root (`eslint.config.js`) blocks
numeric / px / rem / em literals in JSX `style={{}}` props.

### Run

```
npm run lint          # report
npm run lint:fix      # auto-fix what eslint can
npm run lint:summary  # list of affected files
```

### Level: `warn` (Phase 1)

The Phase 1 audit found **264+ existing violations across 48 files** —
mostly in HR, Settings, and Personal pages. Surfacing them as warnings
drives the later-phase migrations without breaking dev/build today.

The rule will be bumped to `error` once Phases 7 + 8 land and the
violation count is at zero.

### What it catches

| Pattern | Caught? | Why |
| --- | :---: | --- |
| `style={{ gap: 4 }}` | ✓ | Numeric literal in spacing property |
| `style={{ padding: '12px' }}` | ✓ | px literal |
| `style={{ fontSize: '0.84rem' }}` | ✓ | rem literal |
| `style={{ margin: '0 0 8px' }}` | ✓ | Composite string with px |
| `style={{ fontWeight: 500 }}` | — | Whitelisted property |
| `style={{ opacity: 0.7 }}` | — | Whitelisted property |
| `<Btn size={22}>` | — | Not a style prop |
| `style={{ background: 'var(--bg-3)' }}` | — | Token reference |

### Editing the rule

Open [`eslint.config.js`](../../eslint.config.js). The whitelist of
allowed inline numeric properties lives in the top `UNITLESS_OK` array.

---

## Migration policy

Phases 2–8 of the migration plan progressively kill violations:

| Phase | Drives down violations in… |
| --- | --- |
| Phase 2 — Shared components | New components built on tokens |
| Phase 3 — Layout standardization | PageHeader, layout shells, ReportShell |
| Phase 4 — Workspace standardization | Dashboards, nav |
| Phase 5 — Reports & tables | Table action cells, filter bars |
| Phase 6 — POS redesign | `pos.css` and POSPage inline styles |
| Phase 7 — Settings & profile | Phase 3/4/5 settings pages (heaviest offenders today) |
| Phase 8 — Final polish | Anything remaining, then bump rule to `error` |

When migrating a file:
1. Replace inline styles with token references or extract a CSS class
2. Verify the page visually matches before
3. Re-run `npm run lint -- <file>` and confirm zero warnings on that file

---

## What's NOT in Phase 1

Deferred to later phases (do not introduce now):

- **Light theme** — cancelled per product decision. Do not add
  `[data-theme="light"]` blocks.
- **Stylelint** for CSS-file hardcoded px values — Phase 2 work. CSS
  hardcoded values are catalogued by the Phase 1 audit and will be
  migrated when the relevant component is rewritten.
- **Workspace-level color override tokens** (e.g. a per-workspace accent
  variable) — already partially exist in `modern.css`; we'll consolidate
  them only when Phase 4 mandates it.
- **`fontWeight` named tokens** (`--weight-medium: 500`, etc.) — not
  enough usage variation today to justify; revisit if a third weight
  enters the codebase.

---

## Quick reference

```css
:root { /* see globals.css for the full list */ }
```

Single command to see every token currently defined:

```
grep -E "^\s*--[a-z]" src/styles/globals.css
```
