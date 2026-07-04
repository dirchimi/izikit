-- Phase 7 — reçu de remboursement (Document type RECU).
-- repaymentId relie le reçu au Repayment (dédup si l'enregistrement est rejoué).
-- balanceAfter fige le solde restant du client au moment du remboursement.
ALTER TABLE "Document" ADD COLUMN "repaymentId" TEXT;
ALTER TABLE "Document" ADD COLUMN "balanceAfter" INTEGER;
CREATE UNIQUE INDEX "Document_repaymentId_key" ON "Document"("repaymentId");
