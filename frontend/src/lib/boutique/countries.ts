// Pays supportés par la boutique (ISO 3166-1 alpha-2 + indicatif téléphonique).
// Sert à recomposer les numéros WhatsApp : le client saisit son numéro LOCAL et
// l'indicatif du pays de la boutique est préfixé automatiquement. Le Tchad est
// le défaut v1 ; la liste couvre l'Afrique centrale/ouest francophone pour un
// élargissement futur (ajouter une ligne suffit).

import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';

export interface Country {
  code: string; // ISO 3166-1 alpha-2 (ex. "TD")
  name: Record<Locale, string>; // libellé traduit (fr/en/ar)
  dial: string; // indicatif sans « + » (ex. "235")
  flag: string; // emoji drapeau
}

export const COUNTRIES: Country[] = [
  { code: 'TD', name: { fr: 'Tchad', en: 'Chad', ar: 'تشاد' }, dial: '235', flag: '🇹🇩' },
  {
    code: 'CM',
    name: { fr: 'Cameroun', en: 'Cameroon', ar: 'الكاميرون' },
    dial: '237',
    flag: '🇨🇲',
  },
  {
    code: 'CF',
    name: { fr: 'Centrafrique', en: 'Central African Rep.', ar: 'أفريقيا الوسطى' },
    dial: '236',
    flag: '🇨🇫',
  },
  { code: 'NE', name: { fr: 'Niger', en: 'Niger', ar: 'النيجر' }, dial: '227', flag: '🇳🇪' },
  { code: 'NG', name: { fr: 'Nigéria', en: 'Nigeria', ar: 'نيجيريا' }, dial: '234', flag: '🇳🇬' },
  { code: 'SN', name: { fr: 'Sénégal', en: 'Senegal', ar: 'السنغال' }, dial: '221', flag: '🇸🇳' },
  {
    code: 'CI',
    name: { fr: "Côte d'Ivoire", en: 'Ivory Coast', ar: 'ساحل العاج' },
    dial: '225',
    flag: '🇨🇮',
  },
  { code: 'ML', name: { fr: 'Mali', en: 'Mali', ar: 'مالي' }, dial: '223', flag: '🇲🇱' },
  {
    code: 'BF',
    name: { fr: 'Burkina Faso', en: 'Burkina Faso', ar: 'بوركينا فاسو' },
    dial: '226',
    flag: '🇧🇫',
  },
  { code: 'BJ', name: { fr: 'Bénin', en: 'Benin', ar: 'بنين' }, dial: '229', flag: '🇧🇯' },
  { code: 'TG', name: { fr: 'Togo', en: 'Togo', ar: 'توغو' }, dial: '228', flag: '🇹🇬' },
  { code: 'GN', name: { fr: 'Guinée', en: 'Guinea', ar: 'غينيا' }, dial: '224', flag: '🇬🇳' },
  { code: 'GA', name: { fr: 'Gabon', en: 'Gabon', ar: 'الغابون' }, dial: '241', flag: '🇬🇦' },
  { code: 'CG', name: { fr: 'Congo', en: 'Congo', ar: 'الكونغو' }, dial: '242', flag: '🇨🇬' },
  {
    code: 'CD',
    name: { fr: 'RD Congo', en: 'DR Congo', ar: 'الكونغو الديمقراطية' },
    dial: '243',
    flag: '🇨🇩',
  },
  {
    code: 'MR',
    name: { fr: 'Mauritanie', en: 'Mauritania', ar: 'موريتانيا' },
    dial: '222',
    flag: '🇲🇷',
  },
];

export const DEFAULT_COUNTRY = 'TD';

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** Pays par code ISO — retombe sur le défaut (Tchad) si inconnu/absent. */
export function countryByCode(code: string | null | undefined): Country {
  return (code && BY_CODE.get(code)) || BY_CODE.get(DEFAULT_COUNTRY)!;
}

/** Indicatif (sans « + ») du pays de la boutique. */
export function dialCodeFor(code: string | null | undefined): string {
  return countryByCode(code).dial;
}

/** Libellé traduit d'un pays dans la langue demandée. */
export function countryName(country: Country, locale: Locale): string {
  return country.name[locale] ?? country.name[DEFAULT_LOCALE];
}
