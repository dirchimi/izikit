-- Code-barres produit (EAN/UPC…). Colonne nullable additive : les produits
-- existants gardent NULL (aucun code-barres). Index pour la recherche/scan.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "barcode" TEXT;

-- CreateIndex
CREATE INDEX "Product_organizationId_barcode_idx" ON "Product"("organizationId", "barcode");
