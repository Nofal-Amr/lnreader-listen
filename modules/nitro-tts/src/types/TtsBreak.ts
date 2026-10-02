/** Where a clause or sentence starts inside a paragraph. */
export type TtsBreakKind = 'clause' | 'sentence';

/**
 * A boundary inside a paragraph's text.
 *
 * @see {@linkcode TtsParagraph.breaks}
 */
export interface TtsBreak {
  /** UTF-16 offset of the first character of the next unit. */
  offset: number;
  kind: TtsBreakKind;
}
