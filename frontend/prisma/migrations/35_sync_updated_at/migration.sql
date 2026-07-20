-- Task 1.2 — offline-first sync: add `updatedAt` to the 4 models the batch
-- pull endpoint (`GET /api/sync/pull`) needs to filter incrementally on
-- `updatedAt > since`. Without this column a row mutated after a device's
-- last pull (e.g. a Sale cancelled — status/cancelledAt change) would never
-- re-sync to that device. Product, Customer, Receivable already have
-- `updatedAt` (unchanged here).
--
-- Existing rows get `DEFAULT CURRENT_TIMESTAMP` so the column can be
-- NOT NULL without a separate backfill step (matches Prisma's own generated
-- form for `@updatedAt` added to an existing table).

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
