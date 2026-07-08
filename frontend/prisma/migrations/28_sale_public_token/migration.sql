-- Lien public de reçu — jeton aléatoire par vente, permettant au client
-- d'ouvrir/télécharger son reçu sans compte (partage WhatsApp).

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "publicToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_publicToken_key" ON "Sale"("publicToken");
