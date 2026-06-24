# Boutique Notifications — Design

**Date:** 2026-06-24
**Goal:** Make the notification bell come alive — generate in-app notifications on boutique events, with owner-configurable thresholds and per-type on/off toggles in Settings.

## Context

The notification *infrastructure* already exists and is unused by boutique flows:
- `createNotification(prisma, input)` — dedup via `Notification.dedupeKey @unique`.
- Read APIs: `GET /api/notifications`, `PATCH /api/notifications` (mark read), `GET /api/notifications/count`.
- Per-user prefs: `NotificationPreferences { prefs: { [type]: { email, inApp } } }`, helpers `mergePrefs` / `isChannelEnabled` (opt-out: missing type = enabled). API `GET/PATCH /api/notifications/prefs`.
- `Notification.type` is a free `String` → **no migration to add new types**.

Gaps: (1) nothing creates notifications on boutique events, (2) no bell UI, (3) no Settings UI for thresholds/toggles.

## Recipient model

All boutique notifications go to the **boutique owner** = `Organization.ownerId`.
Self-action suppression: for `SALE_MADE` and `BIG_EXPENSE`, skip when the actor *is* the owner (they were just on the screen). `LOW_STOCK` and `RECEIVABLE_OVERDUE` are state alerts → always fire. Net effect: a solo owner gets a calm bell (stock + overdue only); employees' actions surface automatically once hired.

## Notification types (string constants)

`LOW_STOCK`, `RECEIVABLE_OVERDUE`, `SALE_MADE`, `BIG_EXPENSE`.

## Channel

In-app bell only. No email. (Email stays for account flows.) Gating uses the existing
per-user prefs `inApp` channel via `isChannelEnabled(prefs, type, 'inApp')`.

## Configurable thresholds (per boutique → `BoutiqueSettings`)

New columns (migration):
- `overdueDays Int @default(30)` — a receivable is "overdue" when `OPEN`/`PARTIAL` and `createdAt < now - overdueDays`.
- `bigExpenseThreshold Int @default(50000)` — FCFA (integer, smallest unit), expense ≥ this fires `BIG_EXPENSE`.

On/off toggles reuse `NotificationPreferences` (per-user, owner's `inApp` flag) — **no new storage**.

## Components / data flow

### `notifyOwner(prisma, orgId, input)` — base dispatcher
`input: Omit<CreateNotificationInput,'userId'>`. Resolves `ownerId`; loads owner prefs;
returns early if `!isChannelEnabled(prefs, input.type, 'inApp')`; else `createNotification`.

### Templates (`notifications/templates.ts`)
Pure functions returning `CreateNotificationInput` (minus userId where convenient) with
deterministic dedupe keys:
- `lowStock(productName, qty, productId)` → `low-stock:${productId}:${YYYY-MM-DD}` (daily granularity — re-fires after restock-then-drop, never spams).
- `receivableOverdue(customerName, amount, receivableId)` → `receivable-overdue:${receivableId}` (once per receivable).
- `saleMade(number, total, currency, saleId)` → `sale-made:${saleId}`.
- `bigExpense(label, amount, currency, expenseId)` → `big-expense:${expenseId}`.

### Event hooks (`notifications/boutique-events.ts`)
- `onSaleCommitted(prisma, {orgId, sellerId, sale:{id,number,total}, productIds})` — resolves owner+prefs once: `SALE_MADE` if `sellerId !== ownerId`; re-reads affected products and fires `LOW_STOCK` for each with `threshold>0 && qty<=threshold`.
- `onExpenseCreated(prisma, {orgId, creatorId, expense:{id,label,amount}})` — reads `bigExpenseThreshold`; `BIG_EXPENSE` if `amount>=threshold && creatorId!==ownerId`.
- `onProductAdjusted(prisma, {orgId, productId})` — `LOW_STOCK` if below threshold.
- `notifyOverdueReceivables(prisma, {now})` — for the cron: per org, read `overdueDays`, find overdue OPEN/PARTIAL receivables, `notifyOwner` each. Returns count.

All event hooks are invoked from route handlers via Next.js `after()` (post-response) so
checkout/expense latency is unaffected — same guarded pattern as `flushEmailsAfterResponse`
(no-op under `NODE_ENV==='test'`, try/catch around `after`).

### Cron — `GET/POST /api/cron/receivable-overdue` (daily)
`verifyCronSecret` + `leader-lease`. Calls `notifyOverdueReceivables`. Add to `vercel.json`
(daily, staggered — Hobby plan rejects sub-daily).

### API — `/api/org/current`
Add `overdueDays`, `bigExpenseThreshold` to `SETTINGS_SELECT`, GET view, `PatchBody`
(`z.number().int().min(...).max(...)`), and the settings upsert. Mirror in
`ensure-boutique.ts` (`BoutiqueSettingsView`, `SETTINGS_SELECT`, `viewSettings`, defaults).

### Frontend
- `components/boutique/NotificationBell.tsx` — bell icon + unread badge (polls `/api/notifications/count`), dropdown lists `/api/notifications` (recent), click item → `PATCH` mark read, "tout marquer comme lu". Empty state. Mounted in `TopBar` so it shows on **every** screen regardless of per-screen `actions`.
- `TopBar.tsx` — always render `<NotificationBell/>` alongside (not instead of) screen actions.
- Paramètres "Notifications" section — 2 number inputs (→ `PATCH /api/org/current`) + 4 toggles (→ `PATCH /api/notifications/prefs`).
- i18n keys in `dictionary.ts` (FR).

## Testing

- `notify-owner` / `boutique-events` unit tests (prisma mock): owner resolution, self-skip, pref gating, threshold gating, dedupe key shape.
- `notifyOverdueReceivables` selection logic (date window, status filter, per-org threshold).
- `org/current` PATCH validation for the 2 new fields.
- Cron route auth (401 without bearer) mirroring existing cron tests.
- Reuse existing notification read/prefs tests unchanged.

## Out of scope (YAGNI)

Email channel for these events; push/SMS; notification grouping/digests; per-employee
recipient routing (only owner notified in v1).
