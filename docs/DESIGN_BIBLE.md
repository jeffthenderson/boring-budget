# Design Bible: Boring Budget (Graphite + Rose)

Purpose: Lock the visual and interaction system for the Boring Budget refresh.

## Brand tone
- Deadpan, dry wit with cheeky sarcasm (friendly, never mean).
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
- Accent-2 blue (secondary highlights): #0EA5E9
- Accent-2 soft: #E0F2FE
- Rose (danger/negative/in-the-red): #E11D48
- Rose soft: #FFE4E9
- Optional signal (info/link): #0EA5E9

Rules:
- Graphite is the main action color (primary buttons, active tabs, key highlights).
- Rose is reserved for destructive actions, errors, and negative amounts.
- Accent-2 blue is used sparingly for secondary highlights (loading dots, progress, info accents).
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
Short, deadpan, cheeky sarcasm. Wink at the boring. Surprise and delight.

Core tone:
- Friendly sarcasm that pokes fun at how tedious budgeting is
- Dry wit with unexpected punchlines
- Never mean, always knowing
- Vary the rhythm—some quips short, some with parenthetical asides

### Page subheadings (approved examples)
- Dashboard: "Budget like nobody is watching. (They are not.)"
- Import: "More transactions. Oh joy."
- Amazon: "The receipts you didn't want."

### Confirmation messages
- "Saved. Hold your applause."
- "Done. We'll wait while you recover."
- "Logged. The crowd goes mild."

### Loading messages (vary these—don't be repetitive)
- "Counting pennies. Heroically."
- "Summoning spreadsheets."
- "Reconciling the unremarkable."
- "Balancing. Try to contain your excitement."
- "Adding. Subtracting. Existing."

### Empty states (make each unique to context)
- No transactions: "No transactions yet. Enjoy the silence."
- No recurring: "No recurring items yet. How... peaceful."
- No accounts: "No accounts yet. Add one to import."
- No income: "No income listed. A bold choice."
- General: "Nothing here. The void stares back."

### Error messages (deadpan, not cute)
- "No luck. Try again."
- "That did not work. Shocking."
- "Nope. Again."

## Do / do not
Do:
- Keep screens crisp, spare, and fast.
- Use graphite as the signature brand accent.
- Use rose only for danger or negative values.

Do not:
- Use beige, office motifs, or heavy skeuomorphism.
- Use purple gradients or default system font stacks.
- Overuse animations.
