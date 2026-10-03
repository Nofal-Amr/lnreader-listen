import { Tts, type TtsSession } from '@modules/nitro-tts';

let sessionPromise: Promise<TtsSession> | null = null;
let ready: TtsSession | null = null;
const initializers: ((session: TtsSession) => void)[] = [];

/**
 * Runs `init` once on the shared session (immediately if it already exists).
 * Kept separate from playerStore so lightweight callers (and their tests)
 * don't pull in the database layer.
 */
export const onSharedSession = (init: (session: TtsSession) => void) => {
  initializers.push(init);
  if (ready) init(ready);
};

/**
 * The one app-wide TTS session. The reader, the mini player and the full
 * player all drive it, so playback survives leaving the reader.
 */
export const getSharedSession = (): Promise<TtsSession> => {
  if (!sessionPromise) {
    sessionPromise = Tts.createSession()
      .then(session => {
        ready = session;
        initializers.forEach(init => init(session));
        return session;
      })
      .catch(cause => {
        sessionPromise = null;
        throw cause;
      });
  }
  return sessionPromise;
};

let releaseCurrent: (() => void) | null = null;

/**
 * Only one source (library chapters or browser pages) may feed chapters to the
 * shared session; starting one stops the other's queue.
 */
export const claimPlayback = (release: () => void) => {
  if (releaseCurrent && releaseCurrent !== release) releaseCurrent();
  releaseCurrent = release;
};
