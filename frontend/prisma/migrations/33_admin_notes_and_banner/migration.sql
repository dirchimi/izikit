-- Notes internes par boutique (mini-CRM) + bannière d'info globale.
--
-- 1) Organization.adminNote : note libre du SUPERADMIN sur un client (contexte,
--    suivi commercial). Jamais visible côté patron/vendeurs.
-- 2) AppBanner : bannière d'information affichée à tous les utilisateurs
--    (maintenance, nouveauté…). Gérée par un SUPERADMIN, un seul enregistrement
--    actif lu par l'app.

ALTER TABLE "Organization" ADD COLUMN "adminNote" TEXT;

CREATE TABLE "AppBanner" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppBanner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppBanner_active_idx" ON "AppBanner"("active");
