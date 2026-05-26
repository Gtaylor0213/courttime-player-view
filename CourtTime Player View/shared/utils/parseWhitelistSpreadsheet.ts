import * as XLSX from 'xlsx';

export const WHITELIST_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const WHITELIST_IMPORT_MAX_ROWS = 5000;

export interface ParsedWhitelistRow {
  streetAddress: string;
  city?: string;
  state?: string;
  zipCode?: string;
  lastName?: string;
  householdName?: string;
  email?: string;
  accountsLimit?: number;
}

/** Admin bulk import shape (single address string). */
export interface WhitelistImportEntry {
  address: string;
  lastName?: string;
  email?: string;
  accountsLimit?: number;
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function rowLooksLikeHeaderRow(row: string[]): boolean {
  const nonEmpty = row.filter(Boolean);
  if (nonEmpty.length === 0) return false;

  let headerLike = 0;
  for (const cell of nonEmpty) {
    const n = normalizeHeader(cell);
    if (
      n.includes('address') ||
      n.includes('adress') ||
      n.includes('street') ||
      n === 'email' ||
      n.includes('email') ||
      n.includes('lastname') ||
      n.includes('surname') ||
      n.includes('familyname') ||
      n === 'city' ||
      n === 'state' ||
      n.includes('zip') ||
      n.includes('postal') ||
      n.includes('limit') ||
      n.includes('max') ||
      n.includes('account') ||
      n.includes('household')
    ) {
      headerLike += 1;
    }
  }

  return headerLike >= 1 && headerLike / nonEmpty.length >= 0.25;
}

function findHeaderIndex(headers: string[], patterns: RegExp[]): number {
  return headers.findIndex((h) => patterns.some((p) => p.test(h.trim())));
}

function parseAccountsLimit(value: string): number | undefined {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function buildFullAddress(row: ParsedWhitelistRow): string {
  const parts = [row.streetAddress.trim()];
  if (row.city?.trim()) parts.push(row.city.trim());
  if (row.state?.trim()) parts.push(row.state.trim());
  if (row.zipCode?.trim()) parts.push(row.zipCode.trim());
  return parts.join(', ');
}

/** Expand `!ref` from every populated cell so imports are not truncated to A1. */
export function getEffectiveSheetRange(sheet: XLSX.WorkSheet): string | null {
  let minR = Infinity;
  let minC = Infinity;
  let maxR = -1;
  let maxC = -1;

  for (const key of Object.keys(sheet)) {
    if (key[0] === '!') continue;
    const cell = sheet[key];
    if (cell == null) continue;
    const value = cell.v;
    if (value == null || String(value).trim() === '') continue;

    const { r, c } = XLSX.utils.decode_cell(key);
    minR = Math.min(minR, r);
    minC = Math.min(minC, c);
    maxR = Math.max(maxR, r);
    maxC = Math.max(maxC, c);
  }

  if (maxR < 0) return sheet['!ref'] ?? null;

  return XLSX.utils.encode_range({
    s: { r: minR, c: minC },
    e: { r: maxR, c: maxC },
  });
}

export function sheetToRows2D(sheet: XLSX.WorkSheet): string[][] {
  const ref = getEffectiveSheetRange(sheet);
  if (!ref) return [];

  const rangeSheet = { ...sheet, '!ref': ref };
  const raw = XLSX.utils.sheet_to_json<unknown[]>(rangeSheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  return raw
    .map((row) => {
      const arr = Array.isArray(row) ? row : [row];
      return arr.map((c) => String(c ?? '').trim());
    })
    .filter((row) => row.some((cell) => cell !== ''));
}

function parseWithHeaders(headerRow: string[], dataRows: string[][]): ParsedWhitelistRow[] {
  const headers = headerRow.map((h) => h.trim());
  const normalized = headers.map(normalizeHeader);

  const streetIdx = findHeaderIndex(headers, [
    /^(street|address|adress|streetaddress|fulladdress)$/i,
  ]);
  const addressIdx = normalized.findIndex(
    (h) => h.includes('address') || h.includes('adress') || h.includes('street')
  );
  const streetCol = streetIdx >= 0 ? streetIdx : addressIdx >= 0 ? addressIdx : 0;

  const cityCol = findHeaderIndex(headers, [/^city$/i]);
  const stateCol = findHeaderIndex(headers, [/^state$/i]);
  const zipCol = findHeaderIndex(headers, [/^(zip|zipcode|postal)$/i]);
  const lastNameCol = findHeaderIndex(headers, [
    /^(last.?name|lastname|surname|family.?name)$/i,
  ]);
  const householdCol = findHeaderIndex(headers, [/^(household|householdname)$/i]);
  const emailCol = normalized.findIndex((h) => h === 'email' || h.includes('email'));
  const limitCol = normalized.findIndex(
    (h) => h.includes('limit') || h.includes('max') || h.includes('account')
  );

  return dataRows
    .map((row) => ({
      streetAddress: row[streetCol] || '',
      city: cityCol >= 0 ? row[cityCol] || undefined : undefined,
      state: stateCol >= 0 ? row[stateCol] || undefined : undefined,
      zipCode: zipCol >= 0 ? row[zipCol] || undefined : undefined,
      lastName: lastNameCol >= 0 ? row[lastNameCol] || undefined : undefined,
      householdName: householdCol >= 0 ? row[householdCol] || undefined : undefined,
      email: emailCol >= 0 ? row[emailCol] || undefined : undefined,
      accountsLimit: limitCol >= 0 ? parseAccountsLimit(row[limitCol] || '') : undefined,
    }))
    .filter((row) => row.streetAddress);
}

function parseWithoutHeaders(rows: string[][]): ParsedWhitelistRow[] {
  if (rows.length === 0) return [];

  const maxCols = Math.max(...rows.map((r) => r.length), 0);

  // One row, multiple columns — addresses laid out horizontally.
  if (rows.length === 1 && rows[0].filter(Boolean).length > 1) {
    return rows[0].filter(Boolean).map((cell) => ({ streetAddress: cell }));
  }

  // Single column — every populated cell is an address.
  if (maxCols <= 1) {
    return rows
      .map((row) => ({ streetAddress: row[0] || '' }))
      .filter((row) => row.streetAddress);
  }

  // Multi-column without headers: street, optional city/state/zip, then last name / email / limit.
  return rows
    .map((row) => {
      const colCount = row.filter(Boolean).length;
      if (colCount <= 2) {
        return {
          streetAddress: row[0] || '',
          lastName: row[1] || undefined,
        };
      }
      if (colCount <= 4) {
        return {
          streetAddress: row[0] || '',
          city: row[1] || undefined,
          state: row[2] || undefined,
          zipCode: row[3] || undefined,
          lastName: row[4] || undefined,
        };
      }
      return {
        streetAddress: row[0] || '',
        city: row[1] || undefined,
        state: row[2] || undefined,
        zipCode: row[3] || undefined,
        lastName: row[4] || undefined,
        householdName: row[5] || undefined,
        email: row[6] || undefined,
        accountsLimit: row[7] ? parseAccountsLimit(row[7]) : undefined,
      };
    })
    .filter((row) => row.streetAddress);
}

/** Parse a 2D grid (from CSV or Excel) into whitelist rows. */
export function parseRows2D(rows: string[][]): ParsedWhitelistRow[] {
  if (rows.length === 0) return [];
  if (rows.length > WHITELIST_IMPORT_MAX_ROWS) {
    throw new Error(`Whitelist imports are limited to ${WHITELIST_IMPORT_MAX_ROWS} rows`);
  }

  const hasHeader = rowLooksLikeHeaderRow(rows[0]);
  if (hasHeader) {
    return parseWithHeaders(rows[0], rows.slice(1));
  }

  return parseWithoutHeaders(rows);
}

export function csvToRows2D(text: string): string[][] {
  if (text.length > WHITELIST_IMPORT_MAX_BYTES) {
    throw new Error('Whitelist CSV file is too large');
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

export function parseWhitelistCsv(text: string): ParsedWhitelistRow[] {
  return parseRows2D(csvToRows2D(text));
}

export function parseWhitelistWorkbook(data: ArrayBuffer): ParsedWhitelistRow[] {
  if (data.byteLength > WHITELIST_IMPORT_MAX_BYTES) {
    throw new Error('Whitelist spreadsheet file is too large');
  }
  const workbook = XLSX.read(data);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  return parseRows2D(sheetToRows2D(sheet));
}

export function toWhitelistImportEntries(rows: ParsedWhitelistRow[]): WhitelistImportEntry[] {
  return rows.map((row) => ({
    address: buildFullAddress(row),
    lastName: row.lastName,
    email: row.email,
    accountsLimit: row.accountsLimit,
  }));
}
