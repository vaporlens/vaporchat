/**
 * Steam's language ids by a locale's language, or language and script or region where Steam
 * has variants: the index of a language in Steam's per-language lists (`localized_summary`,
 * a sale section's texts…), english first.
 */
const IDS: Record<string, number> = {
  en: 0,
  de: 1,
  fr: 2,
  it: 3,
  ko: 4,
  es: 5,
  zh: 6,
  'zh-hans': 6,
  'zh-hant': 7,
  'zh-tw': 7,
  'zh-hk': 7,
  'zh-mo': 7,
  ru: 8,
  th: 9,
  ja: 10,
  pt: 11,
  pl: 12,
  da: 13,
  nl: 14,
  fi: 15,
  no: 16,
  nb: 16,
  nn: 16,
  sv: 17,
  hu: 18,
  cs: 19,
  ro: 20,
  tr: 21,
  'pt-br': 22,
  bg: 23,
  el: 24,
  ar: 25,
  uk: 26,
  vi: 28,
  id: 30,
};
// steam's latin american spanish, for every region but spain
const LATAM_SPANISH = 27;

/** Steam's language id for a BCP 47 locale (`de-DE`, `pt-BR`), english (0) when Steam has none. */
export function steamLanguage(locale: string) {
  const [language = '', ...tags] = locale.toLowerCase().split(/[-_]/);
  if (language === 'es' && tags.length > 0 && !tags.includes('es')) {
    return LATAM_SPANISH;
  }
  // the script comes before the region, `zh-Hans-TW` is simplified
  for (const tag of tags) {
    const id = IDS[`${language}-${tag}`];
    if (id !== undefined) return id;
  }
  return IDS[language] ?? 0;
}

/** A per-language list's entry for `language`, the english one when that's missing or empty. */
export function localized(
  list: (string | null)[] | undefined,
  language: number,
) {
  return list?.[language] || list?.[0] || undefined;
}
