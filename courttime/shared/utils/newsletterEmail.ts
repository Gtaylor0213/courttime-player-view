/**
 * Turns the plain text written in the support console's Newsletter page into a
 * CourtTime-branded email. Used by the server to send and by the console for
 * its live preview, so what you see is what goes out.
 *
 * Formatting (deliberately small):
 *   - a blank line starts a new paragraph; a single line break stays a break
 *   - "## Heading" (or "# Heading") on its own line is a section heading
 *   - lines starting with "- ", "* " or "• " are bullet points
 *   - **bold**, [link text](https://…), and bare https:// links
 *   - [button: Label](https://…) on its own line is a centered green button
 *   - {{app-badges}} on its own line is the App Store + Google Play badges
 *
 * The console's insert-link buttons write these for you (NEWSLETTER_LINKS).
 */
import { APP_STORE_URL, GET_APP_PATH, PLAY_STORE_URL } from './appDownload';
import {
  BRAND_GREEN,
  EMAIL_SITE_URL,
  emailButtonHtml,
  escapeEmailHtml,
  storeBadgesHtml,
  wrapInBrandedEmail,
} from './brandedEmail';

export interface NewsletterContent {
  subject: string;
  body: string;
  /** Optional inbox preview line shown after the subject. */
  preheader?: string | null;
}

const P_STYLE = 'margin: 0 0 16px;';
const H_STYLE = 'margin: 24px 0 8px; font-size: 18px; font-weight: bold; color: #111827; line-height: 1.3;';
const UL_STYLE = 'margin: 0 0 16px; padding-left: 22px;';
const LI_STYLE = 'margin: 0 0 8px;';
const A_STYLE = `color: ${BRAND_GREEN}; font-weight: bold;`;

const INLINE_RE =
  /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)|(https?:\/\/[^\s<>"]+)|\*\*([^*\n]+?)\*\*/g;

function link(href: string, text: string): string {
  return `<a href="${escapeEmailHtml(href)}" style="${A_STYLE}" target="_blank">${text}</a>`;
}

/** Escapes text and applies **bold** and links. */
export function renderInline(text: string): string {
  let out = '';
  let last = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const index = match.index ?? 0;
    out += escapeEmailHtml(text.slice(last, index));
    last = index + match[0].length;
    const [, linkText, linkHref, bareUrl, boldText] = match;
    if (linkHref) {
      // A button written mid-sentence just becomes a link.
      out += link(linkHref, escapeEmailHtml(linkText.replace(BUTTON_PREFIX_RE, '')));
    } else if (bareUrl) {
      // Leave sentence punctuation after a pasted URL outside the link.
      const url = bareUrl.replace(/[.,;:!?)]+$/, '');
      out += link(url, escapeEmailHtml(url));
      last -= bareUrl.length - url.length;
    } else {
      out += `<strong>${escapeEmailHtml(boldText)}</strong>`;
    }
  }
  return out + escapeEmailHtml(text.slice(last));
}

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'button'; label: string; href: string }
  | { kind: 'badges' }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; lines: string[] };

const HEADING_RE = /^#{1,3}\s+(.+)$/;
const BULLET_RE = /^[-*•]\s+(.+)$/;
const BUTTON_PREFIX_RE = /^button:\s*/i;
const BUTTON_RE = /^\[button:\s*([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)$/i;
const BADGES_RE = /^\{\{\s*app-badges\s*\}\}$/i;

export function parseNewsletterBody(body: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const rawLine of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    if (BADGES_RE.test(line)) {
      flush();
      blocks.push({ kind: 'badges' });
      continue;
    }
    const button = BUTTON_RE.exec(line);
    if (button) {
      flush();
      blocks.push({ kind: 'button', label: button[1].trim(), href: button[2] });
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', text: heading[1].trim() });
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      if (current?.kind !== 'list') {
        flush();
        current = { kind: 'list', items: [] };
      }
      current.items.push(bullet[1].trim());
      continue;
    }
    if (current?.kind === 'list') {
      // An indented continuation line belongs to the bullet above it.
      if (/^\s/.test(rawLine)) {
        current.items[current.items.length - 1] += ` ${line}`;
        continue;
      }
      flush();
    }
    if (current?.kind !== 'paragraph') {
      flush();
      current = { kind: 'paragraph', lines: [] };
    }
    current.lines.push(line);
  }
  flush();
  return blocks;
}

export function renderNewsletterBodyHtml(body: string): string {
  return parseNewsletterBody(body)
    .map((block, i) => {
      if (block.kind === 'heading') {
        const style = i === 0 ? H_STYLE.replace('margin: 24px', 'margin: 0') : H_STYLE;
        return `      <p style="${style}">${renderInline(block.text)}</p>`;
      }
      if (block.kind === 'badges') return storeBadgesHtml();
      if (block.kind === 'button') return emailButtonHtml(escapeEmailHtml(block.href), escapeEmailHtml(block.label));
      if (block.kind === 'list') {
        const items = block.items.map((item) => `        <li style="${LI_STYLE}">${renderInline(item)}</li>`);
        return `      <ul style="${UL_STYLE}">\n${items.join('\n')}\n      </ul>`;
      }
      return `      <p style="${P_STYLE}">${block.lines.map(renderInline).join('<br />')}</p>`;
    })
    .join('\n');
}

export function buildNewsletterEmailHtml({ subject, body, preheader }: NewsletterContent): string {
  return wrapInBrandedEmail({
    title: escapeEmailHtml(subject.trim() || 'CourtTime'),
    preheader: preheader?.trim() ? escapeEmailHtml(preheader.trim()) : undefined,
    bodyHtml: renderNewsletterBodyHtml(body),
  });
}

export interface NewsletterLink {
  label: string;
  /** Link/button text written into the draft. */
  text: string;
  href: string;
}

export interface NewsletterLinkGroup {
  title: string;
  links: NewsletterLink[];
}

const site = (path: string) => `${EMAIL_SITE_URL}${path}`;

/** The support console's insert-link buttons. */
export const NEWSLETTER_LINK_GROUPS: NewsletterLinkGroup[] = [
  {
    title: 'Get the app',
    links: [
      { label: 'Get the app (opens the right store)', text: 'Get the CourtTime app', href: site(GET_APP_PATH) },
      { label: 'App Store', text: 'Download on the App Store', href: APP_STORE_URL },
      { label: 'Google Play', text: 'Get it on Google Play', href: PLAY_STORE_URL },
    ],
  },
  {
    title: 'Website',
    links: [
      { label: 'Website', text: 'Visit CourtTime', href: site('/') },
      { label: 'Log in', text: 'Log in to CourtTime', href: site('/login') },
      { label: 'Book a court', text: 'Book a court', href: site('/calendar') },
      { label: 'My reservations', text: 'See your reservations', href: site('/my-reservations') },
      { label: 'Find a hitting partner', text: 'Find a hitting partner', href: site('/hitting-partner') },
      { label: 'Bulletin board', text: 'Open the bulletin board', href: site('/bulletin-board') },
      { label: 'Profile & email settings', text: 'Update your profile', href: site('/profile') },
      { label: 'Blog', text: 'Read the CourtTime blog', href: site('/blog') },
    ],
  },
  {
    title: 'For club admins',
    links: [
      { label: 'Admin dashboard', text: 'Open your admin dashboard', href: site('/admin') },
      { label: 'Member management', text: 'Manage your members', href: site('/admin/members') },
      { label: 'Court management', text: 'Manage your courts', href: site('/admin/courts') },
      { label: 'Bookings', text: 'See club bookings', href: site('/admin/bookings') },
      { label: 'Email blast', text: 'Email your members', href: site('/admin/email-blast') },
      { label: 'Register a new club', text: 'Bring your club to CourtTime', href: site('/register/facility') },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'Support page', text: 'Get help', href: site('/support') },
      { label: 'Email Reid', text: 'reidbissell@courttimeapp.com', href: 'mailto:reidbissell@courttimeapp.com' },
    ],
  },
];

/** What an insert button writes into the draft. */
export function newsletterLinkMarkup(link: Pick<NewsletterLink, 'text' | 'href'>, asButton: boolean): string {
  return asButton ? `[button: ${link.text}](${link.href})` : `[${link.text}](${link.href})`;
}

export const APP_BADGES_MARKUP = '{{app-badges}}';
