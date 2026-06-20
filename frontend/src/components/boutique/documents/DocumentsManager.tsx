'use client';

import { useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import AsyncState from '@/components/boutique/AsyncState';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import { useApi } from '@/lib/useApi';
import { api, ApiError } from '@/lib/api';
import { formatFCFA } from '@/lib/boutique/format';
import { docStatusConfig } from '@/lib/boutique/fixtures';
import DocumentPreview from './DocumentPreview';
import GenerateInvoicePanel from './GenerateInvoicePanel';
import NewProformaForm, { type ProformaPayload } from './NewProformaForm';
import type { ApiDocument, UiDocStatus } from './types';

interface OrgCurrent {
  organization: { name: string };
  settings: { city: string | null };
}

type Tab = 'factures' | 'proformas';
type StatusFilter = UiDocStatus | 'all';

function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function DocumentsManager() {
  const { toast } = useToast();
  const t = useT();
  const [tab, setTab] = useState<Tab>('factures');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, loading, error, refresh } = useApi<{ documents: ApiDocument[] }>('/api/documents');
  const { data: orgData } = useApi<OrgCurrent>('/api/org/current');
  const documents = data?.documents ?? [];

  const org = {
    name: orgData?.organization.name ?? 'Boutique',
    city: orgData?.settings.city ?? 'N’Djamena, Tchad',
  };

  const factures = documents.filter((d) => d.type === 'FACTURE');
  const proformas = documents.filter((d) => d.type === 'PROFORMA');
  const docs = tab === 'factures' ? factures : proformas;
  const listIcon = tab === 'factures' ? 'file-text' : 'file';
  const invoicedSaleIds = useMemo(
    () => new Set(factures.map((d) => d.saleId).filter((x): x is string => x !== null)),
    [factures],
  );

  const statusChips = useMemo<StatusFilter[]>(() => {
    const present = Array.from(new Set(docs.map((d) => d.status)));
    return ['all', ...present];
  }, [docs]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter(
      (d) =>
        (q === '' ||
          d.clientName.toLowerCase().includes(q) ||
          d.number.toLowerCase().includes(q)) &&
        (statusFilter === 'all' || d.status === statusFilter),
    );
  }, [docs, search, statusFilter]);

  const selected = docs.find((d) => d.id === selectedId) ?? docs[0] ?? null;

  function switchTab(next: Tab) {
    setTab(next);
    setSearch('');
    setStatusFilter('all');
    setSelectedId(null);
  }

  const chipLabel = (f: StatusFilter) => (f === 'all' ? t('common.all') : t(`doc.status.${f}`));

  async function generateInvoice(saleId: string): Promise<boolean> {
    try {
      const { document } = await api<{ document: ApiDocument }>('/api/documents', {
        method: 'POST',
        body: { type: 'FACTURE', saleId },
      });
      toast(t('documents.invoiceCreated', { num: document.number }), 'success');
      await refresh();
      setSelectedId(document.id);
      return true;
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'DOC_EXISTS') toast(t('documents.alreadyInvoiced'), 'info');
      else toast(t('async.error'), 'error');
      return false;
    }
  }

  async function createProforma(payload: ProformaPayload): Promise<boolean> {
    try {
      const { document } = await api<{ document: ApiDocument }>('/api/documents', {
        method: 'POST',
        body: { type: 'PROFORMA', ...payload },
      });
      toast(t('documents.proformaCreated', { num: document.number }), 'success');
      await refresh();
      setTab('proformas');
      setSelectedId(document.id);
      return true;
    } catch {
      toast(t('async.error'), 'error');
      return false;
    }
  }

  function downloadPdf(doc: ApiDocument) {
    window.open(`/api/documents/${doc.id}/pdf`, '_blank', 'noopener,noreferrer');
  }

  function shareWhatsapp(doc: ApiDocument) {
    const digits = doc.clientPhone.replace(/\D/g, '');
    const kindLabel = t(
      doc.type === 'FACTURE' ? 'documents.kind.facture' : 'documents.kind.proforma',
    );
    const text = `${org.name} — ${kindLabel} ${doc.number}\n${t('common.total')}: ${formatFCFA(doc.total)} ${t('common.fcfa')}`;
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <>
      <TopBar
        title={t('nav.documents')}
        subtitle={t('documents.subtitle')}
        actions={<ScreenTopActions />}
      />

      <div className="flex flex-col lg:flex-row">
        {/* Liste des documents */}
        <div className="border-border flex flex-col border-b lg:w-[400px] lg:border-e lg:border-b-0">
          {/* Onglets */}
          <div className="border-border flex border-b">
            <button
              type="button"
              onClick={() => switchTab('factures')}
              className={`font-body flex-1 py-3 text-sm ${
                tab === 'factures'
                  ? 'text-primary border-primary border-b-2 font-semibold'
                  : 'text-muted-foreground'
              }`}
            >
              {t('documents.tab.factures')}
            </button>
            <button
              type="button"
              onClick={() => switchTab('proformas')}
              className={`font-body flex-1 py-3 text-sm ${
                tab === 'proformas'
                  ? 'text-primary border-primary border-b-2 font-semibold'
                  : 'text-muted-foreground'
              }`}
            >
              {t('documents.tab.proformas')}
            </button>
          </div>

          {/* Action création */}
          <div className="border-border border-b px-4 py-3">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="bg-primary text-primary-foreground font-body flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold"
            >
              <Icon i="plus" size={15} />
              {t(tab === 'factures' ? 'documents.invoiceFromSale' : 'documents.newProforma')}
            </button>
          </div>

          {/* Recherche + filtres */}
          <div className="border-border flex flex-col gap-2 border-b px-4 py-3">
            <div className="border-border bg-input flex items-center gap-2 rounded-md border px-3 py-2">
              <Icon i="search" size={14} className="text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('common.search.document')}
                className="font-body text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {statusChips.map((f) => {
                const active = statusFilter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    className={`font-body rounded-md border px-3 py-1.5 text-xs ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary font-semibold'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {chipLabel(f)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Liste */}
          <AsyncState
            loading={loading}
            error={error}
            onRetry={refresh}
            isEmpty={docs.length === 0}
            emptyLabel={t(
              tab === 'factures' ? 'documents.emptyFactures' : 'documents.emptyProformas',
            )}
            emptyIcon={listIcon}
          >
            <div className="flex flex-col">
              {visible.map((d) => {
                const active = d.id === (selected?.id ?? '');
                const s = docStatusConfig[d.status];
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className={`border-border flex items-center gap-3 border-b px-4 py-4 text-start ${
                      active ? 'bg-secondary' : 'hover:bg-input'
                    }`}
                  >
                    <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                      <Icon i={listIcon} size={14} className="text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground font-mono text-xs">{d.number}</span>
                        <span
                          className={`font-body shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${s.cls}`}
                        >
                          {t(`doc.status.${d.status}`)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={`font-body truncate text-sm font-semibold ${
                            active ? 'text-secondary-foreground' : 'text-foreground'
                          }`}
                        >
                          {d.clientName}
                        </span>
                        <span className="font-body text-foreground shrink-0 text-sm font-bold">
                          {formatFCFA(d.total)} {t('common.fcfa')}
                        </span>
                      </div>
                      <span className="text-muted-foreground font-body text-xs">
                        {fmtShort(d.issuedAt)}
                      </span>
                    </div>
                  </button>
                );
              })}

              {visible.length === 0 && (
                <div className="text-muted-foreground font-body px-4 py-6 text-sm">
                  {t('documents.empty')}
                </div>
              )}
            </div>
          </AsyncState>
        </div>

        {/* Aperçu du document */}
        {selected && (
          <div className="flex flex-1 flex-col gap-5 px-4 py-6 md:px-8">
            {/* En-tête de l'aperçu */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-headings text-foreground text-lg font-bold">
                  {t(
                    selected.type === 'FACTURE'
                      ? 'documents.kind.facture'
                      : 'documents.kind.proforma',
                  )}{' '}
                  {selected.number}
                </h2>
                <p className="text-muted-foreground font-body mt-0.5 text-xs">
                  {fmtShort(selected.issuedAt)} · {selected.clientName}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => shareWhatsapp(selected)}
                  className="border-border bg-surface text-foreground font-body flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold"
                >
                  <Icon i="share-2" size={14} />
                  {t('documents.shareWhatsapp')}
                </button>
                <button
                  type="button"
                  onClick={() => downloadPdf(selected)}
                  className="bg-primary text-primary-foreground font-body flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold"
                >
                  <Icon i="printer" size={14} />
                  {t('documents.downloadPdf')}
                </button>
              </div>
            </div>

            <DocumentPreview doc={selected} org={org} />
          </div>
        )}
      </div>

      {creating && tab === 'factures' && (
        <GenerateInvoicePanel
          invoicedSaleIds={invoicedSaleIds}
          onClose={() => setCreating(false)}
          onGenerate={generateInvoice}
        />
      )}
      {creating && tab === 'proformas' && (
        <NewProformaForm onClose={() => setCreating(false)} onCreate={createProforma} />
      )}
    </>
  );
}
