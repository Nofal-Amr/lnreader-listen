type NativeSleep = (ms: number) => Promise<void>;

let nativeSleep: NativeSleep | null | undefined;

// Resolved lazily: the database layer also uses sleep and runs in plain Node
// (tests) where native modules cannot load.
const getNativeSleep = (): NativeSleep | null => {
  if (nativeSleep === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@modules/native-background-tasks');
      const fn = mod?.default?.sleep;
      nativeSleep =
        typeof fn === 'function'
          ? (ms: number) => fn.call(mod.default, ms)
          : null;
    } catch {
      nativeSleep = null;
    }
  }
  return nativeSleep;
};

/**
 * Waits `time` ms. Prefers the native timer: React Native's setTimeout is
 * driven by display frames and stalls with the screen off, which froze
 * background downloads after their first chapter.
 */
export const sleep = (time: number): Promise<void> => {
  const native = getNativeSleep();
  if (native) return native(time);
  return new Promise(resolve => setTimeout(() => resolve(), time));
};
