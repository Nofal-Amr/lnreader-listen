import { Detector } from '../detector';
import { cleanParagraphText } from '../cleanParagraph';
import { fixTitle } from '../fixTitle';

const det = new Detector({ sensitivity: 'normal' });
const clean = (t: string) => cleanParagraphText(det, t);

describe('watermark cleaning (port of epub_cleaner.py)', () => {
  it('removes a whole line that is only a site credit', () => {
    expect(clean('Source: .com, updated by novlove.com')).toBe('');
    expect(clean('Visit freewebnovel.com for the latest chapters.')).toBe('');
  });

  it('removes anti-piracy notices', () => {
    expect(
      clean(
        'If you are reading this on any other site, it has been stolen. Please read it on the original site.',
      ),
    ).toBe('');
  });

  it('removes rating prompts and ad-blocker nags', () => {
    expect(clean('Thanks for reading!')).toBe('');
    expect(
      clean(
        'Ad Blocker Detected Please disable your ad blocker to support our website and continue enjoying free content.',
      ),
    ).toBe('');
  });

  it('removes navigation lines', () => {
    expect(clean('Previous Chapter | Table of Contents | Next Chapter')).toBe(
      '',
    );
  });

  it('cuts an embedded bracketed watermark but keeps the story', () => {
    expect(
      clean('He drew his sword [NovelFull.com] and charged at the beast.'),
    ).toBe('He drew his sword and charged at the beast.');
  });

  it('keeps ordinary narrative and dialogue untouched', () => {
    const story = [
      'An awkward silence filled the faculty office.',
      '“Ah, n-no, I mean—this is…!”',
      'The Amazon river glittered in the morning light.',
      'I smoothly channeled mana into my palm and manifested the framework spell.',
    ];
    for (const line of story) expect(clean(line)).toBe(line);
  });
});

describe('fixTitle', () => {
  it('collapses scraper double numbering', () => {
    expect(fixTitle('Chapter 95: Chapter 94: Eighth Realm')).toBe(
      'Chapter 94: Eighth Realm',
    );
    expect(fixTitle('Chapter 143 - 141 — Sneak')).toBe('Chapter 141: Sneak');
  });

  it('turns "Chapter 7 - Title" into "Chapter 7: Title"', () => {
    expect(fixTitle('Chapter 7 - The Gate')).toBe('Chapter 7: The Gate');
  });

  it('strips characters TTS reads aloud and spells out ampersands', () => {
    expect(fixTitle('Chapter 3: “Blood & Iron” *')).toBe(
      'Chapter 3: Blood and Iron',
    );
  });

  it('removes a site tag from a title when given a detector', () => {
    expect(fixTitle('Chapter 12: Ambush - NovelFull', true, det)).toBe(
      'Chapter 12: Ambush',
    );
  });

  it('leaves normal titles alone', () => {
    expect(fixTitle('Chapter 136: Framework (2)')).toBe(
      'Chapter 136: Framework (2)',
    );
  });
});
