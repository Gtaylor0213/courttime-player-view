import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildWhitelistExportRows,
  parseWhitelistWorkbook,
  toWhitelistImportEntries,
} from '../parseWhitelistSpreadsheet';

/**
 * The admin resend workflow depends on an exported whitelist being re-importable:
 * filter to "not joined", export, then re-upload that file to resend invites.
 * If the export's column headers ever stop matching what the parser looks for,
 * the re-upload silently imports nothing (or loses the emails) and no invites go
 * out - so the export and the parser are pinned together here.
 */
describe('whitelist export -> re-import round trip', () => {
  const exported = [
    {
      address: '123 Main St, Springfield, IL, 62701',
      lastName: 'Smith',
      email: 'john@club.com',
      accountsLimit: 999,
      setupInviteSentAt: '2026-08-01T12:00:00Z',
      setupInviteAcceptedAt: null,
    },
    {
      address: '9 Oak Ave',
      lastName: 'Jones',
      email: 'amy@club.com',
      accountsLimit: 4,
      setupInviteSentAt: null,
      setupInviteAcceptedAt: null,
    },
  ];

  function roundTrip(entries: typeof exported) {
    const worksheet = XLSX.utils.json_to_sheet(buildWhitelistExportRows(entries));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Whitelist');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    return toWhitelistImportEntries(parseWhitelistWorkbook(buffer));
  }

  it('preserves address, last name, email and limit through the round trip', () => {
    const entries = roundTrip(exported);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      address: '123 Main St, Springfield, IL, 62701',
      lastName: 'Smith',
      email: 'john@club.com',
      accountsLimit: 999,
    });
    expect(entries[1]).toMatchObject({ address: '9 Oak Ave', email: 'amy@club.com' });
  });

  it('does not mangle a comma-containing address into extra columns', () => {
    const entries = roundTrip(exported);
    // The stored address is a single string; re-importing must not split it on
    // commas, or it would no longer match the existing row on re-upload.
    expect(entries[0].address).toBe('123 Main St, Springfield, IL, 62701');
  });

  it('marks joined members so a re-upload can tell them apart', () => {
    const rows = buildWhitelistExportRows([
      { ...exported[0], setupInviteAcceptedAt: '2026-08-02T12:00:00Z' },
    ]);
    expect(rows[0].Status).toBe('Joined');
  });
});
