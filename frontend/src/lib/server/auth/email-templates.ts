// Source: RESEARCH.md Pattern 19 — D-15/D-16 email template factories.
// English by default (per D-15) — fork-edit to localize.
// Plain HTML (per D-16) — no MJML / React Email; per-project may swap.
//
// Phase 5's email-queue cron consumes outbox `email.*` events and calls these
// factories to produce the EmailJob row. Phase 1 just defines the factories
// and emits the outbox events.
//
// WR-03 — Defense-in-depth: ALL interpolated values in HTML strings MUST
// flow through `htmlEscape()`. The verification code is currently constrained
// to `[A-Z2-9]{8}` upstream (VERIFICATION_CODE_REGEX), so XSS is impossible
// today. But the function signature accepts `string` and future templates
// (e.g. password-changed notifications including the user's display name)
// will reuse this pattern — escape at the source so a careless add can't
// inject HTML. Plain-text body has no HTML interpretation, so no escape
// needed there.
//
// O1 audit fix — `expiresAt` is now threaded from the outbox payload so the
// rendered TTL matches `AUTH_VERIFICATION_TTL_MIN` (was hardcoded "15 minutes"
// which lied when operators tuned the env var).
import 'server-only';

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface VerificationEmailArgs {
  code: string;
  email: string;
  /** Optional ISO-8601 expiry; falls back to "soon" wording when omitted. */
  expiresAt?: string;
}

export interface ResetPasswordEmailArgs {
  code: string;
  email: string;
  /** Optional ISO-8601 expiry; falls back to "soon" wording when omitted. */
  expiresAt?: string;
}

/**
 * Minimal HTML escape for template interpolation. Covers the OWASP-recommended
 * five-character set (`& < > " '`). Apply to EVERY user-controlled (or
 * potentially user-controlled) value before interpolating into an HTML
 * template string.
 */
function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the TTL window as "in N minutes" / "in N hours" — rounds to the
 * unit the user would actually read. Falls back to a vague "soon" when no
 * timestamp is provided or the parse fails (defensive: a malformed payload
 * should never break email rendering).
 *
 * Bias rounding toward the FLOOR so we never overstate the TTL: telling a
 * user "in 15 minutes" when 14m59s remain (and the code is about to expire)
 * leads to a frustrating retry loop. Floor it to "in 14 minutes" — they may
 * be earlier than promised, never later.
 */
function ttlWording(expiresAtIso: string | undefined): string {
  if (!expiresAtIso) return 'bientôt';
  const expiresMs = Date.parse(expiresAtIso);
  if (Number.isNaN(expiresMs)) return 'bientôt';
  const remainingMs = expiresMs - Date.now();
  if (remainingMs <= 0) return 'bientôt'; // expired by the time we render; pre-cron drift
  const minutes = Math.floor(remainingMs / 60_000);
  if (minutes < 1) return "dans moins d'une minute";
  if (minutes < 60) return `dans ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  return `dans ${hours} heure${hours === 1 ? '' : 's'}`;
}

/**
 * Coque HTML brandée Sahilley — volontairement SOBRE (anti-spam) : pas d'image
 * externe, CSS inline minimal, table-based (compatibilité clients mail), un
 * seul accent vert, et un fort équilibre texte/HTML. `intro`, `lead` et `outro`
 * doivent être déjà sûrs (texte fixe). Seul `code` est interpolé (déjà échappé).
 */
function brandedHtml(opts: { heading: string; lead: string; code: string; ttl: string }): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#faf8f3;font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f3;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e4e0d6;border-radius:16px;overflow:hidden;">
<tr><td style="background:#0a3d2e;padding:18px 24px;">
<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">Sahilley</span>
</td></tr>
<tr><td style="padding:28px 24px 8px 24px;">
<h1 style="margin:0 0 8px 0;font-size:19px;font-weight:700;color:#1a1a1a;">${opts.heading}</h1>
<p style="margin:0;font-size:14px;line-height:1.6;color:#5b5648;">${opts.lead}</p>
</td></tr>
<tr><td style="padding:16px 24px;">
<div style="background:#f0ede4;border:1px solid #e4e0d6;border-radius:12px;padding:18px;text-align:center;">
<div style="font-size:30px;font-weight:700;letter-spacing:6px;color:#0e9f6e;">${opts.code}</div>
</div>
<p style="margin:12px 0 0 0;font-size:13px;color:#7a7468;text-align:center;">Ce code expire ${opts.ttl}.</p>
</td></tr>
<tr><td style="padding:8px 24px 24px 24px;">
<p style="margin:0;font-size:12px;line-height:1.6;color:#9a9486;">Si tu n'es pas à l'origine de cette demande, ignore simplement cet email.</p>
</td></tr>
<tr><td style="background:#faf8f3;border-top:1px solid #e4e0d6;padding:14px 24px;">
<p style="margin:0;font-size:11px;color:#9a9486;">Sahilley — Gestion de boutique.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export function verificationEmail(args: VerificationEmailArgs): EmailTemplate {
  const code = htmlEscape(args.code);
  const ttl = ttlWording(args.expiresAt);
  return {
    subject: 'Votre code de vérification Sahilley',
    html: brandedHtml({
      heading: 'Confirme ton adresse email',
      lead: 'Saisis ce code pour activer ton compte Sahilley.',
      code,
      ttl,
    }),
    text: `Sahilley — Confirme ton adresse email.\n\nTon code de vérification est ${args.code}. Il expire ${ttl}.\n\nSi tu n'es pas à l'origine de cette demande, ignore cet email.`,
  };
}

export function resetPasswordEmail(args: ResetPasswordEmailArgs): EmailTemplate {
  const code = htmlEscape(args.code);
  const ttl = ttlWording(args.expiresAt);
  return {
    subject: 'Réinitialisation de votre mot de passe',
    html: brandedHtml({
      heading: 'Réinitialise ton mot de passe',
      lead: 'Saisis ce code pour choisir un nouveau mot de passe.',
      code,
      ttl,
    }),
    text: `Sahilley — Réinitialise ton mot de passe.\n\nTon code de réinitialisation est ${args.code}. Il expire ${ttl}.\n\nSi tu n'es pas à l'origine de cette demande, ignore cet email.`,
  };
}
