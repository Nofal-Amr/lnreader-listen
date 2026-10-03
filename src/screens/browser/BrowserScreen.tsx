import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { useIsFocused } from '@react-navigation/native';
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
const CHROME_HIDE_MS = 3_000;

type PageMessage =
  | { type: 'page'; url: string; title: string; ua: string; html: string }
  | { type: 'tap'; text: string }
  | { type: 'visible'; text: string }
  | { type: 'scroll'; dir: 'up' | 'down'; atTop: boolean };

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
 * T2S-style browser: read any page aloud (double-tap a paragraph), follow
 * "next chapter" links automatically (also with the screen off), uBlock-style
 * ad blocking, reader mode, and full-screen OLED-friendly reading.
 */
const BrowserScreen = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const webViewRef = useRef<WebView<object>>(null);
  const tabs = useBrowserStore(s => s.tabs);
  const activeId = useBrowserStore(s => s.activeId);
  const prefs = useBrowserStore(s => s.prefs);
  const tab = useMemo(
    () => tabs.find(t => t.id === activeId) ?? tabs[0],
    [tabs, activeId],
  );
  const chromeHidden = useBrowserChrome(s => s.hidden);

  const [address, setAddress] = useState(tab.url);
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState<WebPage | undefined>();
  const [readerMode, setReaderMode] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const userAgentRef = useRef<string | undefined>(undefined);
  const pendingPlayRef = useRef(false);

  const playerState = usePlayerStore(s => s.state);
  const source = usePlayerStore(s => s.source);
  const webPage = usePlayerStore(s => s.webPage);
  const progressIndex = usePlayerStore(s => s.progress.index);
  const playingThisPage =
    source === 'web' && !!page && webPage?.url === page.url;
  const playing =
    playingThisPage && (playerState === 'playing' || playerState === 'loading');

  const setChromeHidden = useCallback((hidden: boolean) => {
    useBrowserChrome.setState({ hidden });
  }, []);

  // Ad lists: first use and weekly refresh, in the background.
  useEffect(() => {
    void ensureAdblockLists();
  }, []);

  // Full immersion: hide status and navigation bars while the tab is shown.
  useEffect(() => {
    if (!focused) return;
    const hide = prefs.fullscreen && chromeHidden;
    StatusBar.setHidden(hide);
    SystemBars.setHidden(hide);
    return () => {
      StatusBar.setHidden(false);
      SystemBars.setHidden(false);
      useBrowserChrome.setState({ hidden: false });
    };
  }, [focused, prefs.fullscreen, chromeHidden]);

  // Android back: go back in the page history first.
  useEffect(() => {
    if (!focused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (readerMode) {
        setReaderMode(false);
        return true;
      }
      if (canGoBack) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [focused, canGoBack, readerMode]);

  // Stalled-load notice instead of an endless spinner.
  useEffect(() => {
    if (!loading) {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(timer);
  }, [loading, tab.url]);

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
        if (event.type === 'page' && focused) {
          setReaderMode(false);
          browserActions.visited(event.page.url, event.page.title);
          setAddress(event.page.url);
        } else if (event.type === 'blocked') {
          setNotice(event.reason);
        }
      }),
    [focused],
  );

  useEffect(() => {
    if (!editing) setAddress(tab.url);
  }, [tab.url, editing]);

  const navigate = useCallback((url: string) => {
    setReaderMode(false);
    browserActions.visited(url, url);
  }, []);

  const startListening = useCallback(
    (index: number, current?: WebPage) => {
      const target = current ?? page;
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
          const extracted = extractWebPage(
            message.html,
            message.url,
            getCleanerOptions(),
          );
          // Reader mode keeps the original page's title/links.
          setPage(prev =>
            readerMode && prev
              ? { ...prev, paragraphs: extracted.paragraphs }
              : extracted,
          );
          if (!readerMode) browserActions.visited(message.url, message.title);
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
          if (!prefs.fullscreen) return;
          setChromeHidden(message.dir === 'down' && !message.atTop);
          break;
        }
      }
    },
    [page, prefs.fullscreen, readerMode, setChromeHidden, startListening],
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

  // Auto-hide the floating controls again after a tap brings them back.
  useEffect(() => {
    if (!prefs.fullscreen || chromeHidden || editing || menuOpen) return;
    const timer = setTimeout(() => setChromeHidden(true), CHROME_HIDE_MS * 2);
    return () => clearTimeout(timer);
  }, [chromeHidden, editing, menuOpen, prefs.fullscreen, setChromeHidden]);

  const source_ = useMemo<WebViewSource>(
    () =>
      readerMode && page
        ? { html: readerModeHtml(page, prefs.darkPages), baseUrl: page.url }
        : { uri: tab.url },
    [readerMode, page, prefs.darkPages, tab.url],
  );

  const barsVisible = !prefs.fullscreen || !chromeHidden;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {barsVisible ? (
        <View
          style={[
            styles.topBar,
            {
              backgroundColor: theme.surface2 ?? theme.surface,
              paddingTop: insets.top + 6,
            },
          ]}
        >
          <IconButton
            icon="arrow-left"
            label="Back"
            disabled={!canGoBack}
            onPress={() => webViewRef.current?.goBack()}
            color={theme.onSurface}
          />
          <TextInput
            value={address}
            onChangeText={setAddress}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            onSubmitEditing={() => {
              setEditing(false);
              navigate(toUrl(address));
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
              {
                color: theme.onSurface,
                backgroundColor: theme.surfaceVariant,
              },
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
      ) : null}

      {loading ? (
        <View
          style={[
            styles.progressTrack,
            { backgroundColor: theme.surfaceVariant },
          ]}
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

      {stalled ? (
        <View
          style={[styles.banner, { backgroundColor: theme.errorContainer }]}
        >
          <Text style={[styles.bannerText, { color: theme.onErrorContainer }]}>
            Still loading…
          </Text>
          <Pressable onPress={() => webViewRef.current?.reload()}>
            <Text style={[styles.bannerAction, { color: theme.primary }]}>
              Retry
            </Text>
          </Pressable>
          {page?.paragraphs.length ? (
            <Pressable onPress={() => setReaderMode(true)}>
              <Text style={[styles.bannerAction, { color: theme.primary }]}>
                Reader mode
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {notice ? (
        <Pressable
          onPress={() => setNotice(null)}
          style={[styles.banner, { backgroundColor: theme.surfaceVariant }]}
        >
          <Text style={[styles.bannerText, { color: theme.onSurfaceVariant }]}>
            {notice}
          </Text>
          <Icon name="close" size={18} color={theme.onSurfaceVariant} />
        </Pressable>
      ) : null}

      <WebView
        key={tab.id}
        ref={webViewRef}
        source={source_}
        style={styles.webview}
        injectedJavaScript={PAGE_SCRIPT}
        onMessage={onMessage}
        forceDarkOn={prefs.darkPages}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        allowsBackForwardNavigationGestures
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
          if (!readerMode && nav.url && !editing) setAddress(nav.url);
        }}
        onShouldStartLoadWithRequest={(request: ShouldStartLoadRequest) => {
          // Links tapped inside Reader mode open the real page.
          if (readerMode && request.navigationType === 'click') {
            navigate(request.url);
            return false;
          }
          return true;
        }}
      />

      {barsVisible || playing ? (
        <View
          style={[
            styles.listenPill,
            {
              backgroundColor: theme.surfaceVariant,
              bottom: 16 + (barsVisible ? 0 : insets.bottom),
            },
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
      ) : null}

      {!barsVisible ? (
        // Invisible strip: tapping the top edge brings the bars back.
        <Pressable
          style={[styles.revealStrip, { height: insets.top + 24 }]}
          onPress={() => setChromeHidden(false)}
        />
      ) : null}

      <BrowserMenu
        visible={menuOpen}
        onDismiss={() => setMenuOpen(false)}
        page={page}
        currentUrl={tab.url}
        readerMode={readerMode}
        setReaderMode={setReaderMode}
        canGoForward={canGoForward}
        onForward={() => webViewRef.current?.goForward()}
        onReload={() => webViewRef.current?.reload()}
        onOpen={url => {
          setMenuOpen(false);
          navigate(url);
        }}
        onNotice={setNotice}
      />
    </View>
  );
};

export default BrowserScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
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
  progressTrack: { height: 3 },
  progressFill: { height: 3 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerText: { flex: 1, fontSize: 14 },
  bannerAction: { fontWeight: '600', marginStart: 16 },
  webview: { flex: 1 },
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
