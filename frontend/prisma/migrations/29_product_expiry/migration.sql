-- Date de péremption produit + seuil d'alerte (optionnel, non bloquant).
--
-- Product.expiryDate : date de péremption facultative (null = non périssable).
-- BoutiqueSettings.expiryAlertDays : nombre de jours avant la date à partir
-- duquel on alerte (défaut 30). Réglable par le patron dans Paramètres.

ALTER TABLE "Product" ADD COLUMN "expiryDate" TIMESTAMP(3);

ALTER TABLE "BoutiqueSettings" ADD COLUMN "expiryAlertDays" INTEGER NOT NULL DEFAULT 30;
