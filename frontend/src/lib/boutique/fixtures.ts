// Données factices pour la phase UI (round 1). À remplacer par les routes
// /api/* métier une fois les modèles Prisma (Produit, Vente, Stock…) créés.

export type PaymentMethod = 'cash' | 'mobile' | 'credit';

export interface KpiStat {
  label: string;
  value: string;
  unit: string;
  icon: string;
  trend: string;
  trendUp: boolean;
  accent?: boolean;
}

export interface RecentSale {
  time: string;
  product: string;
  qty: number;
  total: number;
  method: PaymentMethod;
  synced: boolean;
}

export interface StockAlert {
  name: string;
  remaining: number;
  unit: string;
  critical: boolean;
}

export interface WeekdayBar {
  label: string;
  value: number; // 0–100, hauteur relative
}

export const dashboardKpis: KpiStat[] = [
  {
    label: 'CA du jour',
    value: '142 500',
    unit: 'FCFA',
    icon: 'trending-up',
    trend: '+12%',
    trendUp: true,
    accent: true,
  },
  {
    label: 'Ventes aujourd’hui',
    value: '23',
    unit: 'ventes',
    icon: 'shopping-cart',
    trend: '+3',
    trendUp: true,
  },
  {
    label: 'Créances en cours',
    value: '37 000',
    unit: 'FCFA',
    icon: 'users',
    trend: '-5 000',
    trendUp: false,
  },
  {
    label: 'Dépenses du jour',
    value: '18 200',
    unit: 'FCFA',
    icon: 'wallet',
    trend: '+2 000',
    trendUp: false,
  },
];

export const weeklySales: WeekdayBar[] = [
  { label: 'Lun', value: 68 },
  { label: 'Mar', value: 45 },
  { label: 'Mer', value: 82 },
  { label: 'Jeu', value: 55 },
  { label: 'Ven', value: 91 },
  { label: 'Sam', value: 100 },
  { label: 'Dim', value: 38 },
];
export const weeklyTodayIndex = 5; // Samedi mis en avant

export const stockAlerts: StockAlert[] = [
  { name: 'Huile Tournesol 1L', remaining: 2, unit: 'unités', critical: true },
  { name: 'Riz parfumé 5kg', remaining: 4, unit: 'sacs', critical: false },
  { name: 'Savon Monganga ×12', remaining: 1, unit: 'boîte', critical: true },
  { name: 'Sucre 1kg', remaining: 6, unit: 'unités', critical: false },
  { name: 'Sardines Horizon ×24', remaining: 3, unit: 'boîtes', critical: false },
];

export const recentSales: RecentSale[] = [
  { time: '15:44', product: 'Tissu wax 6y', qty: 2, total: 18000, method: 'cash', synced: true },
  {
    time: '15:31',
    product: 'Huile Tournesol 2L',
    qty: 3,
    total: 7500,
    method: 'mobile',
    synced: true,
  },
  {
    time: '15:10',
    product: 'Savon Monganga ×6',
    qty: 1,
    total: 3200,
    method: 'cash',
    synced: false,
  },
  {
    time: '14:52',
    product: 'Riz parfumé 5kg',
    qty: 1,
    total: 6000,
    method: 'credit',
    synced: false,
  },
  { time: '14:38', product: 'Sucre 1kg ×4', qty: 4, total: 5600, method: 'cash', synced: false },
  {
    time: '14:20',
    product: 'Sardines Horizon ×24',
    qty: 2,
    total: 9400,
    method: 'mobile',
    synced: true,
  },
];

export const paymentLabels: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  mobile: 'Mobile Money',
  credit: 'Crédit',
};

// ── Point de vente (Vendre) ────────────────────────────────────────────────

export interface PosProduct {
  name: string;
  price: number; // FCFA entier
  stock: number;
  category: string;
  low: boolean;
}

export const posCategories: string[] = [
  'Tous',
  'Alimentation',
  'Textile',
  'Hygiène',
  'Boissons',
  'Épicerie',
];

export const posProducts: PosProduct[] = [
  { name: 'Tissu wax 6y', price: 9000, stock: 14, category: 'Textile', low: false },
  { name: 'Huile Tournesol 2L', price: 2500, stock: 2, category: 'Alimentation', low: true },
  { name: 'Riz parfumé 5kg', price: 6000, stock: 4, category: 'Alimentation', low: true },
  { name: 'Savon Monganga ×6', price: 3200, stock: 1, category: 'Hygiène', low: true },
  { name: 'Sucre 1kg', price: 1400, stock: 12, category: 'Alimentation', low: false },
  { name: 'Sardines Horizon ×24', price: 4700, stock: 3, category: 'Alimentation', low: true },
  { name: 'Eau minérale 1.5L', price: 500, stock: 30, category: 'Boissons', low: false },
  { name: 'Farine de blé 1kg', price: 1100, stock: 8, category: 'Épicerie', low: false },
  { name: 'Thé Lipton ×25', price: 2000, stock: 6, category: 'Boissons', low: false },
  { name: 'Lait en poudre 400g', price: 3800, stock: 5, category: 'Alimentation', low: false },
  { name: 'Boubou coton L', price: 12000, stock: 3, category: 'Textile', low: false },
  { name: 'Dentifrice Colgate', price: 1200, stock: 9, category: 'Hygiène', low: false },
];

export const posClients: string[] = ['Moussa Ibrahim', 'Amina Kouka', 'Boutique Al-Nour'];

// ── Stock (gestion des produits) ───────────────────────────────────────────

export type StockStatus = 'ok' | 'low' | 'out';

export interface StockProduct {
  ref: string;
  name: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  qty: number;
  threshold: number;
  status: StockStatus;
}

export const stockStatusConfig: Record<StockStatus, { label: string; cls: string }> = {
  ok: { label: 'En stock', cls: 'bg-badge-cash text-badge-cash-foreground' },
  low: { label: 'Stock faible', cls: 'bg-badge-credit text-badge-credit-foreground' },
  out: { label: 'Rupture', cls: 'bg-danger text-danger-foreground' },
};

/** Statut dérivé du couple quantité / seuil (pour les produits ajoutés). */
export function deriveStockStatus(qty: number, threshold: number): StockStatus {
  if (qty <= 0) return 'out';
  if (qty <= threshold) return 'low';
  return 'ok';
}

export const stockProducts: StockProduct[] = [
  {
    ref: 'P-041',
    name: 'Tissu wax 6y',
    category: 'Textile',
    buyPrice: 6500,
    sellPrice: 9000,
    qty: 14,
    threshold: 5,
    status: 'ok',
  },
  {
    ref: 'P-042',
    name: 'Huile Tournesol 2L',
    category: 'Alimentation',
    buyPrice: 1800,
    sellPrice: 2500,
    qty: 2,
    threshold: 5,
    status: 'low',
  },
  {
    ref: 'P-043',
    name: 'Riz parfumé 5kg',
    category: 'Alimentation',
    buyPrice: 4200,
    sellPrice: 6000,
    qty: 4,
    threshold: 6,
    status: 'low',
  },
  {
    ref: 'P-044',
    name: 'Savon Monganga ×6',
    category: 'Hygiène',
    buyPrice: 2100,
    sellPrice: 3200,
    qty: 1,
    threshold: 3,
    status: 'out',
  },
  {
    ref: 'P-045',
    name: 'Sucre 1kg',
    category: 'Alimentation',
    buyPrice: 900,
    sellPrice: 1400,
    qty: 12,
    threshold: 8,
    status: 'ok',
  },
  {
    ref: 'P-046',
    name: 'Sardines Horizon ×24',
    category: 'Alimentation',
    buyPrice: 3100,
    sellPrice: 4700,
    qty: 3,
    threshold: 4,
    status: 'low',
  },
  {
    ref: 'P-047',
    name: 'Eau minérale 1.5L',
    category: 'Boissons',
    buyPrice: 300,
    sellPrice: 500,
    qty: 30,
    threshold: 12,
    status: 'ok',
  },
  {
    ref: 'P-048',
    name: 'Farine de blé 1kg',
    category: 'Épicerie',
    buyPrice: 700,
    sellPrice: 1100,
    qty: 8,
    threshold: 6,
    status: 'ok',
  },
  {
    ref: 'P-049',
    name: 'Thé Lipton ×25',
    category: 'Boissons',
    buyPrice: 1300,
    sellPrice: 2000,
    qty: 6,
    threshold: 5,
    status: 'ok',
  },
  {
    ref: 'P-050',
    name: 'Lait en poudre 400g',
    category: 'Alimentation',
    buyPrice: 2700,
    sellPrice: 3800,
    qty: 0,
    threshold: 3,
    status: 'out',
  },
  {
    ref: 'P-051',
    name: 'Boubou coton L',
    category: 'Textile',
    buyPrice: 8000,
    sellPrice: 12000,
    qty: 3,
    threshold: 2,
    status: 'ok',
  },
  {
    ref: 'P-052',
    name: 'Dentifrice Colgate',
    category: 'Hygiène',
    buyPrice: 750,
    sellPrice: 1200,
    qty: 9,
    threshold: 4,
    status: 'ok',
  },
];

// Totaux niveau application (le tableau n'affiche qu'un échantillon des 52 réfs).
export const stockSummary = { totalRefs: 52, stockValue: 384200 };

// ── Dépenses ───────────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  date: string;
  label: string;
  category: string;
  amount: number;
  note: string;
}

export const expenseCategories = [
  'Stock',
  'Transport',
  'Loyer',
  'Charges',
  'Frais',
  'Salaires',
  'Entretien',
];

/** Couleur de badge par catégorie ; défaut = muted. */
export const expenseCategoryColors: Record<string, string> = {
  Stock: 'bg-badge-mobile text-badge-mobile-foreground',
  Loyer: 'bg-badge-credit text-badge-credit-foreground',
  Salaires: 'bg-secondary text-secondary-foreground',
};

export const expenseCategoryColor = (cat: string): string =>
  expenseCategoryColors[cat] ?? 'bg-muted text-muted-foreground';

/** Date « du jour » de la maquette — les nouvelles dépenses la reçoivent. */
export const EXPENSE_TODAY = '15 jan 2025';

export const expenses: Expense[] = [
  {
    id: 'D-088',
    date: '15 jan 2025',
    label: 'Réapprovisionnement tissu wax',
    category: 'Stock',
    amount: 45000,
    note: '',
  },
  {
    id: 'D-087',
    date: '15 jan 2025',
    label: 'Transport marchandises',
    category: 'Transport',
    amount: 5500,
    note: '',
  },
  {
    id: 'D-086',
    date: '14 jan 2025',
    label: 'Loyer boutique — jan 2025',
    category: 'Loyer',
    amount: 60000,
    note: 'Mensuel',
  },
  {
    id: 'D-085',
    date: '14 jan 2025',
    label: 'Électricité',
    category: 'Charges',
    amount: 8200,
    note: '',
  },
  {
    id: 'D-084',
    date: '13 jan 2025',
    label: 'Achat huile Tournesol ×24',
    category: 'Stock',
    amount: 43200,
    note: '',
  },
  {
    id: 'D-083',
    date: '12 jan 2025',
    label: 'Frais Mobile Money',
    category: 'Frais',
    amount: 1800,
    note: '',
  },
  {
    id: 'D-082',
    date: '11 jan 2025',
    label: 'Salaire vendeur — jan',
    category: 'Salaires',
    amount: 35000,
    note: 'Partiel',
  },
  {
    id: 'D-081',
    date: '10 jan 2025',
    label: 'Réapprovisionnement riz',
    category: 'Stock',
    amount: 25200,
    note: '',
  },
  {
    id: 'D-080',
    date: '9 jan 2025',
    label: 'Entretien vitrine',
    category: 'Entretien',
    amount: 3500,
    note: '',
  },
  {
    id: 'D-079',
    date: '8 jan 2025',
    label: 'Internet + téléphone',
    category: 'Charges',
    amount: 4000,
    note: '',
  },
];

// ── Créances (clients débiteurs) ────────────────────────────────────────────

export type CreditStatus = 'paid' | 'partial' | 'credit';

export interface CreditPurchase {
  date: string;
  product: string;
  amount: number; // FCFA entier
  status: CreditStatus;
}

export interface Debtor {
  id: string;
  name: string;
  phone: string;
  lastSale: string;
  debt: number; // solde restant dû (FCFA)
  repaid: number; // déjà remboursé (FCFA)
  since: string; // « client depuis … »
  history: CreditPurchase[];
}

export const creditStatusConfig: Record<CreditStatus, { label: string; cls: string }> = {
  paid: { label: 'Remboursé', cls: 'bg-badge-cash text-badge-cash-foreground' },
  partial: { label: 'Partiel', cls: 'bg-badge-credit text-badge-credit-foreground' },
  credit: { label: 'Dû', cls: 'bg-danger text-danger-foreground' },
};

export const creditPaymentMethods: string[] = ['Espèces', 'Mobile Money', 'Virement'];

// Total acheté à crédit = debt + repaid ; l'historique somme à ce total.
export const debtors: Debtor[] = [
  {
    id: 'C-01',
    name: 'Moussa Ibrahim',
    phone: '77 412 33 21',
    lastSale: '15 jan 2025',
    debt: 34500,
    repaid: 19900,
    since: 'jan 2025',
    history: [
      { date: '15 jan 2025', product: 'Tissu wax 6y', amount: 18000, status: 'credit' },
      { date: '12 jan 2025', product: 'Riz parfumé 5kg ×3', amount: 18000, status: 'credit' },
      { date: '8 jan 2025', product: 'Sucre 1kg ×6', amount: 8400, status: 'partial' },
      { date: '3 jan 2025', product: 'Huile Tournesol 2L ×4', amount: 10000, status: 'paid' },
    ],
  },
  {
    id: 'C-02',
    name: 'Boutique Al-Nour',
    phone: '70 882 11 44',
    lastSale: '14 jan 2025',
    debt: 28000,
    repaid: 12000,
    since: 'déc 2024',
    history: [
      { date: '14 jan 2025', product: 'Savon Monganga ×12', amount: 16000, status: 'credit' },
      { date: '10 jan 2025', product: 'Sardines Horizon ×24', amount: 12000, status: 'credit' },
      { date: '4 jan 2025', product: 'Sucre 1kg ×8', amount: 12000, status: 'paid' },
    ],
  },
  {
    id: 'C-03',
    name: 'Amina Kouka',
    phone: '76 203 88 55',
    lastSale: '13 jan 2025',
    debt: 17200,
    repaid: 8000,
    since: 'jan 2025',
    history: [
      { date: '13 jan 2025', product: 'Boubou coton L ×2', amount: 17200, status: 'credit' },
      { date: '6 jan 2025', product: 'Sucre 1kg ×6', amount: 8000, status: 'paid' },
    ],
  },
  {
    id: 'C-04',
    name: 'Jean-Baptiste Loko',
    phone: '99 114 72 30',
    lastSale: '12 jan 2025',
    debt: 12500,
    repaid: 0,
    since: 'jan 2025',
    history: [
      { date: '12 jan 2025', product: 'Riz parfumé 5kg ×2', amount: 12500, status: 'credit' },
    ],
  },
  {
    id: 'C-05',
    name: 'Marché Central — Stand 14',
    phone: '65 330 29 87',
    lastSale: '10 jan 2025',
    debt: 9000,
    repaid: 4000,
    since: 'nov 2024',
    history: [
      { date: '10 jan 2025', product: 'Farine de blé 1kg ×8', amount: 9000, status: 'credit' },
      { date: '4 jan 2025', product: 'Thé Lipton ×25 ×2', amount: 4000, status: 'paid' },
    ],
  },
  {
    id: 'C-06',
    name: 'Fatoumata Diallo',
    phone: '78 561 04 12',
    lastSale: '8 jan 2025',
    debt: 6800,
    repaid: 0,
    since: 'jan 2025',
    history: [
      { date: '8 jan 2025', product: 'Huile Tournesol 2L ×2', amount: 6800, status: 'credit' },
    ],
  },
];

// ── Documents (factures & proformas) ─────────────────────────────────────────

export type DocStatus = 'paid' | 'pending' | 'credit';

export interface DocLine {
  article: string;
  qty: number;
  unitPrice: number; // FCFA entier
}

export interface SaleDocument {
  num: string;
  client: string;
  clientPhone: string;
  date: string; // court : « 15 jan 2025 »
  dateLong: string; // long : « 15 janvier 2025 »
  status: DocStatus;
  lines: DocLine[];
}

export const docStatusConfig: Record<DocStatus, { label: string; cls: string }> = {
  paid: { label: 'Payée', cls: 'bg-badge-cash text-badge-cash-foreground' },
  pending: { label: 'En attente', cls: 'bg-badge-credit text-badge-credit-foreground' },
  credit: { label: 'Crédit', cls: 'bg-danger text-danger-foreground' },
};

/** Total du document = Σ(qté × prix unitaire). Pas de taxe dans ce design. */
export function docTotal(doc: SaleDocument): number {
  return doc.lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
}

export const PROFORMA_VALIDITY = '30 jours';

export const factures: SaleDocument[] = [
  {
    num: 'F-0124',
    client: 'Moussa Ibrahim',
    clientPhone: '77 412 33 21',
    date: '15 jan 2025',
    dateLong: '15 janvier 2025',
    status: 'paid',
    lines: [{ article: 'Tissu wax 6y', qty: 2, unitPrice: 9000 }],
  },
  {
    num: 'F-0123',
    client: 'Boutique Al-Nour',
    clientPhone: '70 882 11 44',
    date: '14 jan 2025',
    dateLong: '14 janvier 2025',
    status: 'credit',
    lines: [
      { article: 'Savon Monganga ×12', qty: 4, unitPrice: 4000 },
      { article: 'Riz parfumé 5kg', qty: 2, unitPrice: 6000 },
    ],
  },
  {
    num: 'F-0122',
    client: 'Amina Kouka',
    clientPhone: '76 203 88 55',
    date: '13 jan 2025',
    dateLong: '13 janvier 2025',
    status: 'pending',
    lines: [
      { article: 'Sucre 1kg', qty: 4, unitPrice: 1400 },
      { article: 'Thé Lipton ×25', qty: 2, unitPrice: 2000 },
    ],
  },
  {
    num: 'F-0121',
    client: 'Jean-Baptiste Loko',
    clientPhone: '99 114 72 30',
    date: '12 jan 2025',
    dateLong: '12 janvier 2025',
    status: 'credit',
    lines: [{ article: 'Huile Tournesol 2L', qty: 5, unitPrice: 2500 }],
  },
  {
    num: 'F-0120',
    client: 'Marché Central — Stand 14',
    clientPhone: '65 330 29 87',
    date: '11 jan 2025',
    dateLong: '11 janvier 2025',
    status: 'paid',
    lines: [{ article: 'Farine de blé 1kg', qty: 4, unitPrice: 1300 }],
  },
  {
    num: 'F-0119',
    client: 'Fatoumata Diallo',
    clientPhone: '78 561 04 12',
    date: '10 jan 2025',
    dateLong: '10 janvier 2025',
    status: 'paid',
    lines: [{ article: 'Savon Monganga ×6', qty: 2, unitPrice: 3400 }],
  },
  {
    num: 'F-0118',
    client: 'Client comptoir',
    clientPhone: '—',
    date: '9 jan 2025',
    dateLong: '9 janvier 2025',
    status: 'paid',
    lines: [{ article: 'Articles divers (comptoir)', qty: 1, unitPrice: 3100 }],
  },
];

export const proformas: SaleDocument[] = [
  {
    num: 'PRO-031',
    client: 'Boutique Al-Nour',
    clientPhone: '70 882 11 44',
    date: '15 jan 2025',
    dateLong: '15 janvier 2025',
    status: 'pending',
    lines: [
      { article: 'Tissu wax 6y', qty: 3, unitPrice: 9000 },
      { article: 'Savon Monganga ×12', qty: 5, unitPrice: 4000 },
    ],
  },
  {
    num: 'PRO-030',
    client: 'Marché Central — Stand 14',
    clientPhone: '65 330 29 87',
    date: '13 jan 2025',
    dateLong: '13 janvier 2025',
    status: 'pending',
    lines: [
      { article: 'Riz parfumé 5kg', qty: 3, unitPrice: 6000 },
      { article: 'Eau minérale 1.5L', qty: 9, unitPrice: 500 },
    ],
  },
  {
    num: 'PRO-029',
    client: 'Ibrahim & Fils',
    clientPhone: '33 821 55 09',
    date: '10 jan 2025',
    dateLong: '10 janvier 2025',
    status: 'pending',
    lines: [
      { article: 'Boubou coton L', qty: 1, unitPrice: 12000 },
      { article: 'Eau minérale 1.5L', qty: 6, unitPrice: 500 },
    ],
  },
];

// ── Paramètres ───────────────────────────────────────────────────────────────

export interface SettingsSection {
  key: string;
  icon: string;
  label: string;
}

export const settingsSections: SettingsSection[] = [
  { key: 'boutique', icon: 'store', label: 'Boutique' },
  { key: 'abonnement', icon: 'badge-check', label: 'Abonnement' },
  { key: 'facturation', icon: 'receipt', label: 'Facturation' },
  { key: 'devise', icon: 'coins', label: 'Devise' },
  { key: 'utilisateurs', icon: 'users', label: 'Utilisateurs' },
  { key: 'securite', icon: 'shield-check', label: 'Sécurité' },
  { key: 'notifications', icon: 'bell', label: 'Notifications' },
  { key: 'mobile-money', icon: 'smartphone', label: 'Mobile Money' },
  { key: 'sync', icon: 'cloud', label: 'Synchronisation' },
];

export interface BoutiqueInfo {
  name: string;
  phone: string;
  city: string;
  address: string;
  invoiceNote: string;
}

export const defaultBoutiqueInfo: BoutiqueInfo = {
  name: 'Sahilley',
  phone: '+235 66 XX XX XX',
  city: "N'Djamena",
  address: '',
  invoiceNote: '',
};

export interface BoutiqueUser {
  id: string;
  name: string;
  role: 'Patron' | 'Vendeur' | 'Gérant';
  phone: string;
  you: boolean;
}

export const boutiqueUsers: BoutiqueUser[] = [
  { id: 'U-01', name: 'Ousmane Mahamat', role: 'Patron', phone: '+235 66 11 22 33', you: true },
  { id: 'U-02', name: 'Aïcha Saleh', role: 'Vendeur', phone: '+235 77 44 55 66', you: false },
];

// ── Ventes (historique) ──────────────────────────────────────────────────────

export type SaleMethod = 'Espèces' | 'Mobile Money' | 'Crédit';

export interface SaleTx {
  id: string;
  date: string;
  time: string;
  product: string;
  qty: number;
  total: number; // FCFA entier
  method: SaleMethod;
  synced: boolean;
}

export const saleMethods: SaleMethod[] = ['Espèces', 'Mobile Money', 'Crédit'];

export const saleMethodBadge: Record<SaleMethod, string> = {
  Espèces: 'bg-badge-cash text-badge-cash-foreground',
  'Mobile Money': 'bg-badge-mobile text-badge-mobile-foreground',
  Crédit: 'bg-badge-credit text-badge-credit-foreground',
};

export const SALES_TODAY = '15 jan 2025';

/** Totaux du jour (niveau appli) — le tableau n'affiche que les 12 ventes récentes. */
export const salesSummary = { caToday: 142500, txToday: 23, syncPending: 4, creditSales: 11500 };

export const salesTransactions: SaleTx[] = [
  {
    id: 'V-0892',
    date: '15 jan 2025',
    time: '15:44',
    product: 'Tissu wax 6y',
    qty: 2,
    total: 18000,
    method: 'Espèces',
    synced: true,
  },
  {
    id: 'V-0891',
    date: '15 jan 2025',
    time: '15:31',
    product: 'Huile Tournesol 2L ×3',
    qty: 3,
    total: 7500,
    method: 'Mobile Money',
    synced: true,
  },
  {
    id: 'V-0890',
    date: '15 jan 2025',
    time: '15:10',
    product: 'Savon Monganga ×6',
    qty: 1,
    total: 3200,
    method: 'Espèces',
    synced: false,
  },
  {
    id: 'V-0889',
    date: '15 jan 2025',
    time: '14:52',
    product: 'Riz parfumé 5kg',
    qty: 1,
    total: 6000,
    method: 'Crédit',
    synced: false,
  },
  {
    id: 'V-0888',
    date: '15 jan 2025',
    time: '14:38',
    product: 'Sucre 1kg ×4',
    qty: 4,
    total: 5600,
    method: 'Espèces',
    synced: false,
  },
  {
    id: 'V-0887',
    date: '15 jan 2025',
    time: '14:20',
    product: 'Sardines Horizon ×24',
    qty: 2,
    total: 9400,
    method: 'Mobile Money',
    synced: true,
  },
  {
    id: 'V-0886',
    date: '14 jan 2025',
    time: '17:05',
    product: 'Boubou coton L',
    qty: 1,
    total: 12000,
    method: 'Espèces',
    synced: true,
  },
  {
    id: 'V-0885',
    date: '14 jan 2025',
    time: '16:42',
    product: 'Thé Lipton ×25',
    qty: 2,
    total: 4000,
    method: 'Mobile Money',
    synced: true,
  },
  {
    id: 'V-0884',
    date: '14 jan 2025',
    time: '15:30',
    product: 'Farine de blé 1kg ×5',
    qty: 5,
    total: 5500,
    method: 'Crédit',
    synced: true,
  },
  {
    id: 'V-0883',
    date: '14 jan 2025',
    time: '13:11',
    product: 'Eau minérale 1.5L ×6',
    qty: 6,
    total: 3000,
    method: 'Espèces',
    synced: true,
  },
  {
    id: 'V-0882',
    date: '14 jan 2025',
    time: '11:58',
    product: 'Lait en poudre 400g',
    qty: 1,
    total: 3800,
    method: 'Espèces',
    synced: true,
  },
  {
    id: 'V-0881',
    date: '13 jan 2025',
    time: '16:20',
    product: 'Dentifrice Colgate ×2',
    qty: 2,
    total: 2400,
    method: 'Mobile Money',
    synced: true,
  },
];

// ── Rapports ─────────────────────────────────────────────────────────────────

export const reportPeriods: string[] = ['Aujourd’hui', 'Semaine', 'Mois', 'Année', 'Personnalisé'];

export const reportSummary = {
  revenue: 844200,
  sales: 138,
  grossMargin: 213500,
  marginPct: 25,
  expenses: 231400,
  netProfit: -17900,
};

export interface ReportBar {
  label: string;
  value: number; // milliers FCFA
}

export const reportBars: ReportBar[] = [
  { label: 'Lun', value: 85 },
  { label: 'Mar', value: 142 },
  { label: 'Mer', value: 98 },
  { label: 'Jeu', value: 163 },
  { label: 'Ven', value: 180 },
  { label: 'Sam', value: 121 },
  { label: 'Dim', value: 55 },
];
export const reportBarsMax = 180;
export const reportPeakIndex = 4; // Ven mis en avant

export interface TopProduct {
  rank: number;
  name: string;
  qty: number;
  ca: number; // FCFA entier
}

export const reportTopProducts: TopProduct[] = [
  { rank: 1, name: 'Tissu wax 6y', qty: 18, ca: 162000 },
  { rank: 2, name: 'Huile Tournesol 2L', qty: 34, ca: 85000 },
  { rank: 3, name: 'Riz parfumé 5kg', qty: 22, ca: 132000 },
  { rank: 4, name: 'Savon Monganga ×6', qty: 41, ca: 131200 },
  { rank: 5, name: 'Sucre 1kg', qty: 56, ca: 78400 },
];
