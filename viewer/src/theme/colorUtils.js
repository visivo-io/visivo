const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const hexToRgb = hex => {
  if (typeof hex !== 'string' || !HEX_RE.test(hex)) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};

const toHex = rgb => `#${rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

export const withAlpha = (hex, alpha) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
};

export const mix = (hexA, hexB, weightOfB) => {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  return toHex(a.map((v, i) => v + (b[i] - v) * weightOfB));
};

const channel = v => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = hex => {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a, b) => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

export const readableTextOn = (background, light = '#ffffff', dark = '#1d2136') => {
  const lum = relativeLuminance(background);
  if (lum === null) return dark;
  return contrastRatio(background, dark) >= contrastRatio(background, light) ? dark : light;
};
