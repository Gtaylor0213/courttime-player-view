import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards against "Rendered more hooks than during the previous render".
 *
 * A hook placed below a component's `if (...) return` bail-out runs only on the
 * renders that get past it, so the hook count changes and React throws. Adding
 * one to the bottom of a long component is an easy mistake, and this project
 * has no ESLint, so react-hooks/rules-of-hooks never sees it and Vite does not
 * typecheck. This is a stopgap for the components that bail out early, not a
 * substitute for that rule.
 */

const ROOT = join(__dirname, '..', '..', '..');

/** A hook call at component-body indent (two spaces). */
const HOOK = /^ {2}(?:const .*=\s*)?(use[A-Z]\w*)[(<]/;
/** A bail-out at component-body indent. */
const EARLY = /^ {2}if \(.*\)\s*return\b/;

/**
 * The first hook that sits below the component's first bail-out, or null.
 * Scanning starts at the component's own declaration so that bail-outs inside
 * module-level helper functions above it are not mistaken for the component's.
 */
export function findHookAfterEarlyReturn(
  source: string,
  declarationPrefix: string
): { hook: string; hookLine: number; earlyReturnLine: number } | null {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => l.startsWith(declarationPrefix));
  if (start < 0) throw new Error(`Component declaration not found: ${declarationPrefix}`);

  const body = lines.slice(start);
  const early = body.findIndex((l) => EARLY.test(l));
  if (early < 0) return null;

  for (let i = early + 1; i < body.length; i++) {
    const match = body[i].match(HOOK);
    if (match) {
      return {
        hook: match[1],
        hookLine: start + i + 1,
        earlyReturnLine: start + early + 1,
      };
    }
  }
  return null;
}

describe('findHookAfterEarlyReturn', () => {
  it('flags a hook below the bail-out', () => {
    const bad = [
      'export function Thing({ item }: Props) {',
      '  const [a, setA] = useState(0);',
      '  if (!item) return null;',
      '  useEffect(() => {}, [item]);',
      '  return <div />;',
      '}',
    ].join('\n');
    const found = findHookAfterEarlyReturn(bad, 'export function Thing(');
    expect(found?.hook).toBe('useEffect');
    expect(found?.hookLine).toBe(4);
    expect(found?.earlyReturnLine).toBe(3);
  });

  it('passes when every hook sits above the bail-out', () => {
    const good = [
      'export function Thing({ item }: Props) {',
      '  const [a, setA] = useState(0);',
      '  useEffect(() => {}, [item]);',
      '  if (!item) return null;',
      '  return <div />;',
      '}',
    ].join('\n');
    expect(findHookAfterEarlyReturn(good, 'export function Thing(')).toBeNull();
  });

  it('ignores a bail-out in a helper defined above the component', () => {
    const withHelper = [
      'function helper(x: string) {',
      '  if (!x) return null;',
      '  return x.trim();',
      '}',
      '',
      'export function Thing({ item }: Props) {',
      '  const [a, setA] = useState(0);',
      '  return <div />;',
      '}',
    ].join('\n');
    expect(findHookAfterEarlyReturn(withHelper, 'export function Thing(')).toBeNull();
  });
});

describe('components that bail out early keep every hook above the bail-out', () => {
  const components: Array<[string, string]> = [
    ['src/components/ReservationManagementModal.tsx', 'export function ReservationManagementModal('],
    ['src/components/SeriesEditDialog.tsx', 'export function SeriesEditDialog('],
    ['src/components/CourtCalendarView.tsx', 'export function CourtCalendarView('],
    ['src/components/MyReservations.tsx', 'export function MyReservations('],
    ['src/components/admin/BookingManagement.tsx', 'export function BookingManagement('],
  ];

  it.each(components)('%s', (file, declaration) => {
    const source = readFileSync(join(ROOT, file), 'utf8');
    const found = findHookAfterEarlyReturn(source, declaration);
    expect(
      found &&
        `${found.hook}() on line ${found.hookLine} runs below the bail-out on line ${found.earlyReturnLine}`
    ).toBeNull();
  });
});
