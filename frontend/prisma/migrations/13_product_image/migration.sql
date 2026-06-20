-- Lot 2 (#3) — photo du produit.
-- Colonne nullable, additive : les produits existants gardent NULL et
-- affichent l'icône par défaut. La photo est une URL Cloudinary publique
-- stockée après upload via /api/upload.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "imageUrl" TEXT;
