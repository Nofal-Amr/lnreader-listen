import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Dialog, List, SegmentedControl } from '@components';
import { useTheme } from '@hooks/persisted';
import {
  adblockUpdatedAt,
  isAdblockEnabled,
  isSiteAllowed,
  setAdblockEnabled,
  setSiteAllowed,
  updateAdblockLists,
} from '@services/browser/adblock';
import {
  browserActions,
  useBrowserStore,
} from '@services/browser/browserStore';
import type { WebPage } from '@services/browser/extractWebPage';
import { hostOf } from '@services/browser/webListenQueue';

type Section = 'menu' | 'tabs' | 'bookmarks' | 'history';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  page?: WebPage;
  currentUrl: string;
  readerMode: boolean;
  setReaderMode: (on: boolean) => void;
  canGoForward: boolean;
  onForward: () => void;
  onReload: () => void;
  onOpen: (url: string) => void;
  onNotice: (text: string) => void;
};

const SECTIONS = [
  { value: 'menu' as const, label: 'Menu' },
  { value: 'tabs' as const, label: 'Tabs' },
  { value: 'bookmarks' as const, label: 'Saved' },
  { value: 'history' as const, label: 'History' },
];

const onOff = (on: boolean) => (on ? 'On' : 'Off');

const BrowserMenu = ({
  visible,
  onDismiss,
  page,
  currentUrl,
  readerMode,
  setReaderMode,
  canGoForward,
  onForward,
  onReload,
  onOpen,
  onNotice,
}: Props) => {
  const theme = useTheme();
  const [section, setSection] = useState<Section>('menu');
  const [, refresh] = useState(0);
  const tabs = useBrowserStore(s => s.tabs);
  const activeId = useBrowserStore(s => s.activeId);
  const bookmarks = useBrowserStore(s => s.bookmarks);
  const history = useBrowserStore(s => s.history);
  const prefs = useBrowserStore(s => s.prefs);

  const host = hostOf(currentUrl);
  const bookmarked = bookmarks.some(b => b.url === currentUrl);
  const adblockOn = isAdblockEnabled();
  const siteAllowed = isSiteAllowed(host);
  const updated = adblockUpdatedAt();

  const close = (action?: () => void) => () => {
    action?.();
    onDismiss();
  };

  const menu = (
    <>
      <List.Item
        title="New tab"
        right="plus"
        onPress={close(() => browserActions.newTab())}
        theme={theme}
      />
      {canGoForward ? (
        <List.Item
          title="Forward"
          right="arrow-right"
          onPress={close(onForward)}
          theme={theme}
        />
      ) : null}
      <List.Item
        title="Reload"
        right="refresh"
        onPress={close(onReload)}
        theme={theme}
      />
      <List.Item
        title={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
        right={bookmarked ? 'bookmark' : 'bookmark-outline'}
        onPress={() =>
          browserActions.toggleBookmark(currentUrl, page?.title ?? currentUrl)
        }
        theme={theme}
      />
      <List.Item
        title={`Reader mode: ${onOff(readerMode)}`}
        description="Just the chapter text, no menus or ads."
        right="book-open-variant"
        onPress={close(() => setReaderMode(!readerMode))}
        theme={theme}
      />
      <List.Item
        title={`Dark pages: ${onOff(prefs.darkPages)}`}
        description="Forces websites dark (best for OLED screens)."
        right="theme-light-dark"
        onPress={() => browserActions.setPrefs({ darkPages: !prefs.darkPages })}
        theme={theme}
      />
      <List.Item
        title={`Full screen: ${onOff(prefs.fullscreen)}`}
        description="Hides all bars while you scroll; tap the top edge to show them."
        right="fullscreen"
        onPress={() =>
          browserActions.setPrefs({ fullscreen: !prefs.fullscreen })
        }
        theme={theme}
      />
      <List.Item
        title={`Follow reading: ${onOff(prefs.followReading)}`}
        description="Scroll the page to the paragraph being read."
        right="arrow-down-bold-circle-outline"
        onPress={() =>
          browserActions.setPrefs({ followReading: !prefs.followReading })
        }
        theme={theme}
      />
      <List.Item
        title={`Block ads: ${onOff(adblockOn)}`}
        description={
          updated
            ? `Filter lists updated ${new Date(updated).toLocaleDateString()}`
            : 'Filter lists download on first use.'
        }
        right="shield-check"
        onPress={async () => {
          await setAdblockEnabled(!adblockOn);
          refresh(n => n + 1);
          onNotice('Reload the page to apply.');
        }}
        theme={theme}
      />
      {adblockOn ? (
        <List.Item
          title={
            siteAllowed ? `Ads allowed on ${host}` : `Blocking ads on ${host}`
          }
          description="Tap to switch for this site only."
          right={siteAllowed ? 'shield-off-outline' : 'shield-outline'}
          onPress={async () => {
            await setSiteAllowed(host, !siteAllowed);
            refresh(n => n + 1);
            onNotice('Reload the page to apply.');
          }}
          theme={theme}
        />
      ) : null}
      <List.Item
        title="Update ad block lists now"
        right="cloud-download-outline"
        onPress={async () => {
          onNotice('Updating ad block lists…');
          const count = await updateAdblockLists().catch(() => 0);
          refresh(n => n + 1);
          onNotice(
            count
              ? `Blocking ${count.toLocaleString()} ad and tracker sites.`
              : 'Could not download the lists. Check the connection.',
          );
        }}
        theme={theme}
      />
      <List.Item
        title="Use this page as home page"
        right="home-outline"
        onPress={() => browserActions.setPrefs({ homepage: currentUrl })}
        theme={theme}
      />
    </>
  );

  const tabList = (
    <>
      {tabs.map(t => (
        <List.Item
          key={t.id}
          title={`${t.id === activeId ? '▶ ' : ''}${t.title || t.url}`}
          description={t.url}
          onPress={close(() => browserActions.selectTab(t.id))}
          theme={theme}
        />
      ))}
      <List.Item
        title="Close current tab"
        right="tab-remove"
        onPress={() => browserActions.closeTab(activeId)}
        theme={theme}
      />
    </>
  );

  const links = (items: { url: string; title: string }[], empty: string) =>
    items.length ? (
      items.map(item => (
        <List.Item
          key={item.url}
          title={item.title || item.url}
          description={item.url}
          onPress={() => onOpen(item.url)}
          theme={theme}
        />
      ))
    ) : (
      <Text style={[styles.empty, { color: theme.onSurfaceVariant }]}>
        {empty}
      </Text>
    );

  return (
    <Dialog.Root visible={visible} onDismiss={onDismiss}>
      <View style={styles.sections}>
        <SegmentedControl
          options={SECTIONS}
          value={section}
          onChange={setSection}
          showCheckIcon={false}
          theme={theme}
        />
      </View>
      <Dialog.ScrollArea>
        <ScrollView style={styles.scroll}>
          {section === 'menu' ? menu : null}
          {section === 'tabs' ? tabList : null}
          {section === 'bookmarks'
            ? links(bookmarks, 'No bookmarks yet.')
            : null}
          {section === 'history' ? (
            <>
              {links(history, 'No history yet.')}
              {history.length ? (
                <List.Item
                  title="Clear history"
                  right="delete-outline"
                  onPress={() => browserActions.clearHistory()}
                  theme={theme}
                />
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions>
        <Dialog.Action onPress={onDismiss}>Close</Dialog.Action>
      </Dialog.Actions>
    </Dialog.Root>
  );
};

export default BrowserMenu;

const styles = StyleSheet.create({
  sections: { paddingHorizontal: 16, paddingBottom: 8 },
  scroll: { maxHeight: 460 },
  empty: { padding: 20, textAlign: 'center' },
});
