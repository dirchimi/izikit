/**
 * expense-adapters.ts — pure `ExpenseRow` → UI-shape adapter for the offline
 * expenses screen (Task 5.1 of the offline-first plan; see
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md, PHASE 5).
 *
 * Mirrors the small-pure-mapper pattern `pos-adapters.ts` established for
 * `VendrePos` (see its docblock): a dependency-free function, directly
 * unit-testable with no render harness, that `DepensesManager` applies to
 * every row read live from `db.expenses`. Keeping the shape identical to
 * what `GET /api/expenses` used to return means the component's existing
 * filtering/KPI logic needs no other change once the data source switches
 * from `useApi` to `useLocalResource`.
 */
import type { ExpenseRow } from './db';

export interface ApiExpense {
  id: string;
  number: string;
  label: string;
  category: string;
  amount: number;
  note: string;
  occurredAt: string; // ISO
}

/**
 * Maps a local Dexie `ExpenseRow` to the shape `DepensesManager` renders.
 * `note` is optional on the Dexie row (`exactOptionalPropertyTypes` — absent
 * key, not `undefined`) but the UI always expects a string; absent becomes
 * `''`, matching the server's own `expenseView` (`note: e.note ?? ''` in
 * `frontend/src/app/api/expenses/route.ts`).
 */
export function expenseRowToApi(e: ExpenseRow): ApiExpense {
  return {
    id: e.id,
    number: e.number,
    label: e.label,
    category: e.category,
    amount: e.amount,
    note: e.note ?? '',
    occurredAt: e.occurredAt,
  };
}
