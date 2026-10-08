import { load, type AnyNode, type Element } from 'cheerio';

import { judgeParagraph, applyVerdict } from './cleanParagraph';
import { Detector, INVISIBLE_RE, countWords, looksLikeTitle } from './detector';
import { fixTitle } from './fixTitle';
import { splitBrParagraphs } from './splitBrParagraphs';
import type { Sensitivity } from './patterns';
import { ruleRegex, type SpeechRule } from '../speechRules';

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'li',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'td',
  'th',
  'dt',
  'dd',
  'section',
  'article',
  'header',
  'footer',
]);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
// Only the opening blocks can be the chapter's own title line(s).
const TITLE_SCAN_BLOCKS = 3;

export type CleanerOptions = {
  sensitivity: Sensitivity | 'off';
  fixTitles: boolean;
  extraSites?: string[];
  /** Custom remove/replace rules applied to the page text. */
  rules?: SpeechRule[];
  /** Clean chapter files permanently when they are downloaded or imported. */
  cleanOnSave?: boolean;
};

const detectors = new Map<string, Detector>();
const detectorFor = (options: CleanerOptions): Detector | null => {
  if (options.sensitivity === 'off') return null;
  const key = `${options.sensitivity}|${(options.extraSites ?? []).join(',')}`;
  let det = detectors.get(key);
  if (!det) {
    det = new Detector({
      sensitivity: options.sensitivity,
      extraSites: options.extraSites,
    });
    detectors.set(key, det);
  }
  return det;
};

const isElement = (node: AnyNode): node is Element => node.type === 'tag';

const hasBlockDescendant = (el: Element): boolean =>
  el.children.some(
    child =>
      isElement(child) &&
      (BLOCK_TAGS.has(child.name.toLowerCase()) || hasBlockDescendant(child)),
  );

const blockText = (node: AnyNode): string => {
  if (node.type === 'text') return node.data;
  if (!isElement(node)) return '';
  if (node.name.toLowerCase() === 'br') return '\n';
  return node.children.map(blockText).join('');
};

const titleKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Removes site watermarks/spam and repairs the chapter title in chapter HTML.
 * Runs before the reader renders AND before ListenQueue extracts paragraphs,
 * so the reader's paragraph indices and the native TTS queue stay aligned.
 */
/** What one cleaning pass changed, shown in the Clean tab. */
export interface CleanReport {
  removed: number;
  cut: number;
  ruleEdits: number;
  titleFixed: boolean;
  enabled: boolean;
}

export const cleanChapterHtml = (html: string, options: CleanerOptions) =>
  cleanChapterHtmlWithReport(html, options).html;

export const cleanChapterHtmlWithReport = (
  html: string,
  options: CleanerOptions,
): { html: string; report: CleanReport } => {
  // Always on: real paragraphs for chapters that only use <br> line breaks.
  html = splitBrParagraphs(html);
  const report: CleanReport = {
    removed: 0,
    cut: 0,
    ruleEdits: 0,
    titleFixed: false,
    enabled: true,
  };
  const det = detectorFor(options);
  const rules = (options.rules ?? [])
    .filter(rule => rule.enabled !== false)
    .map(rule => [ruleRegex(rule), rule.replace] as const)
    .filter((pair): pair is [RegExp, string] => pair[0] !== null);
  if (!det && !options.fixTitles && !rules.length) {
    return { html, report: { ...report, enabled: false } };
  }
  const $ = load(html, null, false);
  // Strip invisible characters hidden inside watermark names first.
  const stripInvisible = (node: AnyNode) => {
    if (node.type === 'text') node.data = node.data.replace(INVISIBLE_RE, '');
    else if (isElement(node)) node.children.forEach(stripInvisible);
  };
  $.root().contents().toArray().forEach(stripInvisible);

  const leaves: Element[] = [];
  const walk = (node: AnyNode) => {
    if (!isElement(node)) return;
    const name = node.name.toLowerCase();
    if (name === 'script' || name === 'style') return;
    if (BLOCK_TAGS.has(name) && !hasBlockDescendant(node)) {
      leaves.push(node);
      return;
    }
    node.children.forEach(walk);
  };
  $.root()
    .contents()
    .toArray()
    .forEach(node => {
      if (isElement(node)) walk(node);
    });

  if (rules.length) {
    const applyRules = (node: AnyNode) => {
      if (node.type === 'text') {
        let text = node.data;
        for (const [re, replacement] of rules) {
          text = text.replace(re, replacement);
        }
        if (text !== node.data) report.ruleEdits += 1;
        node.data = text;
      } else if (isElement(node)) {
        node.children.forEach(applyRules);
      }
    };
    leaves.forEach(applyRules);
    // A paragraph that was only a removed phrase disappears entirely.
    leaves.forEach(el => {
      if (!blockText(el).trim() && !$(el).find('img').length) $(el).remove();
    });
  }

  if (det) {
    for (const el of leaves) {
      if (el.parent === null) continue;
      const $el = $(el);
      const links = $el
        .find('a[href]')
        .toArray()
        .filter(a => {
          try {
            const host = new URL($(a).attr('href') ?? '').hostname;
            return !!host && det.isSiteHost(host);
          } catch {
            return false;
          }
        });
      if (links.length) {
        if (countWords(blockText(el)) <= 25) {
          report.removed += 1;
          $el.remove();
          continue;
        }
        links.forEach(a => $(a).remove());
      }
      const raw = blockText(el);
      if (!raw.trim()) continue;
      const verdict = judgeParagraph(
        det,
        raw,
        HEADING_TAGS.has(el.name.toLowerCase()),
      );
      if (verdict.action === 'remove') {
        report.removed += 1;
        $el.remove();
      } else if (verdict.action === 'edit') {
        report.cut += 1;
        $el.text(applyVerdict(raw, verdict));
      }
    }
  }

  if (options.fixTitles) {
    let previousKey: string | null = null;
    // Removed nodes are detached (parent === null).
    const opening = leaves
      .filter(el => el.parent !== null)
      .slice(0, TITLE_SCAN_BLOCKS);
    for (const el of opening) {
      const raw = blockText(el).trim();
      if (!raw || !looksLikeTitle(raw)) {
        previousKey = null;
        continue;
      }
      const fixed = fixTitle(raw, true, det ?? undefined);
      const key = titleKey(fixed);
      if (key && key === previousKey) {
        // "Chapter 143 - 141 — Sneak" followed by "Chapter 143: Chapter 141 — Sneak".
        $(el).remove();
        continue;
      }
      if (fixed !== raw) {
        report.titleFixed = true;
        $(el).text(fixed);
      }
      previousKey = key;
    }
  }

  return { html: $.html(), report };
};
