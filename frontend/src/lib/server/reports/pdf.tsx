// Phase 8 (post-v1) — rendu PDF d'un rapport d'activité via @react-pdf/renderer.
// Serveur uniquement. Aucune classe Tailwind : @react-pdf a son propre moteur de
// styles. `import React` explicite requis (JSX classique, compat vitest).
import 'server-only';
import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { ReportSummary } from './compute';
import type { TopProduct } from './helpers';

export interface ReportPdfInput {
  periodLabel: string;
  rangeLabel: string;
  generatedAt: string; // ISO
  summary: ReportSummary;
  series: { label: string; value: number }[];
  topProducts: TopProduct[];
  org: {
    name: string;
    city?: string | null;
    currency: string;
  };
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const money = (n: number, cur: string) => `${nf.format(n)} ${cur}`;

const C = {
  ink: '#1f2937',
  muted: '#6b7280',
  line: '#e5e7eb',
  brand: '#0f766e',
  danger: '#b91c1c',
};

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: C.ink, fontFamily: 'Helvetica' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brandName: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.ink },
  small: { fontSize: 9, color: C.muted },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 24, marginBottom: 8 },
  // Cartes KPI
  kpiWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 20 },
  kpi: {
    width: '33.33%',
    paddingVertical: 8,
    paddingRight: 12,
  },
  kpiLabel: { fontSize: 8, color: C.muted, textTransform: 'uppercase', marginBottom: 3 },
  kpiValue: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  // Tables
  th: {
    flexDirection: 'row',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.ink,
  },
  tr: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  muted: { color: C.muted },
  cRank: { width: 28, textAlign: 'center' },
  cName: { flex: 1 },
  cQty: { width: 50, textAlign: 'center' },
  cCa: { width: 110, textAlign: 'right' },
  cLabel: { flex: 1 },
  cVal: { width: 140, textAlign: 'right' },
  footer: {
    marginTop: 28,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
    fontSize: 8,
    color: C.muted,
  },
});

function buildElement(input: ReportPdfInput) {
  const cur = input.org.currency;
  const sm = input.summary;
  const generated = new Date(input.generatedAt).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const nonZeroSeries = input.series.filter((b) => b.value > 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* En-tête */}
        <View style={s.between}>
          <View>
            <Text style={s.brandName}>{input.org.name}</Text>
            <Text style={s.small}>{input.org.city ?? 'N’Djamena, Tchad'}</Text>
          </View>
          <View>
            <Text style={s.title}>RAPPORT</Text>
            <Text style={[s.small, { textAlign: 'right', marginTop: 4 }]}>{input.periodLabel}</Text>
            <Text style={[s.small, { textAlign: 'right' }]}>{input.rangeLabel}</Text>
          </View>
        </View>

        {/* KPI */}
        <View style={s.kpiWrap}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Chiffre d&apos;affaires</Text>
            <Text style={[s.kpiValue, { color: C.brand }]}>{money(sm.revenue, cur)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Ventes</Text>
            <Text style={s.kpiValue}>{String(sm.sales)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Marge brute</Text>
            <Text style={s.kpiValue}>
              {money(sm.grossMargin, cur)} ({sm.marginPct} %)
            </Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Dépenses</Text>
            <Text style={s.kpiValue}>{money(sm.expenses, cur)}</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Bénéfice net</Text>
            <Text style={[s.kpiValue, { color: sm.netProfit < 0 ? C.danger : C.brand }]}>
              {money(sm.netProfit, cur)}
            </Text>
          </View>
        </View>

        {/* Top produits */}
        <Text style={s.sectionTitle}>Top produits</Text>
        {input.topProducts.length === 0 ? (
          <Text style={s.small}>Aucune vente sur la période.</Text>
        ) : (
          <View>
            <View style={s.th}>
              <Text style={[s.cRank, s.muted]}>#</Text>
              <Text style={[s.cName, s.muted]}>Produit</Text>
              <Text style={[s.cQty, s.muted]}>Qté</Text>
              <Text style={[s.cCa, s.muted]}>CA</Text>
            </View>
            {input.topProducts.map((p) => (
              <View key={p.rank} style={s.tr}>
                <Text style={s.cRank}>{String(p.rank)}</Text>
                <Text style={s.cName}>{p.name}</Text>
                <Text style={s.cQty}>{String(p.qty)}</Text>
                <Text style={s.cCa}>{money(p.ca, cur)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Évolution du CA */}
        {nonZeroSeries.length > 0 ? (
          <View>
            <Text style={s.sectionTitle}>Évolution du chiffre d&apos;affaires</Text>
            <View style={s.th}>
              <Text style={[s.cLabel, s.muted]}>Période</Text>
              <Text style={[s.cVal, s.muted]}>CA</Text>
            </View>
            {nonZeroSeries.map((b, i) => (
              <View key={`${b.label}-${i}`} style={s.tr}>
                <Text style={s.cLabel}>{b.label}</Text>
                <Text style={s.cVal}>{money(b.value, cur)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={s.footer}>
          Rapport généré le {generated} — {input.org.name}. Montants en {cur}.
        </Text>
      </Page>
    </Document>
  );
}

/** Rend le rapport en PDF (Buffer) prêt à streamer dans une Response. */
export function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  return renderToBuffer(buildElement(input));
}
