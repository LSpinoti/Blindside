# Blindside UX Plan

## UX Positioning

Blindside should feel like a serious trading terminal, not a playful prediction app. The UX should make the privacy model legible at every step:

- Unlink is the private vault
- burners are disposable public execution accounts
- market contracts are public
- Blindside privately recombines those pieces into one account-level view

The interface should be information-dense, formal, and easy to demo.

## Primary UX Goals

- Make the privacy flow understandable in under 10 seconds.
- Make funding and trading feel like one guided action, not a scattered multi-wallet process.
- Show users exactly what is public vs private before every critical step.
- Keep the interface dense enough for a "terminal" feel without becoming visually noisy.
- Preserve trust by being explicit about privacy limits.

## Privacy Narrative

Blindside's main UX job is to teach users the privacy architecture while they trade.

Every core screen should answer three questions:

- What is happening?
- Which address is visible onchain?
- What does only Blindside know privately?

The app should never imply "full anonymity." Preferred language:

- `Private funding via Unlink`
- `Public execution via burner`
- `Private portfolio aggregation`
- `Shielded from your main wallet`

Avoid vague terms like `invisible`, `untraceable`, or `anonymous trading`.

## Information Architecture

Use a three-panel desktop layout.

- Left rail: wallet, privacy state, burner registry, navigation
- Center: market list, market detail, activity tables
- Right rail: trade ticket, transaction progress, market-specific exposure

Core routes:

- `Dashboard`
- `Markets`
- `Market Detail`
- `Activity`
- `Admin Resolve` (hidden or protected in demo mode)

On mobile, collapse to stacked cards in this order:

- privacy summary
- active market card
- trade ticket
- positions
- activity

## Core Screens

### 1. Dashboard

Purpose: show the user's private aggregate state at a glance.

Key modules:

- `Private NAV`
- `Open Exposure`
- `Realized PnL`
- `Burners In Use`
- `Private Vault Balance`
- `Open Markets`

Privacy cues:

- a top banner: `Your positions execute publicly from burners. Only this app maps them back to your Unlink vault.`
- split cards into `Private` and `Public` sections
- show aggregate totals only in the `Private` section

### 2. Markets List

Purpose: help users scan simple binary markets quickly.

Each row should show:

- market question
- strike level
- cutoff time
- current implied split (`YES` pool vs `NO` pool)
- user private exposure
- resolution source (`Pyth MON/USD`)
- status (`Open`, `Locked`, `Resolved`)

Privacy cues:

- `Your exposure` column should be private and visually separated from public market data
- hover or tap helper text: `Exposure aggregates burner positions linked only in this app`

### 3. Market Detail

Purpose: combine public market data with the user's private position map.

Modules:

- contract summary
- settlement rule
- public pool totals
- user's private exposure
- burner addresses used for this market
- claim status after resolution

Privacy cues:

- side-by-side `Public Market View` and `Your Private View`
- burner list should display short addresses plus tags like `Trade 1`, `Claim wallet`
- explain that each burner is a disposable execution account

### 4. Trade Ticket

Purpose: compress the whole private trade flow into one controlled panel.

Trade ticket steps:

1. choose side (`YES` or `NO`)
2. enter MON amount
3. preview funding source (`Unlink vault`)
4. preview execution address (`Burner B-03`)
5. confirm `Fund burner + place trade`

The user should not manually jump between wallet abstractions unless they choose to inspect details.

Privacy cues:

- a `Visibility` box before submit:
- `Public: burner address, trade side, amount, contract interaction`
- `Private: link to your Unlink account, aggregate portfolio, cost basis`

### 5. Activity

Purpose: make the lifecycle auditable for the user.

Use a dense table with filters.

Suggested columns:

- time
- action
- market
- source
- public address
- private impact
- status

Suggested filters:

- `Private vault`
- `Burner funding`
- `Market trades`
- `Claims`
- `Sweeps`

Privacy cues:

- color-code `Private` and `Public` rows differently
- let the user toggle `Show burner addresses`

## Privacy-First UX Components

### Privacy Rail

Persistent component in the left rail:

- `Unlink vault`
- `Active burner`
- `Public contract`
- `Return path`

This should function like a live map of where capital is sitting right now.

### Visibility Labels

Every meaningful datum should carry one of:

- `Private`
- `Public`
- `Derived privately`

This is critical to user trust.

### Burner Registry

Dense list of derived burners with:

- burner label
- short address
- assigned market
- current balance
- state (`idle`, `funded`, `in market`, `claimable`, `swept`)

This makes the privacy mechanism tangible instead of abstract.

### Transaction Timeline

A right-rail stepper for the active action:

1. `Preparing in Unlink`
2. `Funding burner`
3. `Broadcasting public tx`
4. `Confirmed on Monad`
5. `Position recorded`

This should integrate Unlink's transaction tracking so the user sees progress instead of raw hashes only.

## Interaction Design

### One-Click Happy Path

The default action should be a bundled flow:

- `Fund burner + place trade`

Under the hood it is multiple operations, but UX should keep it cohesive while still exposing the separate steps for trust.

### Progressive Disclosure

Show advanced details only when requested:

- full burner address
- tx hash
- contract address
- Pyth feed details
- exact payout formula

The terminal should feel dense, but the first read should remain understandable.

### Explicit Confirmation

Before every action that changes privacy posture, include a short plain-language confirmation:

- `This trade will be sent from a new burner address, not your main wallet.`
- `This sweep returns funds from the burner back into your private Unlink vault.`

## Visual System

Match the repo notes: formal, neutral, low-radius.

- square or nearly square cards and buttons
- neutral grays with one restrained accent color
- light and dark mode parity
- compact spacing
- tabular alignment for numbers
- monospaced rendering for addresses and hashes

Recommended visual language:

- subtle borders over large shadows
- muted fills over loud gradients
- clear section dividers
- high-contrast status chips

## Copy Guidelines

Use copy that teaches without overexplaining.

Preferred labels:

- `Private Vault`
- `Burner Execution`
- `Public Contract`
- `Aggregate Exposure`
- `Sweep Back`

Preferred helper copy:

- `Visible onchain from the burner address only.`
- `Only Blindside links this activity back to your private vault.`
- `Your totals combine multiple burners privately.`

## Error And Edge States

Design these states upfront because they are central to trust.

- no Unlink wallet yet
- insufficient private balance
- burner funding pending
- burner tx submitted but not confirmed
- market locked after cutoff
- oracle data unavailable or stale
- market resolved, claim available
- claim complete but sweep pending
- partial failure where trade succeeds but local linkage state is missing

For the last case, preserve recovery tools:

- rescan burner addresses
- import a burner by index
- rebuild local aggregate state from indexed events

## Demo Script UX

The demo should clearly expose the privacy advantage.

1. Show the dashboard with one private total and zero public context.
2. Open a market and show the trade ticket's `Visibility` box.
3. Execute `Fund burner + place trade`.
4. Show the public burner address and the market contract interaction.
5. Return to the dashboard and show the private aggregate exposure update.
6. Resolve the market and show claim plus `Sweep Back`.
7. End on the activity table with private and public actions stitched together.

## UX Acceptance Criteria

- A first-time viewer can understand the difference between Unlink and burner addresses quickly.
- The interface clearly labels what is public and what is private on every transaction flow.
- A user can place a trade without manually managing multiple wallet tools.
- The dashboard provides a strong "private terminal" feel through dense, useful information.
- The privacy messaging is precise and does not overstate anonymity.
