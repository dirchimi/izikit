import Icon from '@/components/ui/Icon';
import { getServerT } from '@/lib/i18n/server';

const navItems = [
  { icon: 'layout-dashboard', key: 'nav.dashboard', active: true },
  { icon: 'shopping-cart', key: 'nav.vendre', active: false },
  { icon: 'receipt', key: 'nav.ventes', active: false },
  { icon: 'package', key: 'nav.stock', active: false },
  { icon: 'users', key: 'nav.creances', active: false },
];

const miniKpis = [
  { labelKey: 'nav.ventes', value: '23', unitKey: 'landing.preview.salesUnit' },
  { labelKey: 'nav.creances', value: '37 000', unitKey: 'common.fcfa' },
  { labelKey: 'nav.depenses', value: '18 200', unitKey: 'common.fcfa' },
];

const weekBars = [55, 90, 70, 110, 142, 88, 40];
const weekDays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const PEAK = 4; // Vendredi
const BARS_MAX = 142;

/**
 * Aperçu « produit » de la landing : faux navigateur + mini tableau de bord.
 * Statique (présentation). Les hauteurs de barres sont dynamiques → seul ce
 * calcul passe par `style`, conformément au reste du projet.
 */
export default async function DashboardPreview() {
  const { t } = await getServerT();

  return (
    <div
      id="apercu"
      className="border-border bg-surface mt-4 w-full max-w-5xl scroll-mt-24 overflow-hidden rounded-xl border shadow-sm"
    >
      {/* Chrome navigateur */}
      <div className="bg-muted border-border flex items-center gap-2 border-b px-4 py-2.5">
        <div className="bg-border h-3 w-3 rounded-full" />
        <div className="bg-border h-3 w-3 rounded-full" />
        <div className="bg-border h-3 w-3 rounded-full" />
        <div className="bg-background text-muted-foreground border-border mx-2 flex-1 truncate rounded border px-3 py-1 text-start text-xs sm:mx-4">
          app.sahilley.com
        </div>
      </div>

      {/* Mini tableau de bord */}
      <div className="flex h-[360px] sm:h-[380px]">
        {/* Sidebar (masquée sur mobile) */}
        <div className="bg-sidebar hidden w-[180px] flex-col gap-1 py-4 sm:flex">
          <div className="mb-2 flex items-center gap-2.5 px-4 py-2">
            <img src="/logo-mark.svg" alt="" className="h-7 w-7 rounded-md" />
            <span className="font-headings text-primary-foreground text-sm font-bold">
              Sahilley
            </span>
          </div>
          {navItems.map((item) => (
            <div
              key={item.key}
              className={`font-body mx-2 flex items-center gap-2.5 rounded-md px-4 py-2 text-xs ${
                item.active
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-primary-foreground opacity-60'
              }`}
            >
              <Icon i={item.icon} size={13} />
              {t(item.key)}
            </div>
          ))}
        </div>

        {/* Contenu */}
        <div className="bg-background flex flex-1 flex-col gap-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-headings text-foreground text-base font-bold">
                {t('nav.dashboard')}
              </p>
              <p className="text-muted-foreground font-body text-xs">
                {t('landing.preview.today')}
              </p>
            </div>
            <div className="bg-muted text-muted-foreground font-body flex items-center gap-2 rounded-md px-3 py-1.5 text-xs">
              <span className="bg-warning h-1.5 w-1.5 rounded-full" />
              {t('offline.short')}
            </div>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <div className="bg-primary rounded-lg px-3 py-3">
              <p className="text-primary-foreground text-xs opacity-70">
                {t('landing.preview.revenue')}
              </p>
              <p className="font-headings text-primary-foreground text-lg font-bold">142 500</p>
              <p className="text-primary-foreground text-xs opacity-60">{t('common.fcfa')}</p>
            </div>
            {miniKpis.map((c) => (
              <div
                key={c.labelKey}
                className="bg-surface border-border rounded-lg border px-3 py-3"
              >
                <p className="text-muted-foreground text-xs">{t(c.labelKey)}</p>
                <p className="font-headings text-foreground text-lg font-bold">{c.value}</p>
                <p className="text-muted-foreground text-xs">{t(c.unitKey)}</p>
              </div>
            ))}
          </div>

          {/* Mini graphe */}
          <div className="bg-surface border-border flex-1 rounded-lg border px-4 py-3">
            <p className="font-body text-foreground mb-3 text-xs font-semibold">
              {t('landing.preview.weekSales')}
            </p>
            {/* Les barres sont des enfants DIRECTS de la rangée h-16 : une
                hauteur en % ne se résout que contre un parent à hauteur
                définie — l'ancien wrapper à hauteur auto les écrasait à 0
                (graphe vide). */}
            <div className="flex h-16 items-end gap-2">
              {weekBars.map((v, i) => (
                <div
                  key={`bar-${i}`}
                  className={`flex-1 rounded-sm ${i === PEAK ? 'bg-primary' : 'bg-primary/50'}`}
                  style={{ height: `${Math.round((v / BARS_MAX) * 100)}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between">
              {weekDays.map((d, i) => (
                <span
                  key={`day-${i}`}
                  className="text-muted-foreground font-body flex-1 text-center text-xs"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
