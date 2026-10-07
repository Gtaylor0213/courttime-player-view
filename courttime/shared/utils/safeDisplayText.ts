/**
 * Coerce API values to a plain string safe for React text nodes.
 * Some facilities store structured blobs (e.g. `{ limit: 5 }`, `{ name, label }`) in text columns.
 */
export function safeDisplayText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if ('limit' in o && o.limit != null) return safeDisplayText(o.limit);
    if ('value' in o && o.value != null) return safeDisplayText(o.value);
    if ('name' in o && o.name != null) return safeDisplayText(o.name);
    if ('label' in o && o.label != null) return safeDisplayText(o.label);
    if ('text' in o && o.text != null) return safeDisplayText(o.text);
    if ('open' in o || 'close' in o) {
      const open = o.open != null ? safeDisplayText(o.open) : '';
      const close = o.close != null ? safeDisplayText(o.close) : '';
      if (open && close) return `${open} - ${close}`;
    }
    return '';
  }
  return '';
}
