---
name: ScholarSync Academic Dark
colors:
  surface: '#0d0d0d'
  surface-dim: '#161616'
  surface-bright: '#1a1a1a'
  surface-container-lowest: '#0a0a0a'
  surface-container-low: '#111111'
  surface-container: '#161616'
  surface-container-high: '#1e1e1e'
  surface-container-highest: '#242424'
  on-surface: '#f0f0ef'
  on-surface-variant: '#9a9a96'
  inverse-surface: '#f0f0ef'
  inverse-on-surface: '#111111'
  outline: '#2e2e2e'
  outline-variant: '#252525'
  surface-tint: '#a3a3a0'
  primary: '#f0f0ef'
  on-primary: '#0d0d0d'
  primary-container: '#1e1e1e'
  on-primary-container: '#c8c8c4'
  inverse-primary: '#1a1a1a'
  secondary: '#7c6f5e'
  on-secondary: '#f0f0ef'
  secondary-container: '#2a2520'
  on-secondary-container: '#c4b49e'
  tertiary: '#5c7a5c'
  on-tertiary: '#f0f0ef'
  tertiary-container: '#1e2b1e'
  on-tertiary-container: '#8fb48f'
  error: '#f87171'
  on-error: '#0d0d0d'
  error-container: '#2d1515'
  on-error-container: '#f87171'
  background: '#0d0d0d'
  on-background: '#f0f0ef'
  surface-variant: '#1e1e1e'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 56px
    fontWeight: '500'
    lineHeight: '1.05'
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Geist
    fontSize: 36px
    fontWeight: '500'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 36px
    fontWeight: '500'
    lineHeight: '1.15'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '500'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Geist
    fontSize: 17px
    fontWeight: '400'
    lineHeight: '1.65'
  body-md:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.6'
  label-md:
    fontFamily: Geist Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.08em
  label-sm:
    fontFamily: Geist Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: '1'
    letterSpacing: 0.1em
rounded:
  sm: 0.375rem
  DEFAULT: 0.75rem
  md: 1rem
  lg: 1.5rem
  xl: 2rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1400px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 20px
  section-gap: 96px
---

## Brand & Style
ScholarSync is a dark-mode-first academic intelligence platform. The design personality is **precise, authoritative, quietly premium** — think a redacted government archive meets a well-lit research terminal. The visual language strips all decorative noise. Every element earns its place through function or hierarchy.

The aesthetic is **Dark Utilitarian Scholarly**: deep black (#0D0D0D) surfaces, off-white (#F0F0EF) primary text, with a single warm sand accent reserved exclusively for active states and primary CTAs. No gradients. No glassmorphism on scrolling content. No AI-purple anywhere.

## Colors
The palette is built on near-black surfaces with high-contrast off-white text:

- **Void Black** (#0D0D0D) — Primary background. Not pure black — avoids harsh digital feel.
- **Surface Low** (#111111) — Card and container fill. 1 step above background to establish elevation.
- **Surface Medium** (#161616) — Slightly elevated panels, code blocks, secondary containers.
- **Surface High** (#1E1E1E) — Active states, hover states, selected rows.
- **Chalk White** (#F0F0EF) — Primary text. Off-white avoids pure white harshness on dark backgrounds.
- **Ash** (#9A9A96) — Secondary text, metadata, captions, placeholders.
- **Graphite** (#2E2E2E) — Structural borders, table dividers, 1px hairlines.
- **Sand Warm** (#C4B49E) — Single accent. Used ONLY on primary CTAs, active nav indicators, focus rings, and import buttons. No secondary use.

## Typography
Pure sans-serif stack. No serif — this is a software dashboard, not an editorial publication.

- **Display/Headlines**: Geist — tight tracking (-0.02em to -0.03em), medium weight (500). Scale: 56px display, 36px h1, 24px h2, 18px h3.
- **Body**: Geist — relaxed leading (1.6-1.65). 15-17px for comfortable reading in dense academic content. Secondary text in Ash (#9A9A96).
- **Mono**: Geist Mono — for all metadata (paper IDs, dates, page numbers, citation badges, source tags, code blocks). 10-11px, tracked wide (0.08-0.1em), all-caps uppercase.
- **Banned**: Inter (too generic), any serif font (wrong context for a software dashboard).

## Layout & Spacing
- **Contained max-width**: 1400px centered, 64px desktop margins, 20px mobile margins.
- **Section rhythm**: 96px vertical gaps between major sections.
- **Grid**: 12-column CSS Grid, never flexbox percentage math.
- **Hero**: Left-aligned split layout (never centered). Large headline on the left 7 columns, supporting visual or stat panel on the right 5 columns.
- **Feature Grids**: Asymmetric bento. Never 3 equal columns. Mix: col-span-7 + col-span-5, col-span-5 + col-span-7, col-span-12 full-width breakout.
- **Mobile**: All multi-column layouts collapse to single column at 768px. No horizontal overflow.

## Component Stylings
- **Buttons Primary**: Sand Warm accent (#C4B49E) background, Void Black text. Rounded-full pill shape. Generous padding (px-6 py-3). Tactile -1px translate on active. No glow, no shadow.
- **Buttons Secondary**: Transparent with 1px Graphite (#2E2E2E) border and Ash text. Same pill shape. Hover: Surface High (#1E1E1E) fill.
- **Cards**: Surface Low (#111111) fill. 1px Graphite border. Rounded-lg (1.5rem). No shadow — elevation implied by color delta from background. Hover: Surface High fill transition.
- **Inputs**: Surface Medium (#161616) fill, 1px Graphite border. Rounded-md (1rem). Focus: 1px Sand Warm border ring. Label always above, never floating. Placeholder text in Ash.
- **Tags / Source Badges**: Geist Mono, 10px, uppercase, wide tracking. Surface Medium background, Ash text, 1px Graphite border. Rounded-sm (0.375rem).
- **Table Rows**: Hairline border-bottom (Graphite). No card containers around tables. Hover: Surface High fill transition. Selected: Surface High fill + Sand Warm left 2px accent border.
- **Loaders**: Skeletal shimmers matching exact row/card dimensions. No spinner circles.
- **Empty States**: Centered composition with a large Geist Mono label and clear action button. Not just "No data found."
- **Citation Badges**: Inline pill, Geist Mono, 9px, Surface Medium background, Sand Warm text. Subtle — never distracting.

## Motion & Interaction
- **Entry animations**: Opacity 0 → 1, translateY 16px → 0. Duration 500ms. Ease: cubic-bezier(0.16, 1, 0.3, 1). `whileInView` with `once: true`. Never `window.scroll`.
- **Stagger**: Lists and bento grids stagger at 60ms intervals per item. Parent `variants` with `staggerChildren: 0.06`.
- **View transitions**: AnimatePresence with `mode="wait"`. Exiting view fades out (200ms), entering view fades + slides up (400ms).
- **Hover states**: Cards scale to `scale(1.005)` and border transitions to Surface High color over 200ms. No translate-y on cards (too bouncy for a research tool).
- **Button press**: `whileTap: { scale: 0.97 }`. Immediate, tactile.
- **Table row hover**: Background transition 150ms. No scale.
- **Performance**: Animate exclusively via `transform` and `opacity`. `will-change: transform` only on actively animating elements.

## Anti-Patterns (Banned)
- No emojis anywhere in the UI
- No Inter, Roboto, Open Sans, or any default system fonts
- No serif fonts — this is a software dashboard, not a publication
- No neon/outer glow shadows (box-shadow with colored blur)
- No pure black (#000000) or pure white (#FFFFFF)
- No centered hero sections (split/left-aligned only)
- No 3 equal-column feature card grids
- No warm beige/brass/cream backgrounds (premium-consumer cliché, wrong context)
- No AI purple gradient anything
- No overlapping elements — clean spatial separation always
- No "Elevate", "Seamless", "Next-Gen", "Unleash", or any AI copywriting clichés
- No decorative scroll arrows, bouncing chevrons, or "scroll to explore" filler
- No fake round numbers (99.9%, 50k+) without real data backing
- No broken image URLs — use picsum.photos/seed/{context}/{w}/{h} or omit images entirely
- No heavy drop shadows on dark surfaces (they create muddy depth)
