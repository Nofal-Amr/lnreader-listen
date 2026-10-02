import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Tts,
  type TtsSession,
  type TtsSleepTimer,
  type TtsSleepTimerState,
} from '@modules/nitro-tts';

const idle: TtsSleepTimerState = {
  active: false,
  mode: 'minutes',
  remainingMs: 0,
  remainingChapters: 0,
};

/** Live sleep-timer state plus start/cancel, backed by the native player. */
export const useSleepTimer = () => {
  const [state, setState] = useState<TtsSleepTimerState>(idle);
  const sessionRef = useRef<TtsSession | null>(null);

  useEffect(() => {
    let alive = true;
    let subscription: { remove(): void } | undefined;
    Tts.createSession()
      .then(session => {
        if (!alive) return;
        sessionRef.current = session;
        subscription = session.addOnSleepTimerChangedListener(setState);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      subscription?.remove();
    };
  }, []);

  const start = useCallback((timer: TtsSleepTimer) => {
    void sessionRef.current?.setSleepTimer(timer);
  }, []);

  const cancel = useCallback(() => {
    void sessionRef.current?.cancelSleepTimer();
  }, []);

  return { state, start, cancel };
};

/** "12:05" / "1 chapter left" style label for the sleep timer. */
export const formatSleepTimer = (state: TtsSleepTimerState): string => {
  if (!state.active) return 'Off';
  if (state.mode === 'minutes') {
    const totalSeconds = Math.ceil(state.remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')} left`;
  }
  const chapters = state.remainingChapters;
  return chapters === 1 ? 'End of this chapter' : `${chapters} chapters left`;
};
