-- Phase 1 — Fondation tenancy boutique.
-- Profil + préférences d'une boutique (1:1 avec Organization). Créé dans la
-- même transaction que l'org lors de l'onboarding (ensure-boutique.ts).
-- currency par défaut XAF (marché CEMAC v1).

-- CreateTable
CREATE TABLE "BoutiqueSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "phone" TEXT,
    "city" TEXT,
    "address" TEXT,
    "invoiceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoutiqueSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoutiqueSettings_organizationId_key" ON "BoutiqueSettings"("organizationId");

-- AddForeignKey
ALTER TABLE "BoutiqueSettings" ADD CONSTRAINT "BoutiqueSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
