-- Codes de réduction sur l'abonnement (Phase 8).
--
-- Un SUPERADMIN crée des codes ; le patron les saisit avant d'émettre sa demande
-- de paiement, ce qui réduit le montant. Le serveur valide et recalcule le prix.

-- Colonnes ajoutées à la demande de paiement : code appliqué + prix de base.
ALTER TABLE "SubscriptionPayment" ADD COLUMN "discountCode" TEXT;
ALTER TABLE "SubscriptionPayment" ADD COLUMN "baseAmount" INTEGER;

-- Table des codes.
CREATE TABLE "DiscountCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscountCode_code_key" ON "DiscountCode" ("code");
CREATE INDEX "DiscountCode_active_idx" ON "DiscountCode" ("active");
