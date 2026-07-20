-- Task 0.1 — offline-first idempotency foundation.
--
-- 1) OfflineOperation: journal des écritures offline rejouées côté serveur.
--    `clientOpId` (généré côté client) sert de clé d'idempotence : un rejeu
--    (retry réseau, double-sync) retrouve la ligne via l'unique et renvoie
--    `resultJson` au lieu de ré-exécuter l'opération.
-- 2) StockMovement.clientOpId / Repayment.clientOpId : mêmes clés d'idempotence
--    portées directement sur les écritures de mutation les plus fréquentes en
--    offline (mouvement de stock, remboursement).

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN "clientOpId" TEXT;

-- AlterTable
ALTER TABLE "Repayment" ADD COLUMN "clientOpId" TEXT;

-- CreateTable
CREATE TABLE "OfflineOperation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientOpId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_clientOpId_key" ON "StockMovement"("clientOpId");

-- CreateIndex
CREATE UNIQUE INDEX "Repayment_clientOpId_key" ON "Repayment"("clientOpId");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineOperation_clientOpId_key" ON "OfflineOperation"("clientOpId");

-- CreateIndex
CREATE INDEX "OfflineOperation_organizationId_createdAt_idx" ON "OfflineOperation"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "OfflineOperation" ADD CONSTRAINT "OfflineOperation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
