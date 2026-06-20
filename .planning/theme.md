# Thème — Mode clair / sombre

Rend le bouton **Clair / Sombre** de la TopBar fonctionnel. Clair par défaut. Le choix persiste
(cookie `app-theme`) et s'applique au SSR → pas de flash clair→sombre à l'hydratation.

## Architecture

- **`lib/theme/config.ts`** — `Theme = light|dark`, `DEFAULT_THEME = light`, cookie `app-theme`, `normalizeTheme()`.
- **`lib/theme/server.ts`** — `getServerTheme()` (lecture cookie via `next/headers`, `server-only`).
- **`contexts/ThemeContext.tsx`** — `ThemeProvider(initialTheme)` + `useTheme()`. `setTheme` écrit le cookie et
  bascule la classe `dark` sur `<html>` **directement** (pur CSS → instantané, pas de `router.refresh()`).
- **`components/boutique/ThemeToggle.tsx`** — deux segments Soleil/Lune (comme le switcher de langue),
  segment actif mis en avant. Présent dans la TopBar par défaut (dashboard), `ScreenTopActions`
  (tous les écrans métier), le **header de la landing** et le **ThemeShell d'auth** (à côté du switcher de langue).
- **`app/layout.tsx`** — lit le thème serveur, ajoute la classe `dark` sur `<html>` au SSR, enveloppe `ThemeProvider`.
- **`app/globals.css`** — `html.dark { … }` surcharge les tokens `--color-*`. Comme tout le design system passe
  par des variables CSS (`bg-background`, `text-foreground`, `bg-surface`…), **aucun composant n'a de variante
  `dark:`** : la bascule d'une seule classe suffit. `color-scheme: dark` est posé pour les contrôles natifs.

## Palette sombre

Dérivée des tons Banani (crème/vert) en version sombre et chaude : fonds `#14120d` / surfaces `#1b1812`,
texte `#f1eee6`, primaire vert ravivé `#13b886`, badges paiement inversés (fond sombre + texte clair).
La sidebar (déjà vert foncé en clair) est conservée. Modifier les valeurs dans `globals.css` → `html.dark`.

## Ajouter une couleur

1. Déclarer le token clair dans `@theme` (`--color-xxx`).
2. Déclarer sa version sombre dans `html.dark { --color-xxx: … }`.
3. Consommer via l'utilitaire Tailwind (`bg-xxx`, `text-xxx`) — la bascule est automatique.

## Sections « toujours sombres »

Le footer de la landing était un `bg-foreground` (astuce « section sombre » en mode clair) qui **s'inversait**
en mode nuit. Il a été reskinné sur la **famille de tokens `sidebar`** (`bg-sidebar`, `text-sidebar-foreground`,
`border-sidebar-muted`…), qui est volontairement sombre dans les **deux** thèmes → footer vert foncé stable et
cohérent avec la sidebar. Règle générale : pour une section devant rester sombre quel que soit le thème, utiliser
la palette `sidebar` plutôt que `foreground`/`background` (qui s'inversent).

## Suite possible

- Option « système » (suivre `prefers-color-scheme`) en 3ᵉ état du toggle.
