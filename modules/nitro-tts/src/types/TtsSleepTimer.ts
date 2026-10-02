/** What ends a sleep timer. */
export type TtsSleepTimerMode = 'minutes' | 'endOfChapter' | 'chapters';

/**
 * Pauses playback after a duration or a number of chapters.
 *
 * @see {@linkcode TtsSession.setSleepTimer}
 */
export interface TtsSleepTimer {
  mode: TtsSleepTimerMode;
  /** Minutes for `minutes`, chapters for `chapters`; ignored for `endOfChapter`. */
  value: number;
  /** Shaking the phone while the timer runs adds 10 minutes. */
  shakeToExtend: boolean;
}

/** Live state of the sleep timer. */
export interface TtsSleepTimerState {
  active: boolean;
  mode: TtsSleepTimerMode;
  /** Milliseconds left in `minutes` mode, otherwise 0. */
  remainingMs: number;
  /** Chapter boundaries left before pausing in chapter modes, otherwise 0. */
  remainingChapters: number;
}
