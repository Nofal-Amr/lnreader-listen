import { load, type AnyNode, type Element } from 'cheerio';

// Mirrors `readableNodeNames` and `readable()` in assets/reader/js/core.js.
// Keep in sync: native queue indices must match the WebView's highlight
// indices, otherwise the wrong paragraph lights up after an auto-advance.
const READABLE_NODE_NAMES = new Set([
  '#text',
  'B',
  'I',
  'SPAN',
  'EM',
  'BR',
  'STRONG',
  'A',
  'MARK',
]);

const isElement = (node: AnyNode): node is Element =>
  node.type === 'tag' || node.type === 'script' || node.type === 'style';

const nodeName = (node: AnyNode): string => {
  if (node.type === 'text') return '#text';
  if (isElement(node)) return node.name.toUpperCase();
  return '#other';
};

const isReadable = (el: Element): boolean => {
  const name = nodeName(el);
  if (name !== 'SPAN' && READABLE_NODE_NAMES.has(name)) {
    return false;
  }
  if (el.children.length === 0) {
    return false;
  }
  return el.children.every(child => READABLE_NODE_NAMES.has(nodeName(child)));
};

const DASH_ONLY = /^[\-‐‑‒–—―−⁓⸺⸻﹘﹣－]+$/u;

export const normalizeTtsText = (text: string): string => {
  if (!text) return '';
  const normalized = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s*([.,!?;:])\s*/g, '$1 ')
    .trim();
  const compact = normalized.replace(/\s/g, '');
  if (compact.length >= 3 && DASH_ONLY.test(compact)) {
    return '';
  }
  return normalized;
};

const innerText = (node: AnyNode): string => {
  if (node.type === 'text') return node.data;
  if (!isElement(node)) return '';
  if (node.name.toLowerCase() === 'br') return ' ';
  return node.children.map(innerText).join('');
};

export const extractTtsParagraphs = (html: string): string[] => {
  const $ = load(html);
  const out: string[] = [];
  const traverse = (node: AnyNode) => {
    if (!isElement(node)) return;
    if (isReadable(node)) {
      const text = normalizeTtsText(innerText(node));
      if (text) out.push(text);
      return;
    }
    node.children.forEach(traverse);
  };
  $('body')
    .toArray()
    .forEach(body => body.children.forEach(traverse));
  return out;
};
