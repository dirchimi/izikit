// Police premium embarquée pour les PDF (factures, proformas, reçus, relevés,
// rapports). On remplace la Helvetica standard-14 d'@react-pdf par Inter.
//
// Pourquoi : la Helvetica core d'Adobe ne contient PAS le séparateur de milliers
// que `Intl.NumberFormat('fr-FR')` émet (U+202F, espace fine insécable). Sur un
// gros montant (« 1 000 000 FCFA ») le séparateur tombait en tofu (carré □).
// Inter contient U+202F + U+00A0 + tous les accents FR → plus de tofu, et le
// nombre ne peut pas être coupé en fin de ligne (espace insécable).
//
// @react-pdf sous-ensemble la police aux glyphes réellement utilisés au rendu :
// le PDF final reste léger (~13 Ko) même si le .ttf source fait ~410 Ko.
//
// Runtime nodejs uniquement (fs + process.cwd()). Les .ttf sont copiés dans le
// bundle standalone/Vercel via `outputFileTracingIncludes` (voir next.config.ts).
import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { Font } from '@react-pdf/renderer';

let registered = false;

const REL = ['src', 'lib', 'server', 'documents', 'fonts'];

/**
 * Localise le dossier des polices. Le standalone Next fait `process.chdir` vers
 * la racine du package (cwd = .../frontend) → `cwd/src/...` marche. On teste
 * aussi `cwd/frontend/src/...` au cas où Vercel tracerait depuis la racine du
 * monorepo. On retombe sur la 1re candidate (correcte en dev + Docker).
 */
function fontsDir(): string {
  const candidates = [
    path.join(process.cwd(), ...REL),
    path.join(process.cwd(), 'frontend', ...REL),
  ];
  return candidates.find((d) => fs.existsSync(path.join(d, 'Inter-Regular.ttf'))) ?? candidates[0]!;
}

/** Enregistre Inter (idempotent). À appeler au début de chaque rendu PDF. */
export function registerPdfFonts(): void {
  if (registered) return;
  const dir = fontsDir();
  Font.register({
    family: 'Inter',
    fonts: [
      { src: path.join(dir, 'Inter-Regular.ttf'), fontWeight: 400 },
      { src: path.join(dir, 'Inter-Bold.ttf'), fontWeight: 700 },
    ],
  });
  registered = true;
}
