-- Prix de gros + unité de vente + unicité du code-barres par boutique (LOT 2).
--
-- prixGros : prix de vente en gros, distinct du prix de vente au détail
--   existant (sellPrice). 0 = non défini.
-- unite    : unité de vente libre (pièce, carton, kg, sac, litre, sachet…),
--   'piece' par défaut.
-- barcode  : passe d'un index simple à une contrainte d'unicité par boutique
--   (un même code-barres ne peut désigner deux produits d'une même boutique).
--   NULL reste autorisé plusieurs fois (Postgres traite chaque NULL comme
--   distinct), donc les produits sans code-barres ne se gênent pas.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "prixGros" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "unite" TEXT NOT NULL DEFAULT 'piece';

-- DropIndex
DROP INDEX "Product_organizationId_barcode_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_barcode_key" ON "Product"("organizationId", "barcode");
