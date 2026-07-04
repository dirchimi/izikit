-- Pays de la boutique (ISO 3166-1 alpha-2). Fixe l'indicatif téléphonique par
-- défaut pour la recomposition des numéros WhatsApp. Défaut Tchad ("TD").
ALTER TABLE "BoutiqueSettings" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'TD';
