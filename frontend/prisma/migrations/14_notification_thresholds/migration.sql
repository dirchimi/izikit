-- Notifications boutique — seuils réglables par le patron.
-- Colonnes NOT NULL avec valeur par défaut : les boutiques existantes
-- héritent automatiquement de 30 jours / 50 000 FCFA, aucune donnée impactée.
-- overdueDays         = une créance impayée devient « en retard » après N jours.
-- bigExpenseThreshold = une dépense ≥ ce montant déclenche l'alerte « grosse dépense ».

-- AlterTable
ALTER TABLE "BoutiqueSettings" ADD COLUMN "overdueDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "BoutiqueSettings" ADD COLUMN "bigExpenseThreshold" INTEGER NOT NULL DEFAULT 50000;
