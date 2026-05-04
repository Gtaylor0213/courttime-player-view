function hexToRgb(hex) {
  const cleaned = hex.replace('#', '');
  const bigint = Number.parseInt(cleaned.length === 3
    ? cleaned.split('').map((c) => c + c).join('')
    : cleaned, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function srgbToLinear(channel) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

function contrastRatio(foreground, background) {
  const l1 = luminance(foreground);
  const l2 = luminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const pairs = [
  ['#0F172A', '#FFFFFF', 'text on background'],
  ['#33423C', '#FFFFFF', 'secondary text on background'],
  ['#5F6B66', '#FFFFFF', 'muted text on background'],
  ['#FFFFFF', '#24764D', 'primary button text'],
  ['#FFFFFF', '#D4183D', 'destructive button text'],
  ['#24764D', '#ECF5EF', 'primary on secondary'],
];

const report = pairs.map(([fg, bg, label]) => {
  const ratio = contrastRatio(fg, bg);
  const pass = ratio >= 4.5 ? 'PASS' : 'FAIL';
  return `${label}: ${fg} on ${bg} -> ${ratio.toFixed(2)} (${pass})`;
});

console.log(report.join('\n'));
