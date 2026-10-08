import { load, type AnyNode, type Cheerio, type Element } from 'cheerio';

// Containers that may hold a whole chapter as text separated by <br>.
const CONTAINERS = new Set([
  'div',
  'p',
  'section',
  'article',
  'blockquote',
  'td',
  'body',
]);
const BLOCKS = new Set([
  ...CONTAINERS,
  'ul',
  'ol',
  'li',
  'table',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'pre',
  'hr',
]);

const isElement = (node: AnyNode): node is Element => node.type === 'tag';
const isBr = (node: AnyNode) => isElement(node) && node.name === 'br';
const isBlank = (node: AnyNode) =>
  node.type === 'comment' || (node.type === 'text' && !node.data.trim());

/** Children split at runs of <br>, keeping only runs at least `minRun` long. */
const segments = (children: AnyNode[], minRun: number): AnyNode[][] => {
  const out: AnyNode[][] = [];
  let current: AnyNode[] = [];
  let i = 0;
  while (i < children.length) {
    if (isBr(children[i])) {
      // A run: <br>s with only whitespace between them.
      let j = i;
      let brs = 0;
      while (
        j < children.length &&
        (isBr(children[j]) || isBlank(children[j]))
      ) {
        if (isBr(children[j])) brs += 1;
        j += 1;
      }
      if (brs >= minRun) {
        out.push(current);
        current = [];
        i = j;
        continue;
      }
    }
    current.push(children[i]);
    i += 1;
  }
  out.push(current);
  return out.filter(seg => seg.some(node => !isBlank(node) && !isBr(node)));
};

const runLengths = (children: AnyNode[]) => {
  const runs: number[] = [];
  let run = 0;
  for (const node of children) {
    if (isBr(node)) {
      run += 1;
    } else if (!isBlank(node)) {
      if (run) runs.push(run);
      run = 0;
    }
  }
  return runs;
};

/**
 * Fan-fiction exports (SpaceBattles, FicHub, AO3 and others) often put a
 * whole chapter in one <div> with paragraphs separated only by <br><br>.
 * The reader and read-aloud then see one or two giant "paragraphs": the whole
 * page lights up and Previous/Next jump a whole chapter. This turns each
 * <br>-separated stretch into its own <p>.
 */
export const splitBrParagraphs = (html: string): string => {
  if (!/<br\b/i.test(html)) return html;
  const $ = load(html, null, false);
  let changed = false;

  const minRunFor = (nodes: AnyNode[]) => {
    const runs = runLengths(nodes);
    // Double breaks mark paragraphs; single ones are kept as line breaks.
    // With no double breaks, many single breaks mark the paragraphs.
    return runs.some(r => r >= 2) ? 2 : runs.length >= 3 ? 1 : 0;
  };
  const wrap = (part: AnyNode[]) =>
    `<p>${part
      .map(node => $.html(node))
      .join('')
      .trim()}</p>`;

  const visit = (el: Element) => {
    [...el.children].forEach(child => {
      if (isElement(child)) visit(child);
    });
    if (!CONTAINERS.has(el.name)) return;
    const children = el.children;
    // Inline stretches between nested blocks (e.g. a "***" divider div).
    const stretches: (AnyNode[] | Element)[] = [];
    let inline: AnyNode[] = [];
    for (const child of children) {
      if (isElement(child) && BLOCKS.has(child.name)) {
        stretches.push(inline, child);
        inline = [];
      } else {
        inline.push(child);
      }
    }
    stretches.push(inline);
    const minRun = minRunFor(
      children.filter(c => !(isElement(c) && BLOCKS.has(c.name))),
    );
    const hasBlocks = stretches.length > 1;
    if (!minRun && !hasBlocks) return;
    let pieces = 0;
    const rebuilt = stretches
      .map(stretch => {
        if (!Array.isArray(stretch)) return $.html(stretch);
        const parts = minRun ? segments(stretch, minRun) : [stretch];
        const kept = parts.filter(part =>
          part.some(node => !isBlank(node) && !isBr(node)),
        );
        pieces += kept.length;
        return kept.map(wrap).join('\n');
      })
      .join('\n');
    // Nothing to split: a plain paragraph with a line break or two.
    if (!hasBlocks && pieces < 2) return;
    if (hasBlocks && pieces === 0) return;
    const node: Cheerio<Element> = $(el);
    if (el.name === 'p') node.replaceWith(rebuilt);
    else node.html(rebuilt);
    changed = true;
  };

  $.root()
    .contents()
    .toArray()
    .forEach(node => {
      if (isElement(node)) visit(node);
    });
  // Bare text at the top level (no wrapper element at all).
  const top = $.root().contents().toArray();
  if (!top.some(n => isElement(n) && BLOCKS.has(n.name))) {
    const minRun = minRunFor(top);
    const parts = minRun ? segments(top, minRun) : [];
    if (parts.length >= 2) return parts.map(wrap).join('\n');
  }
  return changed ? $.html() : html;
};
