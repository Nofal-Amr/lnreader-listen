import { dropRepeats } from '../dropRepeats';

describe('dropRepeats', () => {
  it('reads a repeated chapter title only once', () => {
    expect(
      dropRepeats([
        'Chapter 144: Festival Preparations (3)',
        'Chapter 144: Festival Preparations (3)',
        '“Wait, Rine!”',
      ]),
    ).toEqual(['Chapter 144: Festival Preparations (3)', '', '“Wait, Rine!”']);
  });

  it('catches a title written differently or partially', () => {
    expect(
      dropRepeats([
        'Chapter 144 - Festival Preparations (3)',
        'Festival Preparations (3)',
        'Story begins.',
      ]),
    ).toEqual(['Chapter 144 - Festival Preparations (3)', '', 'Story begins.']);
    expect(
      dropRepeats([
        'Chapter 95: Chapter 94: Eighth Realm',
        'Chapter 94: Eighth Realm',
        'Text.',
      ]),
    ).toEqual(['Chapter 95: Chapter 94: Eighth Realm', '', 'Text.']);
  });

  it('drops back-to-back repeats anywhere but keeps indices', () => {
    expect(dropRepeats(['A line.', 'Next.', 'Next.', 'End.'])).toEqual([
      'A line.',
      'Next.',
      '',
      'End.',
    ]);
  });

  it('keeps legitimate repeats that are not adjacent or in the title zone', () => {
    const story = [
      'Title',
      'One.',
      'Two.',
      'Three.',
      'Four.',
      '“No.”',
      'He paused.',
      '“No.”',
    ];
    expect(dropRepeats(story)).toEqual(story);
  });
});
