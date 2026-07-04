// Pays supportés par la boutique (ISO 3166-1 alpha-2 + indicatif téléphonique).
// Sert à recomposer les numéros WhatsApp : le client saisit son numéro LOCAL et
// l'indicatif du pays de la boutique est préfixé automatiquement. Le Tchad est
// le défaut v1 ; la liste couvre l'Afrique centrale/ouest francophone pour un
// élargissement futur (ajouter une ligne suffit).

export interface Country {
  code: string; // ISO 3166-1 alpha-2 (ex. "TD")
  name: string; // libellé français
  dial: string; // indicatif sans « + » (ex. "235")
  flag: string; // emoji drapeau
}

export const COUNTRIES: Country[] = [
  { code: 'TD', name: 'Tchad', dial: '235', flag: '🇹🇩' },
  { code: 'CM', name: 'Cameroun', dial: '237', flag: '🇨🇲' },
  { code: 'CF', name: 'Centrafrique', dial: '236', flag: '🇨🇫' },
  { code: 'NE', name: 'Niger', dial: '227', flag: '🇳🇪' },
  { code: 'NG', name: 'Nigéria', dial: '234', flag: '🇳🇬' },
  { code: 'SN', name: 'Sénégal', dial: '221', flag: '🇸🇳' },
  { code: 'CI', name: "Côte d'Ivoire", dial: '225', flag: '🇨🇮' },
  { code: 'ML', name: 'Mali', dial: '223', flag: '🇲🇱' },
  { code: 'BF', name: 'Burkina Faso', dial: '226', flag: '🇧🇫' },
  { code: 'BJ', name: 'Bénin', dial: '229', flag: '🇧🇯' },
  { code: 'TG', name: 'Togo', dial: '228', flag: '🇹🇬' },
  { code: 'GN', name: 'Guinée', dial: '224', flag: '🇬🇳' },
  { code: 'GA', name: 'Gabon', dial: '241', flag: '🇬🇦' },
  { code: 'CG', name: 'Congo', dial: '242', flag: '🇨🇬' },
  { code: 'CD', name: 'RD Congo', dial: '243', flag: '🇨🇩' },
  { code: 'MR', name: 'Mauritanie', dial: '222', flag: '🇲🇷' },
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
