import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import type {
  ShouldStartLoadRequest,
  WebViewNavigation,
  WebViewProgressEvent,
  WebViewSource,
} from 'react-native-webview/lib/WebViewTypes';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SystemBars } from 'react-native-edge-to-edge';
import Icon from '@react-native-vector-icons/material-design-icons';

import { useTheme } from '@hooks/persisted';
import type { MaterialDesignIconName } from '@type/icon';
import { cosmeticCssFor, ensureAdblockLists } from '@services/browser/adblock';
import {
  browserActions,
  toUrl,
  useBrowserChrome,
  useBrowserStore,
} from '@services/browser/browserStore';
import { extractWebPage, type WebPage } from '@services/browser/extractWebPage';
import { findParagraphIndex, PAGE_SCRIPT } from '@services/browser/pageScript';
import { hostOf, webListenQueue } from '@services/browser/webListenQueue';
import { getCleanerOptions } from '@services/listen/textPipeline';
import {
  playWebPage,
  runPlayerCommand,
  usePlayerStore,
} from '@services/listen/playerStore';

import BrowserMenu from './BrowserMenu';
import { readerModeHtml } from './readerModeHtml';

const STALL_MS = 10_000;
const CHROME_HIDE_MS = 4_000;
const TOOLBAR_HEIGHT = 56;

type PageMessage =
  | { type: 'page'; url: string; title: string; ua: string; html: string }
  | { type: 'tap'; text: string }
  | { type: 'visible'; text: string }
  | { type: 'scroll'; dir: 'up' | 'down'; atTop: boolean };

const SELECTION_MENU = [
  { label: 'Read from here', key: 'readFrom' },
  { label: 'Read selection', key: 'readSelection' },
];

const IconButton = ({
  icon,
  label,
  onPress,
  color,
  disabled,
}: {
  icon: MaterialDesignIconName;
  label: string;
  onPress: () => void;
  color: string;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={8}
    style={[styles.iconButton, disabled && styles.disabled]}
    accessibilityRole="button"
    accessibilityLabel={label}
  >
    <Icon name={icon} size={24} color={color} />
  </Pressable>
);

/**
 * Via-style full-screen browser: the page always fills the screen, the
 * toolbar floats over it and slides away while scrolling, and pages can be
 * read aloud (double-tap, selection menu or the play button) with automatic
 * next-chapter, uBlock-style ad blocking and reader mode.
 */
const BrowserScreen = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const navigation = useNavigation<{ navigate: (name: string) => void }>();
  const webViewRef = useRef<WebView<object>>(null);
  const tabs = useBrowserStore(s => s.tabs);
  const activeId = useBrowserStore(s => s.activeId);
  const prefs = useBrowserStore(s => s.prefs);
  const tab = useMemo(
    () => tabs.find(t => t.id === activeId) ?? tabs[0],
    [tabs, activeId],
  );
  const chromeHidden = useBrowserChrome(s => s.hidden);
  const immersive = prefs.fullscreen;

  // What the WebView loads. Only explicit navigation changes it: recording
  // visits must never feed back into the source (that reloaded every page).
  const [sourceUrl, setSourceUrl] = useState(tab.url);
  const [loadNonce, setLoadNonce] = useState(0);
  const [readerHtml, setReaderHtml] = useState<string | null>(null);
  const [address, setAddress] = useState(tab.url);
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState<WebPage | undefined>();
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const userAgentRef = useRef<string | undefined>(undefined);
  const pendingPlayRef = useRef(false);
  const toolbarShift = useRef(new Animated.Value(0)).current;

  const playerState = usePlayerStore(s => s.state);
  const source = usePlayerStore(s => s.source);
  const webPage = usePlayerStore(s => s.webPage);
  const progressIndex = usePlayerStore(s => s.progress.index);
  const playingThisPage =
    source === 'web' && !!page && webPage?.url === page.url;
  const playing =
    playingThisPage && (playerState === 'playing' || playerState === 'loading');

  const toolbarVisible = !immersive || !chromeHidden || editing || menuOpen;
  const setChromeHidden = useCallback((hidden: boolean) => {
    useBrowserChrome.setState({ hidden });
  }, []);

  const openUrl = useCallback((url: string) => {
    setReaderHtml(null);
    setSourceUrl(url);
    setLoadNonce(n => n + 1);
    setAddress(url);
  }, []);

  // Switching tabs opens that tab's page.
  useEffect(() => {
    openUrl(
      useBrowserStore.getState().tabs.find(t => t.id === activeId)?.url ??
        tab.url,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    void ensureAdblockLists();
  }, []);

  // Full screen while the Browser is shown: no status or navigation bar.
  useEffect(() => {
    if (!focused) return;
    StatusBar.setHidden(immersive);
    SystemBars.setHidden(immersive);
    return () => {
      StatusBar.setHidden(false);
      SystemBars.setHidden(false);
    };
  }, [focused, immersive]);

  // Toolbar slides over the page; the page itself never resizes.
  useEffect(() => {
    Animated.timing(toolbarShift, {
      toValue: toolbarVisible ? 0 : -(TOOLBAR_HEIGHT + insets.top + 8),
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [toolbarVisible, toolbarShift, insets.top]);

  // Bring the toolbar back briefly, then let it slide away again.
  useEffect(() => {
    if (!immersive || chromeHidden || editing || menuOpen) return;
    const timer = setTimeout(() => setChromeHidden(true), CHROME_HIDE_MS);
    return () => clearTimeout(timer);
  }, [chromeHidden, editing, menuOpen, immersive, setChromeHidden]);

  useEffect(() => {
    if (!focused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (readerHtml) {
        setReaderHtml(null);
        return true;
      }
      if (canGoBack) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [focused, canGoBack, readerHtml]);

  useEffect(() => {
    if (!loading) {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(timer);
  }, [loading, loadNonce]);

  // Highlight the paragraph being read, and follow it.
  useEffect(() => {
    if (!playingThisPage || !webPage) return;
    const text = webPage.paragraphs[progressIndex];
    if (!text) return;
    webViewRef.current?.injectJavaScript(
      `window.__lnl && window.__lnl.highlight(${JSON.stringify(text)}, ${
        prefs.followReading
      }); true;`,
    );
  }, [playingThisPage, webPage, progressIndex, prefs.followReading]);

  // When listening moves on to the next page, show it.
  useEffect(
    () =>
      webListenQueue.subscribe(event => {
        if (event.type === 'page') {
          browserActions.visited(event.page.url, event.page.title);
          if (focused) openUrl(event.page.url);
        } else {
          setNotice(event.reason);
        }
      }),
    [focused, openUrl],
  );

  const startListening = useCallback(
    (index: number, target: WebPage | undefined = page) => {
      if (!target) return;
      if (!target.paragraphs.length) {
        setNotice('No readable text was found on this page.');
        return;
      }
      void playWebPage(target, Math.max(0, index), userAgentRef.current);
    },
    [page],
  );

  const onMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      let message: PageMessage;
      try {
        message = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      switch (message.type) {
        case 'page': {
          userAgentRef.current = message.ua;
          usePlayerStore.setState({ userAgent: message.ua });
          if (readerHtml) return; // reader mode shows a page we made
          setPage(
            extractWebPage(message.html, message.url, getCleanerOptions()),
          );
          browserActions.visited(message.url, message.title);
          const css = await cosmeticCssFor(hostOf(message.url));
          if (css) {
            webViewRef.current?.injectJavaScript(
              `window.__lnl && window.__lnl.css(${JSON.stringify(css)}); true;`,
            );
          }
          break;
        }
        case 'tap': {
          if (!page) return;
          const index = findParagraphIndex(page.paragraphs, message.text);
          if (index >= 0) startListening(index);
          break;
        }
        case 'visible': {
          if (!pendingPlayRef.current || !page) return;
          pendingPlayRef.current = false;
          startListening(
            Math.max(0, findParagraphIndex(page.paragraphs, message.text)),
          );
          break;
        }
        case 'scroll': {
          if (!immersive) return;
          setChromeHidden(message.dir === 'down' && !message.atTop);
          break;
        }
      }
    },
    [immersive, page, readerHtml, setChromeHidden, startListening],
  );

  const onSelectionMenu = useCallback(
    (event: { nativeEvent: { key: string; selectedText: string } }) => {
      const { key, selectedText } = event.nativeEvent;
      const text = selectedText?.trim();
      if (!text) return;
      if (key === 'readSelection' || !page) {
        void playWebPage(
          {
            url: `${page?.url ?? sourceUrl}#selection`,
            title: 'Selection',
            paragraphs: text
              .split(/\n+/)
              .map(t => t.trim())
              .filter(Boolean),
          },
          0,
          userAgentRef.current,
        );
        return;
      }
      const index = findParagraphIndex(page.paragraphs, text);
      startListening(index >= 0 ? index : 0);
    },
    [page, sourceUrl, startListening],
  );

  const onListenPress = () => {
    if (playingThisPage) {
      void runPlayerCommand(playing ? 'pause' : 'play');
      return;
    }
    pendingPlayRef.current = true;
    webViewRef.current?.injectJavaScript(
      'window.__lnl && window.__lnl.firstVisible(); true;',
    );
  };

  const webSource = useMemo<WebViewSource>(
    () =>
      readerHtml
        ? { html: readerHtml, baseUrl: page?.url ?? sourceUrl }
        : { uri: sourceUrl },
    // loadNonce forces a fresh load when the same URL is opened again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readerHtml, sourceUrl, loadNonce],
  );

  const toolbar = (
    <View
      style={[
        styles.toolbar,
        {
          backgroundColor: theme.surface2 ?? theme.surface,
          paddingTop: (immersive ? 0 : insets.top) + 6,
        },
      ]}
    >
      <IconButton
        icon="home-outline"
        label="Library"
        onPress={() => navigation.navigate('Library')}
        color={theme.onSurface}
      />
      <IconButton
        icon="arrow-left"
        label="Back"
        disabled={!canGoBack && !readerHtml}
        onPress={() =>
          readerHtml ? setReaderHtml(null) : webViewRef.current?.goBack()
        }
        color={theme.onSurface}
      />
      <TextInput
        value={address}
        onChangeText={setAddress}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onSubmitEditing={() => {
          setEditing(false);
          openUrl(toUrl(address));
        }}
        selectTextOnFocus
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        placeholder="Search or type a web address"
        placeholderTextColor={theme.onSurfaceVariant}
        style={[
          styles.address,
          { color: theme.onSurface, backgroundColor: theme.surfaceVariant },
        ]}
      />
      <Pressable
        onPress={() => setMenuOpen(true)}
        style={[styles.tabCount, { borderColor: theme.onSurface }]}
        accessibilityLabel="Tabs and menu"
      >
        <Text style={{ color: theme.onSurface }}>{tabs.length}</Text>
      </Pressable>
      <IconButton
        icon="dots-vertical"
        label="Menu"
        onPress={() => setMenuOpen(true)}
        color={theme.onSurface}
      />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: '#000' }]}>
      {!immersive ? toolbar : null}

      <WebView
        key={tab.id}
        ref={webViewRef}
        source={webSource}
        style={styles.webview}
        containerStyle={styles.webview}
        injectedJavaScript={PAGE_SCRIPT}
        onMessage={onMessage}
        menuItems={SELECTION_MENU}
        onCustomMenuSelection={onSelectionMenu}
        forceDarkOn={prefs.darkPages}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        onLoadStart={() => {
          setLoading(true);
          setProgress(0);
        }}
        onLoadProgress={(e: WebViewProgressEvent) =>
          setProgress(e.nativeEvent.progress)
        }
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(nav: WebViewNavigation) => {
          setCanGoBack(nav.canGoBack);
          setCanGoForward(nav.canGoForward);
          if (!readerHtml && nav.url && !editing) setAddress(nav.url);
        }}
        onShouldStartLoadWithRequest={(request: ShouldStartLoadRequest) => {
          // Links tapped inside Reader mode open the real page.
          if (readerHtml && request.navigationType === 'click') {
            openUrl(request.url);
            return false;
          }
          return true;
        }}
      />

      {immersive ? (
        <Animated.View
          style={[
            styles.overlay,
            {
              paddingTop: insets.top,
              transform: [{ translateY: toolbarShift }],
            },
          ]}
          pointerEvents={toolbarVisible ? 'box-none' : 'none'}
        >
          {toolbar}
        </Animated.View>
      ) : null}

      {loading ? (
        <View
          style={[
            styles.progressTrack,
            { top: immersive ? 0 : undefined, backgroundColor: 'transparent' },
          ]}
          pointerEvents="none"
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.max(5, progress * 100)}%`,
                backgroundColor: stalled ? theme.error : theme.primary,
              },
            ]}
          />
        </View>
      ) : null}

      {stalled || notice ? (
        <Pressable
          onPress={() => setNotice(null)}
          style={[
            styles.banner,
            {
              backgroundColor: stalled
                ? theme.errorContainer
                : theme.surfaceVariant,
              top: (toolbarVisible ? TOOLBAR_HEIGHT : 0) + insets.top + 8,
            },
          ]}
        >
          <Text style={[styles.bannerText, { color: theme.onSurfaceVariant }]}>
            {stalled ? 'Still loading…' : notice}
          </Text>
          {stalled ? (
            <>
              <Pressable onPress={() => webViewRef.current?.reload()}>
                <Text style={[styles.bannerAction, { color: theme.primary }]}>
                  Retry
                </Text>
              </Pressable>
              {page?.paragraphs.length ? (
                <Pressable
                  onPress={() =>
                    setReaderHtml(readerModeHtml(page, prefs.darkPages))
                  }
                >
                  <Text style={[styles.bannerAction, { color: theme.primary }]}>
                    Reader mode
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <Icon name="close" size={18} color={theme.onSurfaceVariant} />
          )}
        </Pressable>
      ) : null}

      <View
        style={[
          styles.listenPill,
          { backgroundColor: theme.surfaceVariant, bottom: 16 + insets.bottom },
          !toolbarVisible && !playing && styles.pillFaded,
        ]}
      >
        {playingThisPage ? (
          <IconButton
            icon="rewind"
            label="Rewind"
            onPress={() => void runPlayerCommand('previous')}
            color={theme.onSurface}
          />
        ) : null}
        <Pressable
          onPress={onListenPress}
          style={[styles.listenButton, { backgroundColor: theme.primary }]}
          accessibilityLabel={playing ? 'Pause' : 'Read this page aloud'}
        >
          <Icon
            name={playing ? 'pause' : 'play'}
            size={30}
            color={theme.onPrimary}
          />
        </Pressable>
        {playingThisPage ? (
          <IconButton
            icon="fast-forward"
            label="Forward"
            onPress={() => void runPlayerCommand('next')}
            color={theme.onSurface}
          />
        ) : null}
      </View>

      {immersive && !toolbarVisible ? (
        // Invisible strip: tapping the top edge brings the toolbar back.
        <Pressable
          style={[styles.revealStrip, { height: insets.top + 28 }]}
          onPress={() => setChromeHidden(false)}
        />
      ) : null}

      <BrowserMenu
        visible={menuOpen}
        onDismiss={() => setMenuOpen(false)}
        page={page}
        currentUrl={sourceUrl}
        readerMode={!!readerHtml}
        setReaderMode={on =>
          setReaderHtml(
            on && page ? readerModeHtml(page, prefs.darkPages) : null,
          )
        }
        canGoForward={canGoForward}
        onForward={() => webViewRef.current?.goForward()}
        onReload={() => webViewRef.current?.reload()}
        onOpen={url => {
          setMenuOpen(false);
          openUrl(url);
        }}
        onNotice={setNotice}
      />
    </View>
  );
};

export default BrowserScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingBottom: 6,
    minHeight: TOOLBAR_HEIGHT,
  },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, elevation: 4 },
  address: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    fontSize: 15,
    marginHorizontal: 4,
  },
  iconButton: { padding: 6 },
  disabled: { opacity: 0.35 },
  tabCount: {
    minWidth: 26,
    height: 26,
    borderWidth: 1.5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
  },
  progressTrack: { position: 'absolute', left: 0, right: 0, height: 3 },
  progressFill: { height: 3 },
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    elevation: 5,
  },
  bannerText: { flex: 1, fontSize: 14 },
  bannerAction: { fontWeight: '600', marginStart: 16 },
  webview: { flex: 1, backgroundColor: '#000' },
  listenPill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    elevation: 6,
  },
  pillFaded: { opacity: 0.35 },
  listenButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
  },
  revealStrip: { position: 'absolute', top: 0, left: 0, right: 0 },
});
