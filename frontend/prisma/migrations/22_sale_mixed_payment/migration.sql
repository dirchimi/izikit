-- LOT 3 — paiement mixte + motif d'annulation.
-- Ventilation d'une vente en espèces / mobile money / crédit (la part crédit
-- devient la créance), et motif obligatoire à l'annulation. Colonnes additives
-- avec valeurs par défaut → aucune perte de données sur les ventes existantes.
ALTER TABLE "Sale" ADD COLUMN "cashAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "mobileAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "creditAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "cancelReason" TEXT;
