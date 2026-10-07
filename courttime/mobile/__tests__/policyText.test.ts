import { describe, expect, it } from '@jest/globals';
import { parseWhitelistLines, plainTextToHtml } from '../src/utils/policyText';

describe('policy text helpers', () => {
  it('converts paragraphs, line breaks and bullet blocks to html', () => {
    expect(plainTextToHtml('Rule one\nstill one\n\nRule <two>\n\n- a\n- b')).toBe('<p>Rule one<br>still one</p><p>Rule &lt;two&gt;</p><ul><li>a</li><li>b</li></ul>');
    expect(plainTextToHtml('')).toBe('');
  });
  it('parses whitelist lines with pipe, tab or comma separators', () => {
    expect(parseWhitelistLines('12 Oak St | Smith | smith@x.com | 3\n\n45 Elm Ave\t\tjo@x.com\n7 Pine Rd, Lee, 2')).toEqual([
      { address: '12 Oak St', lastName: 'Smith', email: 'smith@x.com', accountsLimit: 3 },
      { address: '45 Elm Ave', email: 'jo@x.com' },
      { address: '7 Pine Rd', lastName: 'Lee', accountsLimit: 2 },
    ]);
  });
});
