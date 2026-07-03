-- Annulation de vente (LOT 1). Ajoute le statut de la vente + la traçabilité
-- de l'annulation (auteur, date). Additif : les ventes existantes passent
-- ACTIVE par défaut. La quantité et les créances ne sont jamais supprimées —
-- une annulation réintègre le stock et passe la créance liée en CANCELLED.

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Sale" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "cancelledById" TEXT;

-- CreateIndex
CREATE INDEX "Sale_organizationId_status_idx" ON "Sale"("organizationId", "status");
