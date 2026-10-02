import { computeBreaks } from '../computeBreaks';

describe('computeBreaks', () => {
  it('marks sentence starts after terminal punctuation', () => {
    const text = 'One two. Three four! Five?';
    expect(computeBreaks(text)).toEqual([
      { offset: 9, kind: 'sentence' },
      { offset: 21, kind: 'sentence' },
    ]);
  });

  it('marks clause starts after commas, semicolons, colons and dashes', () => {
    const text = 'Well, fine; then: go — now';
    expect(computeBreaks(text)).toEqual([
      { offset: 6, kind: 'clause' },
      { offset: 12, kind: 'clause' },
      { offset: 18, kind: 'clause' },
      { offset: 23, kind: 'clause' },
    ]);
  });

  it('keeps closing quotes with the sentence they end', () => {
    const text = '“Not like you to make a mistake.” Well, fine.';
    expect(computeBreaks(text)).toEqual([
      { offset: 34, kind: 'sentence' },
      { offset: 40, kind: 'clause' },
    ]);
  });

  it('treats an ellipsis as a sentence end', () => {
    expect(computeBreaks('this is... fine')).toEqual([
      { offset: 11, kind: 'sentence' },
    ]);
  });

  it('ignores punctuation not followed by a space', () => {
    expect(computeBreaks('3.14 and 1,000 items')).toEqual([]);
  });

  it('returns nothing for a single unit', () => {
    expect(computeBreaks('Hello there')).toEqual([]);
  });
});
