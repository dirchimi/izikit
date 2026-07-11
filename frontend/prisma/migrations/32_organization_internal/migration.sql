-- Compte interne / exonéré sur Organization.
--
-- Boutiques test, associés, comptes offerts : accès gratuit permanent (le garde
-- d'abonnement ne bloque jamais) et exclues de toutes les statistiques
-- plateforme (elles ne sont pas de vrais clients payants).
ALTER TABLE "Organization" ADD COLUMN "internal" BOOLEAN NOT NULL DEFAULT false;
