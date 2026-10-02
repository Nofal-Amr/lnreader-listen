const mockSubscription = { remove: jest.fn() };
const mockTtsSession = {
  load: jest.fn(async () => undefined),
  play: jest.fn(async () => undefined),
  pause: jest.fn(async () => undefined),
  stop: jest.fn(async () => undefined),
  skipPrevious: jest.fn(async () => undefined),
  skipNext: jest.fn(async () => undefined),
  replayCurrent: jest.fn(async () => undefined),
  seekTo: jest.fn(async () => undefined),
  updateSettings: jest.fn(async () => undefined),
  appendChapter: jest.fn(async () => undefined),
  clearUpcoming: jest.fn(async () => undefined),
  addOnChapterChangedListener: jest.fn(() => mockSubscription),
  setSleepTimer: jest.fn(async () => undefined),
  cancelSleepTimer: jest.fn(async () => undefined),
  addOnSleepTimerChangedListener: jest.fn(() => mockSubscription),
  addOnStateChangedListener: jest.fn(() => mockSubscription),
  addOnProgressChangedListener: jest.fn(() => mockSubscription),
  addOnErrorListener: jest.fn(() => mockSubscription),
};

jest.mock('react-native-nitro-modules', () => ({
  __esModule: true,
  NitroModules: {
    createHybridObject: jest.fn(name => {
      if (name === 'TtsFactory') {
        return {
          createSession: jest.fn(async () => mockTtsSession),
          getEngines: jest.fn(async () => []),
          getVoices: jest.fn(async () => []),
          previewVoice: jest.fn(async () => undefined),
        };
      }
      return {
        parseNovelAndChapters: jest.fn(() => global.mockEpubNovel),
      };
    }),
  },
}));
