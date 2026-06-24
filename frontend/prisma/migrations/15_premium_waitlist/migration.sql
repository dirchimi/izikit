-- Liste d'attente Premium (teaser). Colonne nullable, additive : les comptes
-- existants gardent NULL (pas inscrits). Renseignée quand l'utilisateur clique
-- « Être prévenu ». Sert au comptage de la demande côté admin.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "premiumInterestAt" TIMESTAMP(3);
