-- Anti-doublon : AU PLUS une demande d'abonnement PENDING par boutique.
--
-- Ferme la course « double clic » où deux POST simultanés créaient deux lignes
-- PENDING (le pré-check applicatif findFirst+create n'est pas atomique). L'index
-- unique partiel fait respecter la règle au niveau base ; la route attrape la
-- violation (P2002) et renvoie SUB_REQUEST_PENDING.

-- 1) Nettoyage défensif : s'il existe déjà des doublons PENDING pour une même
--    boutique, on ne garde que la demande la plus récente ; les autres passent
--    à REJECTED (sinon la création de l'index unique échouerait).
UPDATE "SubscriptionPayment" p
SET "status" = 'REJECTED'
WHERE p."status" = 'PENDING'
  AND p."id" <> (
    SELECT q."id"
    FROM "SubscriptionPayment" q
    WHERE q."organizationId" = p."organizationId"
      AND q."status" = 'PENDING'
    ORDER BY q."createdAt" DESC, q."id" DESC
    LIMIT 1
  );

-- 2) Index unique partiel : une seule ligne PENDING par organizationId.
--    (Prisma 5 ne modélise pas les index partiels → posé en SQL uniquement.)
CREATE UNIQUE INDEX "SubscriptionPayment_org_pending_key"
  ON "SubscriptionPayment" ("organizationId")
  WHERE "status" = 'PENDING';
