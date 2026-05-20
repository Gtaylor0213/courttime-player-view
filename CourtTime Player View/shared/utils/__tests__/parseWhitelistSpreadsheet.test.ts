import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseRows2D,
  parseWhitelistCsv,
  sheetToRows2D,
  toWhitelistImportEntries,
} from '../parseWhitelistSpreadsheet';

describe('parseWhitelistSpreadsheet', () => {
  it('recognizes common address header typos (e.g. Adress)', () => {
    const rows = parseRows2D([
      ['Adress', 'Last Name', 'email'],
      ['4239 Allenhurst Drive', 'Bissell', 'one@example.com'],
      ['4239 Allenhurst Drive', 'Bissell', 'two@example.com'],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].streetAddress).toBe('4239 Allenhurst Drive');
    expect(rows[1].email).toBe('two@example.com');
  });

  it('parses a header row with multiple data rows', () => {
    const rows = parseRows2D([
      ['Address', 'Last Name', 'Email'],
      ['123 Main St', 'Smith', 'a@example.com'],
      ['456 Oak Ave', 'Jones', 'b@example.com'],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].streetAddress).toBe('123 Main St');
    expect(rows[1].lastName).toBe('Jones');
  });

  it('imports every row when there is no header row (single column)', () => {
    const rows = parseRows2D([
      ['123 Main St'],
      ['456 Oak Ave'],
      ['789 Pine Rd'],
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.streetAddress)).toEqual([
      '123 Main St',
      '456 Oak Ave',
      '789 Pine Rd',
    ]);
  });

  it('does not treat the first data row as headers when labels are absent', () => {
    const rows = parseRows2D([
      ['123 Main St', 'Smith'],
      ['456 Oak Ave', 'Jones'],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ streetAddress: '123 Main St', lastName: 'Smith' });
  });

  it('sheetToRows2D expands range beyond A1 and parses all rows', () => {
    const sheet = XLSX.utils.aoa_to_sheet([['A'], ['B'], ['C']]);
    sheet['!ref'] = 'A1';
    const rows = sheetToRows2D(sheet);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r[0])).toEqual(['A', 'B', 'C']);

    const parsed = parseRows2D(rows);
    expect(parsed).toHaveLength(3);
    expect(parsed.map((r) => r.streetAddress)).toEqual(['A', 'B', 'C']);
  });

  it('parses CSV with headers', () => {
    const csv = `Address,Last Name\n123 Main,Smith\n456 Oak,Jones`;
    const rows = parseWhitelistCsv(csv);
    expect(rows).toHaveLength(2);
  });

  it('maps to admin import entries with joined address parts', () => {
    const entries = toWhitelistImportEntries([
      { streetAddress: '1 Court', city: 'Town', state: 'ST', zipCode: '12345', lastName: 'Lee' },
    ]);
    expect(entries[0].address).toBe('1 Court, Town, ST, 12345');
    expect(entries[0].lastName).toBe('Lee');
  });
});
