import type { TtsSkipUnit } from './TtsSkipUnit';

/**
 * Native speech preferences applied to every queued paragraph.
 *
 * @see {@linkcode TtsSession.updateSettings}
 */
export interface TtsSettings {
  /**
   * Android only: engine package name from {@linkcode TtsFactory.getEngines},
   * or the system default when absent. Ignored on iOS.
   */
  engineName?: string;
  /** Platform voice identifier, or the platform default when absent. */
  voiceIdentifier?: string;
  /** Speech-rate multiplier selected by the reader. */
  rate: number;
  /** Voice-pitch multiplier selected by the reader. */
  pitch: number;
  /** Silence after a clause (comma, semicolon, dash). 0 keeps clauses joined. */
  pauseCommaMs?: number;
  /** Silence after a sentence. */
  pauseSentenceMs?: number;
  /** Silence after a paragraph. */
  pauseParagraphMs?: number;
  /** Silence between chapters. */
  pauseChapterMs?: number;
  /** How far rewind moves. Defaults to `clause`. */
  rewindUnit?: TtsSkipUnit;
  /** How far forward moves. Defaults to `sentence`. */
  forwardUnit?: TtsSkipUnit;
  /** Play without taking audio focus, alongside other apps. */
  mixWithOthers?: boolean;
  /** Pause after this many minutes without user interaction; 0 disables. */
  autoPauseMinutes?: number;
  /** Optional Azure Speech key: online voices then use the official API. */
  azureKey?: string;
  /** Azure region for `azureKey`, e.g. `eastus`. */
  azureRegion?: string;
}
