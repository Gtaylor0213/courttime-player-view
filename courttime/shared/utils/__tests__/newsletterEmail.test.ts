import { describe, expect, it } from 'vitest';
import {
  APP_BADGES_MARKUP,
  NEWSLETTER_LINK_GROUPS,
  buildNewsletterEmailHtml,
  newsletterLinkMarkup,
  parseNewsletterBody,
  renderInline,
  renderNewsletterBodyHtml,
} from '../newsletterEmail';
import { buildAppLaunchEmailHtml } from '../../../src/services/appLaunchEmailTemplate';
import { APP_STORE_URL, PLAY_STORE_URL } from '../appDownload';

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

describe('newsletter buttons, badges and insert links', () => {
  it('turns a lone button line into a centered green button', () => {
    const html = renderNewsletterBodyHtml('Intro\n[button: Book a court](https://www.courttimeapp.com/calendar)\nAfter');
    expect(html).toContain('href="https://www.courttimeapp.com/calendar" style="display: inline-block; background-color: #1a5f2a');
    expect(html).toContain('>Book a court</a></p>');
    expect(html).toContain('>Intro</p>');
    expect(html).toContain('>After</p>');
  });

  it('makes a mid-sentence button a plain link and refuses unsafe button links', () => {
    expect(renderInline('Go [button: here](https://x.com) now')).toContain('>here</a> now');
    expect(renderNewsletterBodyHtml('[button: x](javascript:alert(1))')).not.toContain('<a');
  });

  it('renders the store badges block exactly like the app launch email', () => {
    const html = renderNewsletterBodyHtml(`Get it:\n\n${APP_BADGES_MARKUP}\n\nThanks`);
    expect(html).toContain(`href="${APP_STORE_URL}"`);
    expect(html).toContain(`href="${PLAY_STORE_URL}"`);
    const badges = (h: string) => h.slice(h.indexOf('<div style="text-align: center'), h.indexOf('</div>', h.indexOf('<div style="text-align: center')));
    expect(badges(html)).toBe(badges(buildAppLaunchEmailHtml('Ann')));
  });

  it('leaves text without the new markup rendering as before', () => {
    expect(renderNewsletterBodyHtml('[Visit](https://www.courttimeapp.com)')).not.toContain('background-color');
    expect(renderNewsletterBodyHtml('{{something-else}}')).toContain('>{{something-else}}</p>');
  });

  it('every insert link is a safe, renderable link in both forms', () => {
    const links = NEWSLETTER_LINK_GROUPS.flatMap((g) => g.links);
    expect(new Set(links.map((l) => l.href)).size).toBe(links.length);
    for (const link of links) {
      expect(link.href).toMatch(/^(https:\/\/|mailto:)/);
      expect(renderNewsletterBodyHtml(newsletterLinkMarkup(link, false))).toContain(`href="${link.href.replace(/&/g, '&amp;')}"`);
      expect(renderNewsletterBodyHtml(newsletterLinkMarkup(link, true))).toContain('background-color: #1a5f2a');
    }
  });
});
