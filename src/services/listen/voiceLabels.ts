import type { TtsVoice } from '@modules/nitro-tts';

const LANGUAGES: Record<string, string> = {
  ar: 'Arabic',
  bn: 'Bengali',
  de: 'German',
  el: 'Greek',
  en: 'English',
  es: 'Spanish',
  fa: 'Persian',
  fil: 'Filipino',
  fr: 'French',
  he: 'Hebrew',
  hi: 'Hindi',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  ms: 'Malay',
  nl: 'Dutch',
  pl: 'Polish',
  pt: 'Portuguese',
  ro: 'Romanian',
  ru: 'Russian',
  sv: 'Swedish',
  th: 'Thai',
  tr: 'Turkish',
  uk: 'Ukrainian',
  ur: 'Urdu',
  vi: 'Vietnamese',
  zh: 'Chinese',
};
const REGIONS: Record<string, string> = {
  AE: 'UAE',
  AU: 'Australia',
  BR: 'Brazil',
  CA: 'Canada',
  CN: 'China',
  EG: 'Egypt',
  ES: 'Spain',
  FR: 'France',
  GB: 'United Kingdom',
  HK: 'Hong Kong',
  IE: 'Ireland',
  IN: 'India',
  MX: 'Mexico',
  NG: 'Nigeria',
  NZ: 'New Zealand',
  PH: 'Philippines',
  PT: 'Portugal',
  SA: 'Saudi Arabia',
  SG: 'Singapore',
  TW: 'Taiwan',
  US: 'United States',
  ZA: 'South Africa',
};

const displayNames = (type: 'language' | 'region') => {
  try {
    const Ctor = (Intl as any).DisplayNames;
    return Ctor ? new Ctor(['en'], { type }) : null;
  } catch {
    return null;
  }
};
const languageNames = displayNames('language');
const regionNames = displayNames('region');

/** "en-US" / "en_us" / "eng-usa" → "English (United States)". */
export const languageLabel = (code?: string): string => {
  if (!code) return 'Unknown language';
  const [rawLang, rawRegion] = code.replace('_', '-').split('-');
  const lang = rawLang.toLowerCase().slice(0, rawLang.length === 3 ? 3 : 2);
  const region = rawRegion?.toUpperCase();
  let language = LANGUAGES[lang];
  try {
    language ??= languageNames?.of(lang);
  } catch {}
  let place = region ? REGIONS[region] : undefined;
  try {
    if (region && !place && region.length === 2) {
      place = regionNames?.of(region);
    }
  } catch {}
  const name = language ?? lang.toUpperCase();
  return place ? `${name} (${place})` : region ? `${name} (${region})` : name;
};

/**
 * A readable title and detail line for an engine voice, e.g. Google's
 * "en-us-x-iom-local" → "English (United States) · Voice IOM" / "Offline".
 */
export const describeVoice = (
  voice: Pick<TtsVoice, 'name' | 'language' | 'identifier'>,
): { title: string; detail: string } => {
  const raw = voice.name || voice.identifier || '';
  const language = languageLabel(voice.language || raw);
  // Edge / Azure neural voices: "en-US-SteffanNeural" → "Steffan".
  const neural = /-([A-Z][a-z]+)(?:Multilingual)?Neural$/.exec(raw);
  if (neural) return { title: `${neural[1]} · ${language}`, detail: 'Online' };
  // Google: "en-us-x-iom-local" / "en-us-x-iom-network".
  const google = /-x-([a-z0-9]+)-(local|network)$/i.exec(raw);
  if (google) {
    return {
      title: `${language} · Voice ${google[1].toUpperCase()}`,
      detail:
        google[2].toLowerCase() === 'local' ? 'Offline' : 'Needs internet',
    };
  }
  // Google default per language: "en-US-language".
  if (/-language$/i.test(raw)) {
    return { title: `${language} · Default voice`, detail: raw };
  }
  // Samsung: "en-US-SMTl01".
  const samsung = /SMT([a-z])(\d+)/i.exec(raw);
  if (samsung) {
    return {
      title: `${language} · Samsung voice ${samsung[1]}${samsung[2]}`,
      detail: raw,
    };
  }
  // Already a readable name ("Samantha"), or something we don't recognise.
  const readable = /[a-z]{3,}/.test(raw) && !/[-_]/.test(raw);
  return readable
    ? { title: `${raw} · ${language}`, detail: '' }
    : { title: language, detail: raw };
};
