import {
  areTtsSettingsEqual,
  toNativeTtsSettings,
  TTS_DEFAULTS,
} from '../ttsSettings';

describe('toNativeTtsSettings', () => {
  it('fills T2S-style defaults for settings saved by older versions', () => {
    expect(toNativeTtsSettings({ rate: 1.2, pitch: 0.9 })).toEqual({
      engineName: undefined,
      voiceIdentifier: undefined,
      rate: 1.2,
      pitch: 0.9,
      ...TTS_DEFAULTS,
    });
  });

  it('passes engine, voice, pauses and skip units through', () => {
    const native = toNativeTtsSettings({
      engine: { name: 'com.samsung.SMT', label: 'Samsung' },
      voice: { identifier: 'en-us-x-iom-local', name: 'x', language: 'en-US' },
      pauseSentenceMs: 300,
      rewindUnit: 'sentence',
      mixWithOthers: true,
    });
    expect(native).toMatchObject({
      engineName: 'com.samsung.SMT',
      voiceIdentifier: 'en-us-x-iom-local',
      pauseSentenceMs: 300,
      rewindUnit: 'sentence',
      mixWithOthers: true,
    });
  });
});

describe('areTtsSettingsEqual', () => {
  it('detects a pause change', () => {
    expect(
      areTtsSettingsEqual({ rate: 1 }, { rate: 1, pauseParagraphMs: 900 }),
    ).toBe(false);
  });

  it('treats an explicit default as equal to a missing value', () => {
    expect(
      areTtsSettingsEqual({ rate: 1 }, { rate: 1, pauseParagraphMs: 250 }),
    ).toBe(true);
  });

  it('detects reader-only option changes', () => {
    expect(
      areTtsSettingsEqual(
        { autoPageAdvance: false },
        { autoPageAdvance: true },
      ),
    ).toBe(false);
  });
});
