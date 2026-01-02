# Design Bible: Boring Budget (Graphite + Rose)

Purpose: Lock the visual and interaction system for the Boring Budget refresh.

## Brand tone
- Deadpan, dry wit. Never sarcastic or snarky.
- Calm, fast, quietly confident. The punchline is the speed.
- "Boring" is a wink, not a sleep aid.

## Typography
- Primary: Bricolage Grotesque (all headings + body copy).
- UI Mono: Azeret Mono (buttons, tabs, chips, badges, nav labels, small meta, numeric highlights).
- Numeric formatting: use tabular-nums and a mono style for ledger vibes.

## Color system
Base neutrals (Graphite palette):
- Background: #F9FAFB
- Paper: #FFFFFF
- Ink (primary text): #0F172A
- Muted text: #64748B
- Line/borders: #E2E8F0

Accents:
- Graphite accent (primary actions): #111827
- Graphite soft: #E5E7EB
- Rose (danger/negative/in-the-red): #E11D48
- Rose soft: #FFE4E9
- Optional signal (info/link): #0EA5E9

Rules:
- Graphite is the main action color (primary buttons, active tabs, key highlights).
- Rose is reserved for destructive actions, errors, and negative amounts.
- Avoid beige or warm paper tones. Keep whites and cool greys.

## Layout + surfaces
- Ledger grid background (subtle): thin 1px lines, 24px spacing, low contrast.
- Cards: white, thin borders, rounded 14-16px, minimal shadow.
- Lists: dense but readable, clear row separators, quick scanning.

## Components
Buttons:
- Primary: graphite fill, white text, mono label, quick press feedback (90ms).
- Secondary: white fill, graphite text, thin border.
- Danger: rose fill and border, white text.

Tabs + chips:
- Mono labels, small caps feel.
- Active tab uses graphite soft background and graphite border.
- Status chips use graphite soft, rose soft for warnings, green soft for success.

Inputs:
- White background, thin border, mono label.
- Focus ring in graphite.

Tables:
- Header labels in Azeret Mono, small size, spaced out.
- Hover row gets a faint graphite soft wash.

## Motion + responsiveness
- Tap feedback appears within 100ms.
- Press: translateY(1px) scale(0.99) for buttons.
- Page enter: short fade + 6-8px lift, <= 220ms.
- Avoid long spinners. Use inline "Syncing..." or subtle dots.

## Snappy UX patterns
- Optimistic UI by default for edits and adds.
- Show a small inline "Syncing" state while server confirms.
- On failure: rollback the UI, show a terse toast with undo or retry.

## Copy guide
Short, deadpan, confident. Examples:
- Saved. Please remain calm.
- Logged. Riveting.
- Updated. Try not to celebrate.
- Error. Try again.
- Nothing happened. Perfect.

## Do / do not
Do:
- Keep screens crisp, spare, and fast.
- Use graphite as the signature brand accent.
- Use rose only for danger or negative values.

Do not:
- Use beige, office motifs, or heavy skeuomorphism.
- Use purple gradients or default system font stacks.
- Overuse animations.
