-- Phase 8 — Abonnement SaaS (gestion manuelle v1).
--
-- Ajoute les 3 champs d'abonnement sur Organization (le statut essai/actif/
-- expiré est DÉRIVÉ de ces dates, jamais stocké) + la table de journal des
-- paiements SubscriptionPayment (encaissement manuel espèces/mobile confirmé
-- par un SUPERADMIN).

-- Organization : plan + dates d'abonnement (tous nullable, additifs).
ALTER TABLE "Organization" ADD COLUMN "plan" TEXT;
ALTER TABLE "Organization" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);

-- Backfill : les boutiques déjà créées reçoivent un essai frais de 15 jours à
-- partir du déploiement (sinon elles apparaîtraient « expirées » d'emblée).
UPDATE "Organization" SET "trialEndsAt" = NOW() + INTERVAL '15 days' WHERE "trialEndsAt" IS NULL;

-- Journal des paiements d'abonnement.
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "note" TEXT,
    "requestedById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionPayment_organizationId_idx" ON "SubscriptionPayment"("organizationId");
CREATE INDEX "SubscriptionPayment_status_idx" ON "SubscriptionPayment"("status");

ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
