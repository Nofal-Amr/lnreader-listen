import { describeVoice, languageLabel } from '../voiceLabels';

describe('voice labels', () => {
  it('names languages', () => {
    expect(languageLabel('en-US')).toBe('English (United States)');
    expect(languageLabel('ar_EG')).toBe('Arabic (Egypt)');
  });

  it('turns engine codes into readable names', () => {
    expect(
      describeVoice({
        name: 'en-us-x-iom-local',
        language: 'en-US',
        identifier: 'x',
      }),
    ).toEqual({
      title: 'English (United States) · Voice IOM',
      detail: 'Offline',
    });
    expect(
      describeVoice({
        name: 'en-US-SteffanNeural',
        language: 'en-US',
        identifier: 'y',
      }),
    ).toEqual({ title: 'Steffan · English (United States)', detail: 'Online' });
    expect(
      describeVoice({
        name: 'en-US-SMTl01',
        language: 'en-US',
        identifier: 'z',
      }).title,
    ).toBe('English (United States) · Samsung voice l01');
  });
});
