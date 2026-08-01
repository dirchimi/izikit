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
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { slugify, ensureUniqueSlug } from '../slug';
import type { OrgRole } from '../middleware/require-org-role';
import { TRIAL_DAYS } from '@/lib/subscription/plans';

export interface BoutiqueSettingsView {
  currency: string;
  country: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  invoiceNote: string | null;
  logoUrl: string | null;
  businessType: string | null;
  overdueDays: number;
  bigExpenseThreshold: number;
  expiryAlertDays: number;
}

export interface BoutiqueContext {
  organization: { id: string; slug: string; name: string };
  settings: BoutiqueSettingsView;
  role: OrgRole;
}

const SETTINGS_SELECT = {
  currency: true,
  country: true,
  phone: true,
  city: true,
  address: true,
  invoiceNote: true,
  logoUrl: true,
  businessType: true,
  overdueDays: true,
  bigExpenseThreshold: true,
  expiryAlertDays: true,
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
    country: s.country,
    phone: s.phone,
    city: s.city,
    address: s.address,
    invoiceNote: s.invoiceNote,
    logoUrl: s.logoUrl,
    businessType: s.businessType,
    overdueDays: s.overdueDays,
    bigExpenseThreshold: s.bigExpenseThreshold,
    expiryAlertDays: s.expiryAlertDays,
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

/**
 * Dissout la boutique auto-créée VIDE d'un utilisateur qui devient employé
 * d'une AUTRE boutique.
 *
 * Pourquoi : `getPrimaryMembership` sert la boutique POSSÉDÉE en priorité. Un
 * vendeur qui s'est inscrit tout seul (l'inscription crée toujours sa boutique
 * via `ensureBoutique`) PUIS est ajouté par son patron restait enfermé à vie
 * dans sa boutique vide — catalogue vide, ventes synchronisées dans le mauvais
 * tenant, patron qui ne voit jamais rien arriver (vu en prod).
 *
 * Garde-fous : ne supprime QUE si la boutique possédée est un artefact
 * d'inscription — zéro donnée métier (produits, ventes, clients, dépenses,
 * créances, remboursements, documents, mouvements de stock, dettes
 * fournisseurs, paiements d'abonnement), aucune invitation émise, aucun AUTRE
 * membre que le propriétaire. Au moindre signe d'activité on ne touche à rien
 * (l'utilisateur garde ses deux casquettes ; la possédée reste primaire).
 *
 * À appeler dans la MÊME transaction que la création d'adhésion (ajout direct
 * d'un compte existant, ou acceptation d'invitation par lien). La suppression
 * part par cascade (réglages + adhésion OWNER) ; `Invitation` n'a pas de FK
 * mais une invitation émise compte comme activité → jamais de ligne à purger.
 */
export async function dissolveEmptyAutoBoutique(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<boolean> {
  const owned = await tx.organization.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!owned) return false;
  const where = { organizationId: owned.id };

  const [counts, members] = await Promise.all([
    Promise.all([
      tx.product.count({ where }),
      tx.sale.count({ where }),
      tx.customer.count({ where }),
      tx.expense.count({ where }),
      tx.receivable.count({ where }),
      tx.repayment.count({ where }),
      tx.document.count({ where }),
      tx.stockMovement.count({ where }),
      tx.supplierDebt.count({ where }),
      tx.subscriptionPayment.count({ where }),
      tx.invitation.count({ where }),
    ]),
    tx.organizationMember.findMany({ where, select: { userId: true } }),
  ]);

  const hasActivity = counts.some((c) => c > 0);
  const onlyOwner = members.every((m) => m.userId === userId);
  if (hasActivity || !onlyOwner) return false;

  await tx.organization.delete({ where: { id: owned.id } });
  return true;
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

  // L'utilisateur ne POSSÈDE pas de boutique, mais peut être MEMBRE de celle
  // d'un autre (employé invité). Dans ce cas on retourne SA boutique — surtout
  // pas une nouvelle. Sans ce garde, un employé invité se voyait créer une
  // boutique vide au premier chargement (bug d'invitation).
  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      organization: {
        select: { id: true, slug: true, name: true, settings: { select: SETTINGS_SELECT } },
      },
    },
  });
  if (membership) {
    const org = membership.organization;
    const settings =
      org.settings ??
      (await prisma.boutiqueSettings.create({
        data: { organizationId: org.id, currency: 'XAF' },
        select: SETTINGS_SELECT,
      }));
    return {
      organization: { id: org.id, slug: org.slug, name: org.name },
      settings: viewSettings(settings),
      role: membership.role as OrgRole,
    };
  }

  const base = slugify(email.split('@')[0] ?? 'boutique') || 'boutique';
  const name = deriveName(email);
  let created: { id: string; slug: string; name: string } | null = null;

  // Essai gratuit démarré à la création (statut dérivé — voir subscription).
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  await ensureUniqueSlug(base, async (slug) => {
    const org = await prisma.$transaction(async (tx) => {
      const o = await tx.organization.create({
        data: { slug, name, ownerId: userId, trialEndsAt },
      });
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
    settings: {
      currency: 'XAF',
      country: 'TD',
      phone: null,
      city: null,
      address: null,
      invoiceNote: null,
      logoUrl: null,
      businessType: null,
      overdueDays: 30,
      bigExpenseThreshold: 50000,
      expiryAlertDays: 30,
    },
    role: 'OWNER',
  };
}
