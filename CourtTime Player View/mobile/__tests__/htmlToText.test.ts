import { describe, expect, it } from '@jest/globals';
import { htmlToDisplayText, isEmptyHtmlDocument } from '../src/utils/htmlToText';

describe('htmlToDisplayText', () => {
  it('passes plain text through', () => {
    expect(htmlToDisplayText('I accept all risk of injury.')).toBe(
      'I accept all risk of injury.'
    );
  });

  it('separates paragraphs with a blank line and treats <br> as a single break', () => {
    expect(htmlToDisplayText('<p>First clause.</p><p>Second clause.<br>Third line.</p>')).toBe(
      'First clause.\n\nSecond clause.\nThird line.'
    );
  });

  it('bullets list items', () => {
    expect(
      htmlToDisplayText('<ul><li>No glass on court</li><li>Court shoes only</li></ul>')
    ).toBe('• No glass on court\n• Court shoes only');
  });

  it('keeps the text of inline formatting', () => {
    expect(
      htmlToDisplayText('<p>You <strong>must</strong> wear <em>proper</em> shoes.</p>')
    ).toBe('You must wear proper shoes.');
  });

  it('keeps link text', () => {
    expect(htmlToDisplayText('<p>See the <a href="https://x.test">club rules</a>.</p>')).toBe(
      'See the club rules.'
    );
  });

  it('decodes entities, including numeric and hex', () => {
    expect(htmlToDisplayText('Tom &amp; Jerry&rsquo;s &#8212; 5&#xB0;C &nbsp;rule')).toBe(
      "Tom & Jerry’s — 5°C rule"
    );
  });

  it('drops script and style content', () => {
    expect(
      htmlToDisplayText('<p>Real terms.</p><script>alert(1)</script><style>p{color:red}</style>')
    ).toBe('Real terms.');
  });

  it('unwraps unknown tags rather than dropping their text', () => {
    // The rule this file exists for: never lose words the member agrees to.
    expect(htmlToDisplayText('<custom-tag>Binding clause.</custom-tag>')).toBe('Binding clause.');
  });

  it('collapses excess whitespace without gluing words together', () => {
    expect(htmlToDisplayText('<p>A   spaced    clause</p>\n\n\n<p>Next</p>')).toBe(
      'A spaced clause\n\nNext'
    );
  });

  it('handles headings as their own block', () => {
    expect(htmlToDisplayText('<h2>Assumption of Risk</h2><p>Body text.</p>')).toBe(
      'Assumption of Risk\n\nBody text.'
    );
  });

  it('returns empty string for nullish input', () => {
    expect(htmlToDisplayText(null)).toBe('');
    expect(htmlToDisplayText(undefined)).toBe('');
    expect(htmlToDisplayText('')).toBe('');
  });
});

describe('isEmptyHtmlDocument', () => {
  it('treats markup-only documents as empty', () => {
    expect(isEmptyHtmlDocument('<p></p><div><br></div>')).toBe(true);
  });

  it('treats a document with prose as non-empty', () => {
    expect(isEmptyHtmlDocument('<p>Something</p>')).toBe(false);
  });
});
