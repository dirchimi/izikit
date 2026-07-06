-- Dettes fournisseurs — argent dû par la boutique à ses fournisseurs pour du
-- stock acheté à crédit (« en prêt »). Miroir « achat » des Receivable.
-- Rattachée à un produit (scalaire, pas de FK), `label` fige le nom.

-- CreateTable
CREATE TABLE "SupplierDebt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT,
    "label" TEXT NOT NULL,
    "supplierName" TEXT,
    "amount" INTEGER NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierDebt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupplierDebt_organizationId_idx" ON "SupplierDebt"("organizationId");

-- CreateIndex
CREATE INDEX "SupplierDebt_organizationId_status_idx" ON "SupplierDebt"("organizationId", "status");
