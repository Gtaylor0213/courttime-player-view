/**
 * Render admin-authored HTML as plain text for React Native.
 *
 * Waivers and General Rules are authored in a plain `<textarea>` ("plain text
 * or HTML"), and web renders them with `dangerouslySetInnerHTML`. Mobile has no
 * HTML renderer and no WebView, and adding one would mean a new native build.
 *
 * These are consent documents, so the rule this is written to: **never drop
 * text.** Formatting may be lost — bold, italics, links become their text —
 * but every word the member is agreeing to has to survive. Unknown tags are
 * unwrapped rather than removed, so unexpected markup degrades to its content
 * instead of vanishing.
 */

/** Tags whose content is markup, not prose — dropped wholesale. */
const CONTENT_FREE_TAGS = ['script', 'style', 'head', 'title'];

/** Tags that should produce a line break where they appear. */
const BREAK_TAG = /<\s*br\s*\/?\s*>/gi;

/** Tags that start a new block of text. */
const BLOCK_TAGS =
  /<\s*\/?\s*(p|div|section|article|header|footer|h[1-6]|ul|ol|table|tr|blockquote|pre)\b[^>]*>/gi;

const LIST_ITEM_OPEN = /<\s*li\b[^>]*>/gi;
const LIST_ITEM_CLOSE = /<\s*\/\s*li\s*>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (match, name: string) => {
      const decoded = NAMED_ENTITIES[name.toLowerCase()];
      return decoded ?? match;
    });
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/**
 * Convert admin-authored HTML (or plain text) to display text.
 * Plain text passes through with only entity decoding and whitespace tidying.
 */
export function htmlToDisplayText(input: string | null | undefined): string {
  if (!input) return '';

  let text = String(input);

  for (const tag of CONTENT_FREE_TAGS) {
    text = text.replace(new RegExp(`<\\s*${tag}\\b[^>]*>[\\s\\S]*?<\\s*/\\s*${tag}\\s*>`, 'gi'), '');
  }

  // HTML comments carry no prose.
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  text = text.replace(BREAK_TAG, '\n');
  text = text.replace(LIST_ITEM_OPEN, '\n• ');
  text = text.replace(LIST_ITEM_CLOSE, '');
  text = text.replace(BLOCK_TAGS, '\n');

  // Anything left is inline markup (strong, em, a, span, or something
  // unexpected): unwrap it so its text survives.
  text = text.replace(/<[^>]*>/g, '');

  text = decodeEntities(text);

  return text
    .replace(/\r\n?/g, '\n')
    // Collapse runs of spaces and tabs, but not newlines.
    .replace(/[^\S\n]+/g, ' ')
    // Tidy space around line breaks.
    .replace(/ *\n */g, '\n')
    // At most one blank line between blocks.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** True when the document has no readable text (empty or markup-only). */
export function isEmptyHtmlDocument(input: string | null | undefined): boolean {
  return htmlToDisplayText(input).length === 0;
}
