/**
 * Injected into every Browser page. It reports the page HTML (the app splits
 * paragraphs with the same code it uses for background pages), double-taps,
 * scroll direction for auto-hiding chrome, and the first visible paragraph;
 * it highlights the paragraph being read and applies ad-hiding CSS.
 *
 * Paragraph matching uses a loose key (letters/digits of the first 60 chars),
 * computed identically by `paragraphKey` in the app.
 */
export const PAGE_SCRIPT = `
(function () {
  if (window.__lnl) { window.__lnl.sendPage(); return; }
  var post = function (m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  var key = function (t) { return (t || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60); };
  var BLOCKS = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,div,td';
  var leaves = function () {
    return Array.prototype.filter.call(document.querySelectorAll(BLOCKS), function (el) {
      return !el.querySelector(BLOCKS) && key(el.innerText).length > 0;
    });
  };
  var blockOf = function (node) {
    var el = node && node.nodeType === 1 ? node : node && node.parentElement;
    while (el && el !== document.body) {
      if (el.matches && el.matches(BLOCKS) && !el.querySelector(BLOCKS)) return el;
      el = el.parentElement;
    }
    return null;
  };
  var last = null;
  window.__lnl = {
    sendPage: function () {
      post({
        type: 'page',
        url: location.href,
        title: document.title,
        ua: navigator.userAgent,
        html: document.documentElement.outerHTML.slice(0, 2000000),
      });
    },
    highlight: function (text, follow) {
      var k = key(text);
      if (last) { last.style.backgroundColor = last.__lnlBg || ''; last = null; }
      if (!k) return;
      var list = leaves();
      for (var i = 0; i < list.length; i++) {
        var lk = key(list[i].innerText);
        if (lk === k || lk.indexOf(k) === 0 || k.indexOf(lk) === 0) {
          last = list[i];
          last.__lnlBg = last.style.backgroundColor;
          last.style.backgroundColor = 'rgba(255, 196, 0, 0.28)';
          if (follow) last.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return;
        }
      }
    },
    css: function (text) {
      var s = document.getElementById('__lnl_css');
      if (!s) {
        s = document.createElement('style');
        s.id = '__lnl_css';
        (document.head || document.documentElement).appendChild(s);
      }
      s.textContent = text;
    },
    firstVisible: function () {
      var list = leaves();
      for (var i = 0; i < list.length; i++) {
        var r = list[i].getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight) {
          post({ type: 'visible', text: list[i].innerText });
          return;
        }
      }
      post({ type: 'visible', text: '' });
    },
  };
  var lastTap = 0;
  document.addEventListener('dblclick', function (e) {
    var el = blockOf(e.target);
    if (el) post({ type: 'tap', text: el.innerText });
  }, true);
  document.addEventListener('touchend', function (e) {
    var now = Date.now();
    if (now - lastTap < 300) {
      var el = blockOf(e.target);
      if (el) post({ type: 'tap', text: el.innerText });
    }
    lastTap = now;
  }, true);
  var lastY = window.scrollY;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    if (Math.abs(y - lastY) > 16) {
      post({ type: 'scroll', dir: y > lastY ? 'down' : 'up', atTop: y < 8 });
      lastY = y;
    }
  }, { passive: true });
  window.__lnl.sendPage();
})();
true;
`;

/** Same key as the page script, so taps and highlights find paragraphs. */
export const paragraphKey = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 60);

/** Index of the paragraph matching text tapped or seen in the page. */
export const findParagraphIndex = (paragraphs: string[], text: string) => {
  const k = paragraphKey(text);
  if (!k) return -1;
  const exact = paragraphs.findIndex(p => {
    const pk = paragraphKey(p);
    return pk === k || pk.startsWith(k) || k.startsWith(pk);
  });
  if (exact >= 0) return exact;
  // A selection from the middle of a paragraph: match on its own letters.
  const inner = text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 40);
  if (inner.length < 8) return -1;
  return paragraphs.findIndex(p =>
    p
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .includes(inner),
  );
};
