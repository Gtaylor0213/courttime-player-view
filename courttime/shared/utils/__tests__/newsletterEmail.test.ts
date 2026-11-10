import { describe, expect, it } from 'vitest';
import {
  buildNewsletterEmailHtml,
  parseNewsletterBody,
  renderInline,
  renderNewsletterBodyHtml,
} from '../newsletterEmail';
import { buildAppLaunchEmailHtml } from '../../../src/services/appLaunchEmailTemplate';

describe('newsletter body parsing', () => {
  it('splits paragraphs, headings and bullets', () => {
    const blocks = parseNewsletterBody(`Hello CourtTime Admins,

Intro line one
line two

## New Features

  - **Zoom:** bigger text
  - Requests
    wrap onto a second line
- Third

Best regards,

Reid`);
    expect(blocks).toEqual([
      { kind: 'paragraph', lines: ['Hello CourtTime Admins,'] },
      { kind: 'paragraph', lines: ['Intro line one', 'line two'] },
      { kind: 'heading', text: 'New Features' },
      { kind: 'list', items: ['**Zoom:** bigger text', 'Requests wrap onto a second line', 'Third'] },
      { kind: 'paragraph', lines: ['Best regards,'] },
      { kind: 'paragraph', lines: ['Reid'] },
    ]);
  });

  it('ends a list at an unindented line and handles Windows line breaks', () => {
    expect(parseNewsletterBody('- a\r\n- b\r\nAfter')).toEqual([
      { kind: 'list', items: ['a', 'b'] },
      { kind: 'paragraph', lines: ['After'] },
    ]);
  });

  it('renders a heading with a paragraph directly under it', () => {
    const html = renderNewsletterBodyHtml('## Mobile App Launch\nCourtTime is live.');
    expect(html).toContain('>Mobile App Launch</p>');
    expect(html).toContain('>CourtTime is live.</p>');
    // The first block has no top margin.
    expect(html.indexOf('margin: 0 0 8px')).toBeGreaterThan(-1);
  });
});

describe('newsletter inline formatting', () => {
  it('escapes HTML', () => {
    expect(renderInline('<script>"x" & y</script>')).toBe('&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;');
  });

  it('bolds and links', () => {
    expect(renderInline('**Bold** text')).toBe('<strong>Bold</strong> text');
    const html = renderInline('See [the site](https://www.courttimeapp.com/get-app?a=1&b=2) now');
    expect(html).toContain('href="https://www.courttimeapp.com/get-app?a=1&amp;b=2"');
    expect(html).toContain('>the site</a> now');
  });

  it('links bare URLs and leaves trailing punctuation outside', () => {
    const html = renderInline('Visit https://www.courttimeapp.com/blog.');
    expect(html).toContain('href="https://www.courttimeapp.com/blog"');
    expect(html.endsWith('</a>.')).toBe(true);
  });

  it('refuses javascript: links', () => {
    const html = renderInline('[x](javascript:alert(1))');
    expect(html).not.toContain('<a');
  });
});

describe('newsletter email', () => {
  it('uses the same branded shell as the app launch email', () => {
    const html = buildNewsletterEmailHtml({ subject: 'News & notes', body: 'Hi', preheader: 'Preview <here>' });
    expect(html).toContain('<title>News &amp; notes</title>');
    expect(html).toContain('>Preview &lt;here&gt;</div>');
    const shell = (s: string) => [
      s.slice(s.indexOf('<body'), s.indexOf('<div style="background-color: #ffffff')).replace(/<div style="display: none[^]*?<\/div>\n/, ''),
      s.slice(s.indexOf('<div style="padding: 16px 8px')),
    ];
    expect(shell(html)).toEqual(shell(buildAppLaunchEmailHtml('Ann')));
    expect(html).toContain('4239 Allenhurst Dr');
    expect(html).toContain('https://www.courttimeapp.com/profile');
  });

  it('leaves out the preview line when there is none', () => {
    expect(buildNewsletterEmailHtml({ subject: 'S', body: 'B' })).not.toContain('display: none');
  });
});
