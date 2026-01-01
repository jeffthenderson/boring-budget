# Design Refresh Plan

Goal: a full UI refresh that feels modern, crisp, and extremely snappy on tap, especially on mobile.

## North-star experience
- Immediate feedback on every tap (visual state change within 100ms).
- Zero dead air: show optimistic UI or skeletons while data syncs.
- Clear hierarchy and fast scanning (numbers and statuses read instantly).
- Mobile-first ergonomics (thumb-friendly actions, dense but readable lists).
- "Boring on purpose" vibe: deadpan copy, plain surfaces, and small surprises.

## Aesthetic direction
Direction: **Deadpan Minimal**. Quiet, modern, and intentionally plain, with speed as the punchline.

Visual notes:
- Typography: clean and neutral, with a dedicated mono for numbers.
  - Example pairings to explore: `General Sans` (headings), `Source Sans 3` (body), `JetBrains Mono` (numbers).
- Color: white + cool greys, with a single crisp accent.
  - Example palette: Ink (#111111), Paper (#FFFFFF), Fog (#F4F5F7), Slate (#7A7F87), Graphite (#3C4046), Accent (Signal Blue #2563EB).
- Surfaces: quiet cards, thin dividers, and subtle elevation.
- Numbers: bigger, tighter, and aligned for quick scanning.

## Brand promise + deadpan humor
Make "boring" a design system, not just copy.
- **Motifs**: plain blocks, quiet grids, minimal borders, and calm spacing.
- **Microcopy**: short, dry, and confident. Keep it under 4 words when possible.
  - Success: "Done." / "Filed." / "Logged."
  - Loading: "Still working." / "Processing." / "Thinking."
  - Empty state: "Nothing happened. Perfect."
  - Error: "That wasn't it." / "Try again."
  - Syncing: "Syncing." / "Updating."
- **Surprise + delight**: tiny, deadpan confirmations and subtle visual rewards (micro-check, dot pulse, 1px nudge).
- **Delight mechanics**: predictable structure with small, dry flourishes.
  - Minimal toasts: "Saved. Calm down."
  - Inline confirmations: "Recorded." tucked into the row that changed.
  - Micro-animations: a 90ms checkmark draw or dot blink.
- **Layout**: simple, uncluttered, and unexpectedly fast.

## Dry wit patterns (copy + UI)
Use humor as a tiny reward, not a distraction.
- **Action confirmation**: "Done. You’re thriving." / "Saved. Try not to celebrate."
- **Undo**: "Undo that. Fine." / "We’ll pretend it didn’t happen."
- **Empty tables**: "Nothing to see. Impeccable."
- **Slow network**: "Still working. No drama."
- **Success on matching**: "Matched. Great work, us."

## Microcopy bank
Keep a short list of approved phrases and rotate lightly.
- **Create**: "Added." / "Logged."
- **Update**: "Updated." / "Changed."
- **Delete**: "Removed." / "Gone."
- **Import**: "Imported." / "Filed."
- **Match**: "Matched." / "Linked."
- **Syncing**: "Syncing." / "Updating."
- **Failure**: "Nope." / "Try again."

## Snappy interaction principles
The UI should acknowledge input before the DB returns.
- **Optimistic updates**: immediately reflect changes in lists and totals, then reconcile on response.
- **Two-stage feedback**: instant local state change + small "syncing" indicator until confirmed.
- **Aggressive tap states**: button/row highlight + micro shift (1-2px) on press.
- **Skeletons and ghosts**: placeholder rows for list changes and imports, no blank states.
- **Non-blocking modals**: lightweight drawers or inline editors, no full-screen delays.
- **Never block on refresh**: avoid full page `router.refresh()` where local state can update first.

## Mobile-first performance tactics
- Prefetch key routes (`/`, `/import`, `/accounts`) on nav hover/tap.
- Keep list rows under 2 DOM levels; avoid heavy nested layouts.
- Use visual affordances instead of spinners (dim + badge + inline status).
- Reduce layout shifts: reserve space for pending totals and row actions.
- Large tap targets (44px+), sticky action bar within thumb zone.

## Page-by-page refresh plan
1) Login
   - Minimal, one-card layout with immediate validation feedback.
   - Clear invite/recovery states with a single primary action.
   - Deadpan helper copy and a tiny, immediate success cue.
   - Success: "Logged in. Riveting."

2) Budget dashboard
   - Split "summary" vs "transactions" into distinct panes on desktop.
   - On mobile: summary collapses to a sticky strip.
   - Transactions list: single-line key info + expandable details.
   - Micro states: "posting", "syncing", "linked", "ignored" badges.
   - Calm rows with tight typography and subtle separators.
   - Inline success copy on row edits: "Updated. Thrilling."

3) Import
   - Make the drop zone feel instant: add ghost rows on file select.
   - Show progress inline in the list, not as a blocking modal.
   - Deadpan progress copy (ex: "Working.").
   - Completion toast: "Imported. Wild."

4) Recurring
   - Treat projected vs posted as visually distinct chips.
   - Make matching feel like a fast merge (inline preview, one-tap confirm).
   - Use a clean, quick confirm state with deadpan copy.
   - Match success: "Matched. It’s fine."

5) Accounts + Settings
   - Compact cards, clear affordances for edit/save.
   - Inline edits with optimistic UI for quick changes.
   - Form labels and toggles stay simple and neutral.
   - Save feedback: "Saved. Deeply exciting."

6) Amazon
   - Strong, clean table with status chips and a right-side detail drawer.
   - Deadpan labels and a tidy detail grid.
   - Linking feedback: "Linked. Necessary."

## Component refresh list
- Buttons: press states, loading overlays, and optimistic variants.
- Inputs: focus rings, inline validation, clear helper text.
- Cards: sharper corners, thin borders, consistent padding.
- Table: sticky headers, hover states, dense rows.
- Modals/drawers: instant open, lightweight close, no heavy animation.
- Status chips: consistent colors for posted/projected/ignored/syncing.
- Subtle success cues: small dot, line, or micro-check.
- Toasts: minimal, low-contrast, 1-line messages with dry copy.

## Data + UI strategy
- Use optimistic state for all mutations (create, update, delete).
- Debounce server actions when typing; commit on blur/enter.
- Track pending operations and show inline "syncing" tags per row.
- Avoid global spinners; use per-control pending states.

## Motion plan (snappy, not slow)
- Page load: short stagger reveal (150-250ms total).
- Tap: 80-120ms press/confirm animations.
- Use subtle transforms instead of opacity-only fades.
- Success cue: quick scale-in or opacity pulse (under 120ms).
- Toasts: slide in 6-8px, exit in 150ms max.

## Phased implementation
Phase 0 (1 day): audit current UI, capture before/after screenshots, measure INP.
Phase 1 (1-2 days): tokens + typography, component polish, tap states.
Phase 2 (2-3 days): page layouts, mobile nav/summary, list UX.
Phase 3 (1-2 days): optimistic UI + pending states, micro-motion.
Phase 4 (1 day): QA, tune performance, remove jank.

## Success criteria
- Perceived tap latency < 100ms (press state appears immediately).
- INP target < 200ms on mid-range mobile.
- No blank states during data refresh; always show placeholders.
