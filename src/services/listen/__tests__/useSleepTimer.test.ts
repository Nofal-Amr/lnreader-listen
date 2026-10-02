import { formatSleepTimer } from '../useSleepTimer';

describe('formatSleepTimer', () => {
  it('shows Off when inactive', () => {
    expect(
      formatSleepTimer({
        active: false,
        mode: 'minutes',
        remainingMs: 0,
        remainingChapters: 0,
      }),
    ).toBe('Off');
  });

  it('formats minutes and seconds left', () => {
    expect(
      formatSleepTimer({
        active: true,
        mode: 'minutes',
        remainingMs: 725_000,
        remainingChapters: 0,
      }),
    ).toBe('12:05 left');
  });

  it('describes chapter modes', () => {
    expect(
      formatSleepTimer({
        active: true,
        mode: 'endOfChapter',
        remainingMs: 0,
        remainingChapters: 1,
      }),
    ).toBe('End of this chapter');
    expect(
      formatSleepTimer({
        active: true,
        mode: 'chapters',
        remainingMs: 0,
        remainingChapters: 3,
      }),
    ).toBe('3 chapters left');
  });
});
