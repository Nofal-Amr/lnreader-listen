import { extractTtsParagraphs } from '../extractTtsParagraphs';

describe('extractTtsParagraphs', () => {
  it('returns one entry per readable block, in document order', () => {
    const html =
      '<h1>Chapter 1: Start</h1><p>First <b>bold</b> line.</p><div><p>Nested one.</p><p>Nested two.</p></div>';
    expect(extractTtsParagraphs(html)).toEqual([
      'Chapter 1: Start',
      'First bold line.',
      'Nested one.',
      'Nested two.',
    ]);
  });

  it('drops dash-only separators and empty blocks', () => {
    expect(extractTtsParagraphs('<p>———</p><p> </p><p>Text.</p>')).toEqual([
      'Text.',
    ]);
  });

  it('normalizes whitespace, edge quotes and punctuation spacing', () => {
    expect(extractTtsParagraphs('<p>  “Hello ,  world  !”  </p>')).toEqual([
      'Hello, world!',
    ]);
  });

  it('treats a block with a non-inline child as a container', () => {
    expect(extractTtsParagraphs('<div>Intro<p>Inside.</p></div>')).toEqual([
      'Inside.',
    ]);
  });

  it('reads line breaks as spaces', () => {
    expect(extractTtsParagraphs('<p>One<br>two</p>')).toEqual(['One two']);
  });
});
