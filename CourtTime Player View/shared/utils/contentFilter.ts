/**
 * Objectionable-language filter for member-written text (messages, bulletin
 * posts, hitting-partner posts, group names).
 *
 * App Store Guideline 1.2 requires "a method for filtering objectionable
 * material from being posted". This is deliberately a short list of slurs and
 * strong profanity matched on whole words, so ordinary words that merely
 * contain one ("Scunthorpe", "class", "assess") are never caught. Anything it
 * misses is handled by member reports.
 */

const BLOCKED_WORDS = [
  'asshole',
  'bastard',
  'bitch',
  'chink',
  'cocksucker',
  'cunt',
  'dyke',
  'fag',
  'faggot',
  'fuck',
  'fucker',
  'motherfucker',
  'kike',
  'nigga',
  'nigger',
  'paki',
  'retard',
  'shit',
  'shitty',
  'slut',
  'tranny',
  'twat',
  'wetback',
  'whore',
];

/** Common endings, so "fucking" and "bitches" match without listing each form. */
const SUFFIX = '(?:s|es|ed|er|ers|ing|in|y)?';

const BLOCKED_PATTERN = new RegExp(`\\b(?:${BLOCKED_WORDS.join('|')})${SUFFIX}\\b`, 'i');

/** Undo the usual character swaps ("sh1t", "b!tch", "f.u.c.k") before matching. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[@4]/g, 'a')
    .replace(/[1!|]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/3/g, 'e')
    .replace(/[$5]/g, 's')
    // Letters spaced out with punctuation: "f.u.c.k", "s-h-i-t".
    .replace(/\b(?:[a-z][.\-_*]){2,}[a-z]\b/g, (spaced) => spaced.replace(/[.\-_*]/g, ''));
}

export const OBJECTIONABLE_CONTENT_MESSAGE =
  "This contains language that isn't allowed on CourtTime. Please edit it and try again.";

export function containsObjectionableLanguage(text: unknown): boolean {
  if (typeof text !== 'string' || !text) return false;
  return BLOCKED_PATTERN.test(text) || BLOCKED_PATTERN.test(normalize(text));
}

/** True when any of the given fields fails the filter. Non-strings are ignored. */
export function anyObjectionable(...fields: unknown[]): boolean {
  return fields.some(containsObjectionableLanguage);
}
