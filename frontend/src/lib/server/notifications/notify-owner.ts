/**
 * notifyOwner — envoie une notification au PROPRIÉTAIRE d'une boutique.
 *
 * Le destinataire est `Organization.ownerId`. La livraison respecte les
 * préférences du destinataire : le canal in-app de chaque type est désactivable
 * (`NotificationPreferences`, opt-out — type absent = activé). Tout passe par
 * `createNotification`, donc l'anti-doublon (`dedupeKey @unique`) s'applique.
 *
 * Renvoie la Notification créée, ou `null` si : pas de propriétaire résolvable,
 * type désactivé par l'utilisateur, ou doublon dédupliqué.
 */
import 'server-only';
import type { PrismaClient, Notification, Prisma } from '@prisma/client';
import { createNotification } from './index';
import { isChannelEnabled, type NotificationPrefs } from './prefs-merge';
import type { OwnerNotification } from './templates';

function readPrefs(raw: Prisma.JsonValue | undefined | null): NotificationPrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as NotificationPrefs;
}

/** Identifiant du propriétaire de la boutique, ou null si introuvable. */
export async function resolveOwnerId(
  prisma: PrismaClient,
  organizationId: string,
): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { ownerId: true },
  });
  return org?.ownerId ?? null;
}

/** Notifie un utilisateur précis en respectant ses préférences in-app par type. */
export async function notifyUser(
  prisma: PrismaClient,
  userId: string,
  input: OwnerNotification,
): Promise<Notification | null> {
  const row = await prisma.notificationPreferences.findUnique({
    where: { userId },
    select: { prefs: true },
  });
  if (!isChannelEnabled(readPrefs(row?.prefs), input.type, 'inApp')) return null;
  return createNotification(prisma, { ...input, userId });
}

/** Notifie le propriétaire de la boutique (résolution + préférences). */
export async function notifyOwner(
  prisma: PrismaClient,
  organizationId: string,
  input: OwnerNotification,
): Promise<Notification | null> {
  const ownerId = await resolveOwnerId(prisma, organizationId);
  if (!ownerId) return null;
  return notifyUser(prisma, ownerId, input);
}
