-- Remise globale accordée sur une vente (FCFA). `total` reste le NET encaissé
-- (= brut des lignes − remise). Défaut 0 pour l'historique existant.
ALTER TABLE "Sale" ADD COLUMN "discount" INTEGER NOT NULL DEFAULT 0;
