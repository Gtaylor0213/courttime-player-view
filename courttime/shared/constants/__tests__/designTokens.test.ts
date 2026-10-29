import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { motion, palette, radius, webTokens } from '../designTokens';
import { BOOKING_TYPES, RESERVATION_BLOCK_COLORS } from '../bookingTypes';

/**
 * Drift guard: designTokens.ts is a copy of the website's values, so re-read
 * the website's files and check the copy still matches.
 */

const root = resolve(__dirname, '../../..');
const siteCss = readFileSync(resolve(root, 'src/index.css'), 'utf8');
const tailwindCss = readFileSync(resolve(root, 'node_modules/tailwindcss/theme.css'), 'utf8');

/** The site's light `:root { ... }` block only — `.dark` redefines the same names. */
const siteRoot = siteCss.slice(siteCss.indexOf(':root {'), siteCss.indexOf('.dark {'));

function cssVar(css: string, name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`--${name} not found`);
  return match[1].trim();
}

/** oklch → the sRGB hex a browser renders (out-of-gamut channels are clipped). */
function oklchToHex(lightness: number, chroma: number, hue: number): string {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const encode = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  return (
    '#' +
    linear
      .map((channel) => Math.round(clamp(encode(clamp(channel))) * 255).toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Normalise a CSS colour value (hex or oklch) to lowercase hex. */
function toHex(value: string): string {
  const oklch = value.match(/^oklch\(([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\)$/);
  if (oklch) {
    const lightness = oklch[2] ? Number(oklch[1]) / 100 : Number(oklch[1]);
    return oklchToHex(lightness, Number(oklch[3]), Number(oklch[4]));
  }
  return value.toLowerCase();
}

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('designTokens', () => {
  it.each(Object.entries(palette))('palette.%s matches the Tailwind palette', (name, hex) => {
    const cssName = name.replace(/(\d+)$/, '-$1');
    expect(toHex(cssVar(tailwindCss, `color-${cssName}`))).toBe(hex);
  });

  it.each(Object.entries(webTokens))('webTokens.%s matches src/index.css', (name, value) => {
    expect(toHex(cssVar(siteRoot, kebab(name)))).toBe(value);
  });

  it('radius steps follow the site --radius', () => {
    const base = parseFloat(cssVar(siteRoot, 'radius')) * 16;
    expect(radius).toEqual({ sm: base - 4, md: base - 2, lg: base, xl: base + 4 });
  });

  // The app paints calendar blocks with `rn`; the site with the Tailwind classes in `color`.
  it.each([...Object.entries(BOOKING_TYPES), ...Object.entries(RESERVATION_BLOCK_COLORS)])(
    'calendar block colors for %s match its Tailwind classes',
    (_name, { color, rn }) => {
      const [, bg, text, border] = color.match(/^bg-(\S+) text-(\S+) border-(\S+)$/)!;
      expect({
        bg: toHex(cssVar(tailwindCss, `color-${bg}`)),
        border: toHex(cssVar(tailwindCss, `color-${border}`)),
        text: toHex(cssVar(tailwindCss, `color-${text}`)),
      }).toEqual(rn);
    },
  );

  it('motion matches the site durations and easing', () => {
    expect(`${motion.fastMs}ms`).toBe(cssVar(siteRoot, 'motion-fast'));
    expect(`${motion.standardMs}ms`).toBe(cssVar(siteRoot, 'motion-standard'));
    expect(`cubic-bezier(${motion.easeStandard.join(', ')})`).toBe(cssVar(siteRoot, 'ease-standard'));
  });
});
