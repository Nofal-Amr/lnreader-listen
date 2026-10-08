import { shortenFullStops } from '../textPipeline';

describe('shortenFullStops', () => {
  it('swaps mid-paragraph full stops for a shorter stop, same length', () => {
    const text = 'He left. "Go now." She said. Why? Fine!';
    const out = shortenFullStops(text);
    expect(out).toBe('He left; "Go now;" She said; Why? Fine!');
    expect(out).toHaveLength(text.length);
  });

  it('keeps abbreviations, numbers, ellipses and the final stop', () => {
    expect(shortenFullStops('Mr. Smith paid 3.5 gold... Then left.')).toBe(
      'Mr. Smith paid 3.5 gold... Then left.',
    );
  });
});
