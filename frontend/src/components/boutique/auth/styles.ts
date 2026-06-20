// Classes Tailwind partagées par les formulaires d'auth (Connexion / Inscription
// / Vérification) pour garder un rendu cohérent sans dupliquer les chaînes.

export const authFieldWrap =
  'border-border bg-input focus-within:border-primary flex items-center gap-2 rounded-md border px-3 py-2.5';

export const authInput =
  'font-body text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none';

export const authLabel = 'text-foreground font-body text-xs font-semibold';

export const authSubmit =
  'bg-primary text-primary-foreground font-body mt-1 w-full rounded-md py-3 text-sm font-bold disabled:opacity-50';

export const authDivider = 'text-muted-foreground font-body flex items-center gap-3 text-xs';
