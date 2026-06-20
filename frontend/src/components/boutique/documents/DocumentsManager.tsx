'use client';

import { useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import TopBar from '@/components/boutique/TopBar';
import ScreenTopActions from '@/components/boutique/ScreenTopActions';
import { useToast } from '@/contexts/ToastContext';
import { useT } from '@/contexts/LocaleContext';
import { formatFCFA } from '@/lib/boutique/format';
import {
  factures,
  proformas,
  docStatusConfig,
  docTotal,
  type DocStatus,
} from '@/lib/boutique/fixtures';
import DocumentPreview from './DocumentPreview';

type Tab = 'factures' | 'proformas';
type StatusFilter = DocStatus | 'all';

export default function DocumentsManager() {
  const { toast } = useToast();
  const t = useT();
  const [tab, setTab] = useState<Tab>('factures');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedNum, setSelectedNum] = useState<string>(factures[0]?.num ?? '');

  const docs = tab === 'factures' ? factures : proformas;
  const kind = tab === 'factures' ? 'facture' : 'proforma';
  const listIcon = tab === 'factures' ? 'file-text' : 'file';

  const statusChips = useMemo<StatusFilter[]>(() => {
    const present = Array.from(new Set(docs.map((d) => d.status)));
    return ['all', ...present];
  }, [docs]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter(
      (d) =>
        (q === '' || d.client.toLowerCase().includes(q) || d.num.toLowerCase().includes(q)) &&
        (statusFilter === 'all' || d.status === statusFilter),
    );
  }, [docs, search, statusFilter]);

  const selected = docs.find((d) => d.num === selectedNum) ?? docs[0];

  function switchTab(next: Tab) {
    setTab(next);
    setSearch('');
    setStatusFilter('all');
    setSelectedNum((next === 'factures' ? factures : proformas)[0]?.num ?? '');
  }

  const chipLabel = (f: StatusFilter) => (f === 'all' ? t('common.all') : t(`doc.status.${f}`));

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
          <div className="flex flex-col">
            {visible.map((d) => {
              const active = d.num === selectedNum;
              const s = docStatusConfig[d.status];
              return (
                <button
                  key={d.num}
                  type="button"
                  onClick={() => setSelectedNum(d.num)}
                  className={`border-border flex items-center gap-3 border-b px-4 py-4 text-start ${
                    active ? 'bg-secondary' : 'hover:bg-input'
                  }`}
                >
                  <div className="bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                    <Icon i={listIcon} size={14} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground font-mono text-xs">{d.num}</span>
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
                        {d.client}
                      </span>
                      <span className="font-body text-foreground shrink-0 text-sm font-bold">
                        {formatFCFA(docTotal(d))} {t('common.fcfa')}
                      </span>
                    </div>
                    <span className="text-muted-foreground font-body text-xs">{d.date}</span>
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
        </div>

        {/* Aperçu du document */}
        {selected && (
          <div className="flex flex-1 flex-col gap-5 px-4 py-6 md:px-8">
            {/* En-tête de l'aperçu */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-headings text-foreground text-lg font-bold">
                  {t(kind === 'facture' ? 'documents.kind.facture' : 'documents.kind.proforma')}{' '}
                  {selected.num}
                </h2>
                <p className="text-muted-foreground font-body mt-0.5 text-xs">
                  {selected.dateLong} · {selected.client}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => toast(t('documents.shareSoon'), 'info')}
                  className="border-border bg-surface text-foreground font-body flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold"
                >
                  <Icon i="share-2" size={14} />
                  {t('documents.shareWhatsapp')}
                </button>
                <button
                  type="button"
                  onClick={() => toast(t('documents.printSoon'), 'info')}
                  className="bg-primary text-primary-foreground font-body flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold"
                >
                  <Icon i="printer" size={14} />
                  {t('documents.print')}
                </button>
              </div>
            </div>

            <DocumentPreview doc={selected} kind={kind} />
          </div>
        )}
      </div>
    </>
  );
}
