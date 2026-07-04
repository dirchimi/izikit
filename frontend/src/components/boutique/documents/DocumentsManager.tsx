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
import PdfPreviewModal from './PdfPreviewModal';
import { fetchPdfBlob, sharePdfViaWhatsapp } from '@/lib/boutique/pdfShare';
import type { ApiDocument, UiDocStatus } from './types';

interface OrgCurrent {
  organization: { name: string };
  settings: { city: string | null; logoUrl: string | null };
}

type Tab = 'factures' | 'proformas' | 'recus';
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
  const [pdfDoc, setPdfDoc] = useState<ApiDocument | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const { data, loading, error, refresh } = useApi<{ documents: ApiDocument[] }>('/api/documents');
  const { data: orgData } = useApi<OrgCurrent>('/api/org/current');
  const documents = data?.documents ?? [];

  const org = {
    name: orgData?.organization.name ?? 'Boutique',
    city: orgData?.settings.city ?? 'N’Djamena, Tchad',
    logoUrl: orgData?.settings.logoUrl ?? null,
  };

  const factures = documents.filter((d) => d.type === 'FACTURE');
  const proformas = documents.filter((d) => d.type === 'PROFORMA');
  const recus = documents.filter((d) => d.type === 'RECU');
  const docs = tab === 'factures' ? factures : tab === 'proformas' ? proformas : recus;
  const listIcon = tab === 'factures' ? 'file-text' : tab === 'recus' ? 'receipt' : 'file';
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

  function docKind(doc: ApiDocument): string {
    const key =
      doc.type === 'FACTURE'
        ? 'documents.kind.facture'
        : doc.type === 'RECU'
          ? 'documents.kind.recu'
          : 'documents.kind.proforma';
    return t(key);
  }

  function docShareText(doc: ApiDocument): string {
    const amountLabel = doc.type === 'RECU' ? t('documents.recu.received') : t('common.total');
    return `${org.name} — ${docKind(doc)} ${doc.number}\n${amountLabel}: ${formatFCFA(doc.total)} ${t('common.fcfa')}`;
  }

  function docTitle(doc: ApiDocument): string {
    return `${docKind(doc)} ${doc.number}`;
  }

  // Partage direct : récupère le PDF puis le partage (natif sur mobile avec le
  // fichier joint, wa.me/<numéro> pré-rempli sinon). Plus de window.open du PDF.
  async function shareWhatsapp(doc: ApiDocument) {
    if (sharingId) return;
    setSharingId(doc.id);
    try {
      const blob = await fetchPdfBlob(`/api/documents/${doc.id}/pdf`);
      await sharePdfViaWhatsapp({
        blob,
        fileName: `${doc.number}.pdf`,
        title: docTitle(doc),
        text: docShareText(doc),
        phone: doc.clientPhone,
      });
    } catch {
      toast(t('documents.pdfError'), 'error');
    } finally {
      setSharingId(null);
    }
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
            <button
              type="button"
              onClick={() => switchTab('recus')}
              className={`font-body flex-1 py-3 text-sm ${
                tab === 'recus'
                  ? 'text-primary border-primary border-b-2 font-semibold'
                  : 'text-muted-foreground'
              }`}
            >
              {t('documents.tab.recus')}
            </button>
          </div>

          {/* Action création — les reçus sont générés automatiquement au remboursement. */}
          <div className="border-border border-b px-4 py-3">
            {tab === 'recus' ? (
              <p className="text-muted-foreground font-body flex items-center gap-2 text-xs">
                <Icon i="info" size={14} className="shrink-0" />
                {t('documents.recu.autoHint')}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="bg-primary text-primary-foreground font-body flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold"
              >
                <Icon i="plus" size={15} />
                {t(tab === 'factures' ? 'documents.invoiceFromSale' : 'documents.newProforma')}
              </button>
            )}
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
              tab === 'factures'
                ? 'documents.emptyFactures'
                : tab === 'recus'
                  ? 'documents.emptyRecus'
                  : 'documents.emptyProformas',
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
          <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-6 md:px-8">
            {/* En-tête de l'aperçu */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-headings text-foreground text-lg font-bold">
                  {docKind(selected)} {selected.number}
                </h2>
                <p className="text-muted-foreground font-body mt-0.5 text-xs">
                  {fmtShort(selected.issuedAt)} · {selected.clientName}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => shareWhatsapp(selected)}
                  disabled={sharingId === selected.id}
                  className="border-border bg-surface text-foreground font-body flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  <Icon
                    i={sharingId === selected.id ? 'loader-2' : 'share-2'}
                    size={14}
                    className={sharingId === selected.id ? 'animate-spin' : ''}
                  />
                  {t('documents.shareWhatsapp')}
                </button>
                <button
                  type="button"
                  onClick={() => setPdfDoc(selected)}
                  className="bg-primary text-primary-foreground font-body flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold"
                >
                  <Icon i="file-text" size={14} />
                  {t('documents.viewPdf')}
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

      <PdfPreviewModal
        open={pdfDoc !== null}
        path={pdfDoc ? `/api/documents/${pdfDoc.id}/pdf` : null}
        fileName={pdfDoc ? `${pdfDoc.number}.pdf` : ''}
        title={pdfDoc ? docTitle(pdfDoc) : ''}
        shareText={pdfDoc ? docShareText(pdfDoc) : ''}
        phone={pdfDoc?.clientPhone ?? null}
        onClose={() => setPdfDoc(null)}
      />
    </>
  );
}
