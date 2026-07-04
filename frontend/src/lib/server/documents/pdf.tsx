// Phase 6 — rendu PDF d'un document (facture / proforma) via @react-pdf/renderer.
// Serveur uniquement (runtime nodejs). Aucune classe Tailwind ici : @react-pdf a
// son propre moteur de styles. Montants en FCFA entier (séparateur d'espace).
import 'server-only';
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { type DocLine } from './helpers';

export interface PdfInput {
  type: 'FACTURE' | 'PROFORMA';
  number: string;
  clientName: string;
  clientPhone?: string | null;
  total: number;
  lines: DocLine[];
  validityDays?: number | null;
  issuedAt: string; // ISO
  note?: string | null;
  org: {
    name: string;
    city?: string | null;
    address?: string | null;
    phone?: string | null;
    currency: string;
    invoiceNote?: string | null;
    /** data-URI JPEG/PNG du logo (voir server/documents/logo.ts), ou null. */
    logo?: string | null;
  };
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const money = (n: number, cur: string) => `${nf.format(n)} ${cur}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

const C = {
  ink: '#1f2937',
  muted: '#6b7280',
  line: '#e5e7eb',
  brand: '#0f766e',
};

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: C.ink, fontFamily: 'Helvetica' },
  row: { flexDirection: 'row' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { width: 48, height: 48, marginBottom: 8, objectFit: 'contain' },
  brandName: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.ink },
  muted: { color: C.muted },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  small: { fontSize: 9, color: C.muted },
  sectionLabel: { fontSize: 8, color: C.muted, marginBottom: 2, textTransform: 'uppercase' },
  recipient: { marginTop: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line },
  th: {
    flexDirection: 'row',
    marginTop: 20,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.ink,
  },
  tr: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  cArticle: { flex: 1 },
  cQty: { width: 40, textAlign: 'center' },
  cPu: { width: 90, textAlign: 'right' },
  cTotal: { width: 90, textAlign: 'right' },
  totals: { marginTop: 16, alignItems: 'flex-end' },
  totalRow: {
    flexDirection: 'row',
    width: 220,
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  grand: {
    flexDirection: 'row',
    width: 220,
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  grandLabel: { fontFamily: 'Helvetica-Bold', fontSize: 12 },
  grandValue: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: C.brand },
  footer: {
    marginTop: 28,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
    fontSize: 8,
    color: C.muted,
  },
});

function buildElement(input: PdfInput) {
  const isProforma = input.type === 'PROFORMA';
  const cur = input.org.currency;
  const footer = isProforma
    ? `Devis valable ${input.validityDays ?? 30} jours à compter de la date d'émission.`
    : (input.org.invoiceNote ?? 'Merci de votre confiance.');

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* En-tête */}
        <View style={s.between}>
          <View>
            {input.org.logo ? <Image src={input.org.logo} style={s.logo} /> : null}
            <Text style={s.brandName}>{input.org.name}</Text>
            {input.org.address ? <Text style={s.small}>{input.org.address}</Text> : null}
            <Text style={s.small}>{input.org.city ?? 'N’Djamena, Tchad'}</Text>
            {input.org.phone ? <Text style={s.small}>{input.org.phone}</Text> : null}
          </View>
          <View>
            <Text style={s.title}>{isProforma ? 'PROFORMA' : 'FACTURE'}</Text>
            <Text style={[s.small, { textAlign: 'right', marginTop: 4 }]}>{input.number}</Text>
            <Text style={[s.small, { textAlign: 'right' }]}>{fmtDate(input.issuedAt)}</Text>
          </View>
        </View>

        {/* Destinataire */}
        <View style={s.recipient}>
          <Text style={s.sectionLabel}>{isProforma ? 'Destinataire' : 'Facturé à'}</Text>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{input.clientName}</Text>
          {input.clientPhone ? <Text style={s.small}>{input.clientPhone}</Text> : null}
        </View>

        {/* Lignes */}
        <View style={s.th}>
          <Text style={[s.cArticle, s.muted]}>Article</Text>
          <Text style={[s.cQty, s.muted]}>Qté</Text>
          <Text style={[s.cPu, s.muted]}>P.U.</Text>
          <Text style={[s.cTotal, s.muted]}>Total</Text>
        </View>
        {input.lines.map((l, i) => (
          <View key={`${l.article}-${i}`} style={s.tr}>
            <Text style={s.cArticle}>{l.article}</Text>
            <Text style={s.cQty}>{String(l.qty)}</Text>
            <Text style={s.cPu}>{money(l.unitPrice, cur)}</Text>
            <Text style={s.cTotal}>{money(l.qty * l.unitPrice, cur)}</Text>
          </View>
        ))}

        {/* Totaux — remise dérivée (brut des lignes − total net) si > 0. */}
        {(() => {
          const gross = input.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
          const discount = gross - input.total;
          return (
            <View style={s.totals}>
              <View style={s.totalRow}>
                <Text style={s.muted}>Sous-total</Text>
                <Text>{money(gross, cur)}</Text>
              </View>
              {discount > 0 ? (
                <View style={s.totalRow}>
                  <Text style={s.muted}>Remise</Text>
                  <Text>- {money(discount, cur)}</Text>
                </View>
              ) : null}
              <View style={s.grand}>
                <Text style={s.grandLabel}>{isProforma ? 'Total estimé' : 'Total'}</Text>
                <Text style={s.grandValue}>{money(input.total, cur)}</Text>
              </View>
            </View>
          );
        })()}

        {input.note ? <Text style={[s.small, { marginTop: 12 }]}>{input.note}</Text> : null}
        <Text style={s.footer}>{footer}</Text>
      </Page>
    </Document>
  );
}

/** Rend le document en PDF (Buffer) prêt à streamer dans une Response. */
export function renderDocumentPdf(input: PdfInput): Promise<Buffer> {
  return renderToBuffer(buildElement(input));
}
