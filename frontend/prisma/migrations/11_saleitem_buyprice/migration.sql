-- Phase 7 — instantané du prix d'achat sur la ligne de vente.
-- Permet de calculer la marge brute des rapports de façon immuable (la marge
-- ne change pas si le produit est ré-approvisionné à un autre prix d'achat).

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN "buyPrice" INTEGER NOT NULL DEFAULT 0;
