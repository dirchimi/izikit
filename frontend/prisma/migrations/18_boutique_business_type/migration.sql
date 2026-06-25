-- Type de commerce (onboarding). Colonne nullable additive : les boutiques
-- existantes gardent NULL (non renseigné).

-- AlterTable
ALTER TABLE "BoutiqueSettings" ADD COLUMN "businessType" TEXT;
