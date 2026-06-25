-- Onboarding « première fois ». Colonne nullable additive. Les comptes EXISTANTS
-- sont rétro-remplis (= déjà onboardés) pour ne pas revoir l'accueil ; les
-- nouveaux comptes restent NULL et voient la modale une seule fois.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "onboardedAt" TIMESTAMP(3);

-- Backfill : tout utilisateur déjà créé est considéré comme déjà accueilli.
UPDATE "User" SET "onboardedAt" = "createdAt" WHERE "onboardedAt" IS NULL;
