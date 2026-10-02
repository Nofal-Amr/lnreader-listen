import type { TtsMetadata } from './TtsMetadata';
import type { TtsParagraph } from './TtsParagraph';

/**
 * A whole chapter queued to play automatically after the current one.
 *
 * @see {@linkcode TtsSession.appendChapter}
 */
export interface TtsChapter {
  /** Database id of the chapter, echoed by `addOnChapterChangedListener`. */
  chapterId: string;
  /** Paragraphs in reading order, indexed like the reader WebView. */
  paragraphs: TtsParagraph[];
  /** Media-control metadata shown while this chapter plays. */
  metadata: TtsMetadata;
}
