/**
 * customer-adapters.ts — pure `CustomerRow` → UI-shape adapter for the
 * offline customer picker (Task 5.4 of the offline-first plan; see
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md, PHASE 5).
 *
 * Mirrors the small-pure-mapper pattern `expense-adapters.ts` established
 * (see its docblock) — a dependency-free function, directly unit-testable
 * with no render harness, that `ClientPicker` applies to every row read live
 * from `db.customers`. The mapped shape matches what `GET /api/customers`
 * used to return (`{ id, name, phone }` — see
 * `frontend/src/app/api/customers/route.ts`'s `select`) so the component's
 * existing search/filter logic needs no other change once the data source
 * switches from `useApi` to `useLocalResource`. Locally-created customers
 * (`synced: false` — created offline mid-sale, see `createSaleOffline`, or
 * via `createCustomerOffline`) are NOT filtered out here: they must be
 * pickable immediately so a second sale can attach to the same just-created
 * client while still offline.
 */
import type { CustomerRow } from './db';

export interface ApiCustomer {
  id: string;
  name: string;
  phone: string | null;
}

/**
 * Maps a local Dexie `CustomerRow` to the shape `ClientPicker` renders.
 * `phone` is optional on the Dexie row (`exactOptionalPropertyTypes` —
 * absent key, not `undefined`) but the UI expects `string | null`, matching
 * the server's own nullable `phone` column — absent becomes `null`.
 */
export function customerRowToApi(c: CustomerRow): ApiCustomer {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone ?? null,
  };
}
