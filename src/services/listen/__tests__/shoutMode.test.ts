import { applyShoutMode, SHOUT_CLOSE, SHOUT_OPEN } from '../speechRules';

describe('applyShoutMode', () => {
  it('reads shouted runs as normal words', () => {
    expect(applyShoutMode('"DRAG HER AWAY DOG!" He screeched.', 'words')).toBe(
      '"drag her away dog!" He screeched.',
    );
    expect(applyShoutMode('"Now LEAVE. Dog."', 'words')).toBe(
      '"Now leave. Dog."',
    );
  });

  it('keeps short acronyms, I, and Roman numerals', () => {
    expect(
      applyShoutMode('I saw the FBI and OK TV in Henry VIII times.', 'words'),
    ).toBe('I saw the FBI and OK TV in Henry VIII times.');
  });

  it('marks shouting for the online voice in loud mode', () => {
    expect(applyShoutMode('He yelled STOP NOW.', 'loud')).toBe(
      `He yelled ${SHOUT_OPEN}stop now${SHOUT_CLOSE}.`,
    );
  });

  it('can be switched off', () => {
    expect(applyShoutMode('STOP NOW', 'keep')).toBe('STOP NOW');
  });
});
