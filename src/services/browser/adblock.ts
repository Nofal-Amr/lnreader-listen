import NativeFile from '@modules/native-file';
import { MMKVStorage } from '@utils/mmkv/mmkv';

// The patched WebView (patches/react-native-webview@13.17.0.patch) reads these
// files: blocked hosts and per-site exceptions. Element hiding is injected as
// CSS from cosmetic.json.
const DIR = `${NativeFile.DocumentDirectoryPath}/adblock`;
const HOSTS = `${DIR}/hosts.txt`;
const HOSTS_DISABLED = `${DIR}/hosts.disabled.txt`;
const ALLOW = `${DIR}/allow.txt`;
const COSMETIC = `${DIR}/cosmetic.json`;

const UPDATED_KEY = 'browser.adblock.updatedAt';
const ENABLED_KEY = 'browser.adblock.enabled';
const ALLOW_KEY = 'browser.adblock.allow';
const UPDATE_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_GENERIC_SELECTORS = 1500;

export const FILTER_LISTS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=nohtml&showintro=0&mimetype=plaintext',
];

// Always blocked, so ads are cut even before the first list download.
const BUILT_IN_HOSTS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'googletagservices.com',
  'amazon-adsystem.com',
  'adnxs.com',
  'popads.net',
  'popcash.net',
  'propellerads.com',
  'adsterra.com',
  'exoclick.com',
  'juicyads.com',
  'taboola.com',
  'outbrain.com',
  'mgid.com',
  'revcontent.com',
  'hilltopads.net',
];

// Generic element hiding, including "ad blocker detected" overlays.
const BUILT_IN_SELECTORS = [
  '.adsbygoogle',
  'ins.adsbygoogle',
  '[id^="google_ads"]',
  '[id^="div-gpt-ad"]',
  'iframe[src*="ads"]',
  '.ad-banner',
  '.ad-container',
  '.advertisement',
  '#adblock-overlay',
  '.adblock-overlay',
  '.adblock-notice',
  '[class*="adblock-detect"]',
  '[id*="adblock-detect"]',
];

const HOST_RULE =
  /^\|\|([a-z0-9][a-z0-9.-]*\.[a-z]{2,})\^(?:\$(?:third-party|script|image|popup|subdocument|xmlhttprequest)(?:,(?:third-party|script|image|popup|subdocument|xmlhttprequest))*)?$/;
const PLAIN_HOST = /^([a-z0-9][a-z0-9.-]*\.[a-z]{2,})$/;

/** Hosts from EasyList-style `||host^` rules and plain host lists. */
export const parseNetworkHosts = (text: string): string[] => {
  const out = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().toLowerCase();
    if (!line || line.startsWith('!') || line.startsWith('@@')) continue;
    const rule = HOST_RULE.exec(line) ?? PLAIN_HOST.exec(line);
    if (rule) out.add(rule[1]);
  }
  return [...out];
};

export interface CosmeticRules {
  generic: string[];
  bySite: Record<string, string[]>;
}

// Plain CSS selectors only: no ABP/uBO extended syntax.
const UNSUPPORTED_SELECTOR =
  /:-abp-|:has-text|:xpath|:matches-|:upward|:remove|:style|\+js\(/;

/** `##selector` (generic) and `site.com##selector` element-hiding rules. */
export const parseCosmeticRules = (text: string): CosmeticRules => {
  const generic: string[] = [];
  const bySite: Record<string, string[]> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const at = line.indexOf('##');
    if (at < 0 || line.startsWith('!') || line.includes('#@#')) continue;
    const selector = line.slice(at + 2).trim();
    if (!selector || UNSUPPORTED_SELECTOR.test(selector)) continue;
    const domains = line.slice(0, at);
    if (!domains) {
      if (generic.length < MAX_GENERIC_SELECTORS) generic.push(selector);
      continue;
    }
    for (const domain of domains.split(',')) {
      const d = domain.trim().toLowerCase();
      if (!d || d.startsWith('~')) continue;
      (bySite[d] ??= []).push(selector);
    }
  }
  return { generic, bySite };
};

let cosmetic: CosmeticRules | null = null;

const loadCosmetic = async (): Promise<CosmeticRules> => {
  if (cosmetic) return cosmetic;
  try {
    cosmetic = JSON.parse(await NativeFile.readFile(COSMETIC)) as CosmeticRules;
  } catch {
    cosmetic = { generic: [], bySite: {} };
  }
  return cosmetic;
};

const siteKeys = (host: string) => {
  const parts = host.toLowerCase().split('.');
  const keys: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    keys.push(parts.slice(i).join('.'));
  }
  return keys;
};

/** CSS hiding ad elements on `host` (empty when blocking is off or allowed). */
export const cosmeticCssFor = async (host: string): Promise<string> => {
  if (!isAdblockEnabled() || isSiteAllowed(host)) return '';
  const rules = await loadCosmetic();
  const selectors = [
    ...BUILT_IN_SELECTORS,
    ...rules.generic,
    ...siteKeys(host).flatMap(key => rules.bySite[key] ?? []),
  ];
  // Chunked: one invalid selector only voids its own small group.
  const chunks: string[] = [];
  for (let i = 0; i < selectors.length; i += 50) {
    chunks.push(
      `${selectors.slice(i, i + 50).join(',')}{display:none!important}`,
    );
  }
  return chunks.join('\n');
};

export const isAdblockEnabled = () =>
  MMKVStorage.getBoolean(ENABLED_KEY) ?? true;

const allowedSites = (): string[] => {
  try {
    return JSON.parse(MMKVStorage.getString(ALLOW_KEY) ?? '[]');
  } catch {
    return [];
  }
};

export const isSiteAllowed = (host: string) =>
  siteKeys(host).some(key => allowedSites().includes(key));

/** Turns ad blocking off for one site (and back on). */
export const setSiteAllowed = async (host: string, allowed: boolean) => {
  const site = host.toLowerCase().replace(/^www\./, '');
  const list = allowedSites().filter(s => s !== site);
  if (allowed) list.push(site);
  MMKVStorage.set(ALLOW_KEY, JSON.stringify(list));
  await NativeFile.mkdir(DIR).catch(() => undefined);
  await NativeFile.writeFile(ALLOW, list.join('\n'));
};

export const setAdblockEnabled = async (enabled: boolean) => {
  MMKVStorage.set(ENABLED_KEY, enabled);
  const [from, to] = enabled
    ? [HOSTS_DISABLED, HOSTS]
    : [HOSTS, HOSTS_DISABLED];
  try {
    await NativeFile.writeFile(to, await NativeFile.readFile(from));
    await NativeFile.unlink(from);
  } catch {
    if (enabled) await updateAdblockLists();
  }
};

/** Downloads EasyList-style lists and writes the files the WebView reads. */
export const updateAdblockLists = async (): Promise<number> => {
  const hosts = new Set(BUILT_IN_HOSTS);
  const merged: CosmeticRules = { generic: [], bySite: {} };
  for (const url of FILTER_LISTS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const text = await res.text();
      parseNetworkHosts(text).forEach(h => hosts.add(h));
      const rules = parseCosmeticRules(text);
      merged.generic.push(...rules.generic);
      for (const [site, sels] of Object.entries(rules.bySite)) {
        (merged.bySite[site] ??= []).push(...sels);
      }
    } catch {
      // Keep whatever lists did download; built-ins always apply.
    }
  }
  await NativeFile.mkdir(DIR).catch(() => undefined);
  await NativeFile.writeFile(
    isAdblockEnabled() ? HOSTS : HOSTS_DISABLED,
    [...hosts].join('\n'),
  );
  await NativeFile.writeFile(COSMETIC, JSON.stringify(merged));
  cosmetic = merged;
  MMKVStorage.set(UPDATED_KEY, Date.now());
  return hosts.size;
};

/** Refreshes the lists weekly (and on first use). Never throws. */
export const ensureAdblockLists = async () => {
  const updated = MMKVStorage.getNumber(UPDATED_KEY) ?? 0;
  const missing =
    !(await NativeFile.exists(HOSTS).catch(() => false)) &&
    !(await NativeFile.exists(HOSTS_DISABLED).catch(() => false));
  if (missing || Date.now() - updated > UPDATE_EVERY_MS) {
    await updateAdblockLists().catch(() => 0);
  }
};

export const adblockUpdatedAt = () => MMKVStorage.getNumber(UPDATED_KEY);
