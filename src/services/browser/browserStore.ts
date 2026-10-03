import { create } from 'zustand';

import { MMKVStorage } from '@utils/mmkv/mmkv';

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
}

export interface BrowserLink {
  url: string;
  title: string;
  at?: number;
}

export interface BrowserPrefs {
  homepage: string;
  /** Force dark rendering of web pages (OLED friendly). */
  darkPages: boolean;
  /** Hide status, navigation and address bars while reading. */
  fullscreen: boolean;
  /** Scroll the page to follow the paragraph being read. */
  followReading: boolean;
}

type BrowserState = {
  tabs: BrowserTab[];
  activeId: string;
  bookmarks: BrowserLink[];
  history: BrowserLink[];
  prefs: BrowserPrefs;
};

const KEY = 'browser.state.v1';
const MAX_HISTORY = 300;
const DEFAULT_HOME = 'https://www.google.com';

const DEFAULT_PREFS: BrowserPrefs = {
  homepage: DEFAULT_HOME,
  darkPages: true,
  fullscreen: true,
  followReading: true,
};

const newId = () => Math.random().toString(36).slice(2, 10);

const initialState = (): BrowserState => {
  try {
    const saved = MMKVStorage.getString(KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as BrowserState;
      if (parsed.tabs?.length) {
        return {
          ...parsed,
          prefs: { ...DEFAULT_PREFS, ...parsed.prefs },
        };
      }
    }
  } catch {
    // Fall through to a fresh state.
  }
  const first = { id: newId(), url: DEFAULT_HOME, title: 'New tab' };
  return {
    tabs: [first],
    activeId: first.id,
    bookmarks: [],
    history: [],
    prefs: DEFAULT_PREFS,
  };
};

export const useBrowserStore = create<BrowserState>(initialState);

useBrowserStore.subscribe(state => {
  MMKVStorage.set(KEY, JSON.stringify(state));
});

const set = useBrowserStore.setState;
const get = useBrowserStore.getState;

export const activeTab = () =>
  get().tabs.find(t => t.id === get().activeId) ?? get().tabs[0];

export const browserActions = {
  /** Records where the active tab is (and adds it to history). */
  visited(url: string, title: string) {
    const { tabs, activeId, history } = get();
    set({
      tabs: tabs.map(t => (t.id === activeId ? { ...t, url, title } : t)),
      history: [
        { url, title, at: Date.now() },
        ...history.filter(h => h.url !== url),
      ].slice(0, MAX_HISTORY),
    });
  },
  newTab(url = get().prefs.homepage) {
    const tab = { id: newId(), url, title: 'New tab' };
    set({ tabs: [...get().tabs, tab], activeId: tab.id });
  },
  selectTab(id: string) {
    set({ activeId: id });
  },
  closeTab(id: string) {
    const tabs = get().tabs.filter(t => t.id !== id);
    if (!tabs.length) {
      const tab = { id: newId(), url: get().prefs.homepage, title: 'New tab' };
      set({ tabs: [tab], activeId: tab.id });
      return;
    }
    set({
      tabs,
      activeId:
        get().activeId === id ? tabs[tabs.length - 1].id : get().activeId,
    });
  },
  toggleBookmark(url: string, title: string) {
    const { bookmarks } = get();
    set({
      bookmarks: bookmarks.some(b => b.url === url)
        ? bookmarks.filter(b => b.url !== url)
        : [{ url, title, at: Date.now() }, ...bookmarks],
    });
  },
  clearHistory() {
    set({ history: [] });
  },
  setPrefs(patch: Partial<BrowserPrefs>) {
    set({ prefs: { ...get().prefs, ...patch } });
  },
};

/** Turns typed text into a URL: adds https:// or searches Google. */
export const toUrl = (input: string): string => {
  const text = input.trim();
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text)) return `https://${text}`;
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
};

/** Not persisted: whether the Browser has hidden its bars for full immersion. */
export const useBrowserChrome = create<{ hidden: boolean }>(() => ({
  hidden: false,
}));
