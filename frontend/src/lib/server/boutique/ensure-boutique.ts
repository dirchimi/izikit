/**
 * Onboarding boutique — Phase 1 (fondation tenancy).
 *
 * Modèle v1 : « ma boutique » = l'`Organization` que l'utilisateur possède
 * (`ownerId = userId`). `ensureBoutique` est idempotent : il retourne la
 * boutique existante, ou la crée (org + membre OWNER + BoutiqueSettings XAF)
 * dans une transaction au tout premier appel.
 *
 * Appelé par `GET /api/org/current`, donc déclenché aussi bien sur le chemin
 * email/mot de passe (après /verify-email) que sur l'OAuth — sans toucher aux
 * routes d'auth protégées.
 *
 * Limite connue v1 : deux requêtes simultanées au tout premier accès
 * pourraient théoriquement créer deux boutiques (pas de verrou). Acceptable
 * au premier login ; à durcir (advisory-lock) si le besoin se confirme.
 */
import 'server-only';
import { prisma } from '../prisma';
import { slugify, ensureUniqueSlug } from '../slug';
import type { OrgRole } from '../middleware/require-org-role';

export interface BoutiqueSettingsView {
  currency: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  invoiceNote: string | null;
}

export interface BoutiqueContext {
  organization: { id: string; slug: string; name: string };
  settings: BoutiqueSettingsView;
  role: OrgRole;
}

const SETTINGS_SELECT = {
  currency: true,
  phone: true,
  city: true,
  address: true,
  invoiceNote: true,
} as const;

/** Nom de boutique par défaut dérivé de l'email (partie locale capitalisée). */
function deriveName(email: string): string {
  const local = email.split('@')[0] ?? '';
  const capitalized = local.charAt(0).toUpperCase() + local.slice(1);
  return capitalized || 'Boutique';
}

function viewSettings(s: BoutiqueSettingsView): BoutiqueSettingsView {
  return {
    currency: s.currency,
    phone: s.phone,
    city: s.city,
    address: s.address,
    invoiceNote: s.invoiceNote,
  };
}

/**
 * Adhésion principale du user pour le gating des routes métier :
 * l'org possédée (rôle OWNER) en priorité, sinon la 1re adhésion.
 */
export async function getPrimaryMembership(
  userId: string,
): Promise<{ organizationId: string; role: OrgRole } | null> {
  const owned = await prisma.organization.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (owned) return { organizationId: owned.id, role: 'OWNER' };

  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true, role: true },
  });
  return membership
    ? { organizationId: membership.organizationId, role: membership.role as OrgRole }
    : null;
}

export async function ensureBoutique(userId: string, email: string): Promise<BoutiqueContext> {
  const existing = await prisma.organization.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, slug: true, name: true, settings: { select: SETTINGS_SELECT } },
  });

  if (existing) {
    const settings =
      existing.settings ??
      (await prisma.boutiqueSettings.create({
        data: { organizationId: existing.id, currency: 'XAF' },
        select: SETTINGS_SELECT,
      }));
    return {
      organization: { id: existing.id, slug: existing.slug, name: existing.name },
      settings: viewSettings(settings),
      role: 'OWNER',
    };
  }

  const base = slugify(email.split('@')[0] ?? 'boutique') || 'boutique';
  const name = deriveName(email);
  let created: { id: string; slug: string; name: string } | null = null;

  await ensureUniqueSlug(base, async (slug) => {
    const org = await prisma.$transaction(async (tx) => {
      const o = await tx.organization.create({ data: { slug, name, ownerId: userId } });
      await tx.organizationMember.create({
        data: { organizationId: o.id, userId, role: 'OWNER' },
      });
      await tx.boutiqueSettings.create({ data: { organizationId: o.id, currency: 'XAF' } });
      return o;
    });
    created = { id: org.id, slug: org.slug, name: org.name };
    return org;
  });

  if (!created) {
    throw new Error('ensureBoutique: la création de la boutique a échoué');
  }

  return {
    organization: created,
    settings: { currency: 'XAF', phone: null, city: null, address: null, invoiceNote: null },
    role: 'OWNER',
  };
}
