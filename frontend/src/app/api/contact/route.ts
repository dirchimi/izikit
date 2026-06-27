// POST /api/contact — formulaire de contact public (landing).
//
// Envoie un e-mail à l'adresse de contact via le pipeline e-mail existant
// (EmailQueue -> Resend), drainé immédiatement après la réponse. Public (pas
// de session) → protégé par un rate-limit par e-mail + un honeypot anti-bot.
// Si l'e-mail n'est pas configuré (pas de Resend/Upstash en local), on renvoie
// quand même 200 et on journalise — le message est best-effort.
export const runtime = 'nodejs';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { zEmail } from '@/lib/server/zod-helpers';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { getEmailQueue } from '@/lib/server/queues/email-queue-singleton';
import { flushEmailsAfterResponse } from '@/lib/server/email/flush-after-response';

// Boîte de réception des messages de contact.
const CONTACT_INBOX = 'info.sahilley@gmail.com';

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: zEmail,
  subject: z.string().trim().max(160).optional(),
  message: z.string().trim().min(5).max(5000),
  // Honeypot : doit rester vide (les bots le remplissent).
  company: z.string().max(0).optional(),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'contact:form',
  windowMs: 60 * 60 * 1000, // 1 h
  max: Number(process.env.CONTACT_RATE_LIMIT_MAX ?? 5),
  code: 'TOO_MANY_CONTACT_ATTEMPTS',
  message: 'Trop de messages envoyés. Réessayez plus tard.',
});

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatIssues(err: z.ZodError) {
  return err.issues.map((e) => ({ path: e.path.join('.'), message: e.message }));
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      const res = NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: formatIssues(parsed.error) },
        { status: 400 },
      );
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }
    const { name, email, subject, message, company } = parsed.data;

    // Honeypot rempli → on fait semblant d'accepter (ne pas renseigner le bot).
    if (company) {
      log.info('contact: honeypot triggered, dropping');
      const res = NextResponse.json({ ok: true });
      res.headers.set('x-request-id', ctx.requestId);
      return res;
    }

    const rateFail = await limiter.check(req, email);
    if (rateFail) return rateFail;

    const subjectLine = subject?.trim()
      ? `Contact Sahilley — ${subject.trim()}`
      : `Contact Sahilley — ${name}`;

    const html = `
      <div style="font-family:sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6">
        <h2 style="margin:0 0 12px">Nouveau message de contact</h2>
        <p><strong>Nom :</strong> ${esc(name)}</p>
        <p><strong>E-mail :</strong> ${esc(email)}</p>
        ${subject?.trim() ? `<p><strong>Sujet :</strong> ${esc(subject.trim())}</p>` : ''}
        <p><strong>Message :</strong></p>
        <p style="white-space:pre-wrap;border-left:3px solid #0e9f6e;padding-left:12px">${esc(message)}</p>
      </div>
    `;
    const text = `Nouveau message de contact\n\nNom: ${name}\nE-mail: ${email}${
      subject?.trim() ? `\nSujet: ${subject.trim()}` : ''
    }\n\n${message}`;

    const queue = getEmailQueue();
    if (queue) {
      await queue.enqueue({ to: CONTACT_INBOX, subject: subjectLine, html, text });
      flushEmailsAfterResponse();
      log.info('contact: message queued', { from: email });
    } else {
      // E-mail non configuré (local) — on journalise le message pour ne pas le perdre.
      log.warn('contact: email not configured, message logged only', {
        from: email,
        name,
        subject: subject ?? '',
      });
    }

    const res = NextResponse.json({ ok: true });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
  });
}
