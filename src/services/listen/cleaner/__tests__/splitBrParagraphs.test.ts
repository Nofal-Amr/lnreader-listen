import { extractTtsParagraphs } from '../../extractTtsParagraphs';
import { splitBrParagraphs } from '../splitBrParagraphs';

describe('splitBrParagraphs', () => {
  it('splits a <br><br> chapter into paragraphs and keeps single breaks', () => {
    const html =
      '<h3>Chapter 5</h3><div class="bbWrapper">One.<br/>\n<br/>\nTwo <i>a</i>.<br/>line two<br/>\n<br/>\nThree.</div>';
    expect(extractTtsParagraphs(splitBrParagraphs(html))).toEqual([
      'Chapter 5',
      'One.',
      'Two a. line two',
      'Three.',
    ]);
  });

  it('splits single <br> paragraphs when there are no double breaks', () => {
    const html = '<div>A.<br>B.<br>C.<br>D.</div>';
    expect(extractTtsParagraphs(splitBrParagraphs(html))).toEqual([
      'A.',
      'B.',
      'C.',
      'D.',
    ]);
  });

  it('splits a <p> that holds several paragraphs', () => {
    const html = '<p>A.<br><br>B.</p><p>C.</p>';
    expect(extractTtsParagraphs(splitBrParagraphs(html))).toEqual([
      'A.',
      'B.',
      'C.',
    ]);
  });

  it('leaves normal chapters alone', () => {
    const html = '<p>A.</p><p>B.<br>still B.</p>';
    expect(splitBrParagraphs(html)).toBe(html);
  });

  it('splits a SpaceBattles export with "***" divider blocks inside', () => {
    const html = `<h3>Chapter 5</h3><div class="bbWrapper">We arrived.<br/>
<br/>
Tyrion was good company.<br/>
<br/>
<div>***<br/>
​</div>I was escorted to the feast.<br/>
<br/>
Robb was likeable.</div>`;
    expect(extractTtsParagraphs(splitBrParagraphs(html))).toEqual([
      'Chapter 5',
      'We arrived.',
      'Tyrion was good company.',
      expect.stringMatching(/^\*\*\*/),
      'I was escorted to the feast.',
      'Robb was likeable.',
    ]);
  });
});
