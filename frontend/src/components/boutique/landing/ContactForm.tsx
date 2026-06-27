'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import { useT } from '@/contexts/LocaleContext';

const labelClass = 'text-foreground font-body text-xs font-semibold';
const fieldClass =
  'border-border bg-input text-foreground font-body placeholder:text-muted-foreground focus:border-primary rounded-md border px-3 py-2.5 text-sm outline-none disabled:opacity-60';

export default function ContactForm() {
  const t = useT();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '', company: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('failed');
      setStatus('success');
      setForm({ name: '', email: '', subject: '', message: '', company: '' });
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="border-primary/40 bg-secondary text-secondary-foreground flex items-center gap-3 rounded-xl border px-5 py-6">
        <Icon i="circle-check" size={22} className="text-primary shrink-0" />
        <p className="font-body text-sm font-semibold">{t('contact.form.success')}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-surface border-border flex flex-col gap-4 rounded-xl border px-5 py-6 shadow-sm md:px-6"
    >
      <h2 className="font-headings text-foreground text-lg font-bold">{t('contact.form.title')}</h2>

      {/* Honeypot anti-bot (masqué) */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={form.company}
        onChange={(e) => setForm({ ...form, company: e.target.value })}
        className="hidden"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="ct-name">
            {t('contact.form.name')}
          </label>
          <input
            id="ct-name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass} htmlFor="ct-email">
            {t('contact.form.email')}
          </label>
          <input
            id="ct-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="ct-subject">
          {t('contact.form.subject')}
        </label>
        <input
          id="ct-subject"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          className={fieldClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass} htmlFor="ct-message">
          {t('contact.form.message')}
        </label>
        <textarea
          id="ct-message"
          required
          rows={5}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          className={`${fieldClass} resize-none`}
        />
      </div>

      {status === 'error' && (
        <p className="text-danger font-body text-sm">{t('contact.form.error')}</p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="bg-primary text-primary-foreground font-body flex items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-bold transition hover:opacity-90 disabled:opacity-60"
      >
        <Icon i="send" size={15} />
        {status === 'sending' ? t('contact.form.sending') : t('contact.form.send')}
      </button>
    </form>
  );
}
