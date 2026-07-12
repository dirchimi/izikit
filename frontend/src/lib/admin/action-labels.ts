// Libellés français des actions du journal d'audit (codes `action` posés par
// `logAdminAction`). Partagé par le tableau de bord et la page Journal d'audit
// pour éviter la dérive. Un code inconnu retombe sur le code brut.

export const ACTION_LABELS: Record<string, string> = {
  'user.role_change': 'Changement de rôle',
  'user.suspend': 'Compte suspendu',
  'user.restore': 'Compte réactivé',
  'user.delete': 'Compte supprimé',
  'boutique.mark_internal': 'Boutique marquée interne',
  'boutique.unmark_internal': 'Marquage interne retiré',
  'boutique.wipe_data': 'Données de boutique vidées',
  'boutique.delete': 'Boutique supprimée',
  'boutique.grant_access': 'Accès prolongé',
  'boutique.remind': 'Relance envoyée',
  'boutique.note': 'Note interne modifiée',
  'subscription.confirm': 'Paiement validé',
  'subscription.reject': 'Paiement refusé',
  'discount.create': 'Code promo créé',
  'discount.activate': 'Code promo activé',
  'discount.deactivate': 'Code promo désactivé',
  'announcement.send': 'Annonce envoyée',
  'banner.set': 'Bannière mise à jour',
  'withdrawal.cancel': 'Annulation retrait',
  BOOTSTRAP_SUPERADMIN: 'Promotion super-admin',
};

export function labelForAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
