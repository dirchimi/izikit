-- Lot 2 (#2) — logo de la boutique.
-- Colonne nullable : aucune donnée existante n'est impactée (les boutiques
-- sans logo gardent NULL et affichent l'initiale par défaut). Le logo est
-- une URL Cloudinary publique stockée après upload via /api/upload.

-- AlterTable
ALTER TABLE "BoutiqueSettings" ADD COLUMN "logoUrl" TEXT;
