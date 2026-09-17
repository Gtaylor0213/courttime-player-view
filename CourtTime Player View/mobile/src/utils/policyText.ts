/**
 * Helpers for the admin Club Policies screen: plain-text ↔ HTML for the
 * general rules / terms editors, and the bulk whitelist line parser.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Turn plain text into the simple HTML the web editor stores: one <p> per
 * blank-line-separated block, <br> for single line breaks. Lines starting
 * with "- " or "* " become a <ul>.
 */
export function plainTextToHtml(text: string): string {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split('\n');
      if (lines.every((l) => /^[-*•]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${escapeHtml(l.replace(/^[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${lines.map(escapeHtml).join('<br>')}</p>`;
    })
    .join('');
}

export interface WhitelistLine { address: string; lastName?: string; email?: string; accountsLimit?: number }

/**
 * Parse pasted whitelist rows. Each line: address | last name | email | limit
 * (commas or tabs also accepted as separators between fields; an address can
 * itself contain commas only when "|" or tabs are used). Blank lines skipped.
 */
export function parseWhitelistLines(text: string): WhitelistLine[] {
  const out: WhitelistLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = (line.includes('|') ? line.split('|') : line.includes('\t') ? line.split('\t') : line.split(',')).map((p) => p.trim());
    const [address, lastName, email, limit] = parts;
    if (!address) continue;
    const row: WhitelistLine = { address };
    if (lastName) row.lastName = lastName;
    if (email && email.includes('@')) row.email = email;
    else if (email && !limit && /^\d+$/.test(email)) row.accountsLimit = Number(email);
    if (limit && /^\d+$/.test(limit)) row.accountsLimit = Number(limit);
    out.push(row);
  }
  return out;
}
