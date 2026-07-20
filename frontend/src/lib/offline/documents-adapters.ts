/**
 * documents-adapters.ts — pure `DocumentRow` → UI-shape adapter for the offline
 * ventes screen's invoice lookup (Task 5.5 of the offline-first plan; see
 * docs/superpowers/plans/2026-07-20-offline-first-boutique.md, PHASE 5).
 *
 * Mirrors the small-pure-mapper pattern the other `*-adapters.ts` files
 * established: a dependency-free function, directly unit-testable with no render
 * harness. `VentesManager` reads its `FACTURE` documents live from `db.documents`
 * (mirrored by `pull.ts`) instead of over the network, so this maps a Dexie
 * `DocumentRow` back into the `ApiDocument` shape `GET /api/documents` returned
 * (`frontend/src/components/boutique/documents/types.ts`) — the same shape the
 * invoice-preview modal already consumes.
 *
 * Two normalisations vs the Dexie row, both matching the server's own
 * `documentView`: the stored uppercase `status` (`PAID`/`PENDING`/`CREDIT`) is
 * lowercased to the UI `UiDocStatus`, and absent optional keys
 * (`clientPhone`/`note` — `exactOptionalPropertyTypes`) become the `''` the UI
 * expects.
 */
import type { DocumentRow, DocumentStatus } from './db';
import type { ApiDocument, UiDocStatus } from '@/components/boutique/documents/types';

function toUiStatus(status: DocumentStatus): UiDocStatus {
  if (status === 'PAID') return 'paid';
  if (status === 'PENDING') return 'pending';
  return 'credit';
}

/** Maps a local Dexie `DocumentRow` to the `ApiDocument` shape the ventes
 * invoice lookup + preview modal render. */
export function documentRowToApi(d: DocumentRow): ApiDocument {
  return {
    id: d.id,
    type: d.type,
    number: d.number,
    saleId: d.saleId ?? null,
    clientName: d.clientName,
    clientPhone: d.clientPhone ?? '',
    status: toUiStatus(d.status),
    total: d.total,
    balanceAfter: d.balanceAfter ?? null,
    note: d.note ?? '',
    lines: d.lines,
    validityDays: d.validityDays ?? null,
    issuedAt: d.issuedAt,
  };
}
