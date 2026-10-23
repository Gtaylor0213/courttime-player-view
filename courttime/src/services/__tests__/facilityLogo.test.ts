import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { FacilityLogoError, LOGO_MAX_DIMENSION, normalizeFacilityLogo } from '../facilityLogo';

async function dataUrl(
  width: number,
  height: number,
  format: 'png' | 'jpeg',
  { transparent = false, noisy = false } = {}
) {
  const channels = transparent ? 4 : 3;
  const pixels = Buffer.alloc(width * height * channels);
  for (let i = 0; i < pixels.length; i++) {
    // Noise makes the file big, like a photo; flat colour stays tiny.
    pixels[i] = noisy ? Math.floor(Math.random() * 256) : 120;
    if (transparent && i % 4 === 3) pixels[i] = 0;
  }
  const buffer = await sharp(pixels, { raw: { width, height, channels } })[format]().toBuffer();
  return `data:image/${format};base64,${buffer.toString('base64')}`;
}

async function dimensions(url: string) {
  const meta = await sharp(Buffer.from(url.split(',')[1], 'base64')).metadata();
  return { width: meta.width, height: meta.height, format: meta.format };
}

describe('normalizeFacilityLogo', () => {
  it('passes through empty values and plain URLs', async () => {
    expect(await normalizeFacilityLogo(undefined)).toBeUndefined();
    expect(await normalizeFacilityLogo(null)).toBeNull();
    expect(await normalizeFacilityLogo('')).toBe('');
    expect(await normalizeFacilityLogo('https://example.com/logo.png')).toBe('https://example.com/logo.png');
  });

  it('leaves a small logo untouched', async () => {
    const small = await dataUrl(200, 100, 'png');
    expect(await normalizeFacilityLogo(small)).toBe(small);
  });

  it('shrinks a large opaque photo to a JPEG within the size limit', async () => {
    const photo = await dataUrl(2000, 1500, 'jpeg', { noisy: true });
    const result = await normalizeFacilityLogo(photo);
    expect(result.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(result.length).toBeLessThan(photo.length);
    expect(await dimensions(result)).toMatchObject({ width: LOGO_MAX_DIMENSION, height: 384, format: 'jpeg' });
  });

  it('keeps transparency as PNG', async () => {
    const logo = await dataUrl(1024, 1024, 'png', { transparent: true });
    const result = await normalizeFacilityLogo(logo);
    expect(result.startsWith('data:image/png;base64,')).toBe(true);
    expect(await dimensions(result)).toMatchObject({ width: LOGO_MAX_DIMENSION, height: LOGO_MAX_DIMENSION });
  });

  it('rejects data that is not an image', async () => {
    const junk = `data:image/png;base64,${Buffer.from('not an image').toString('base64')}`;
    await expect(normalizeFacilityLogo(junk)).rejects.toBeInstanceOf(FacilityLogoError);
  });
});
