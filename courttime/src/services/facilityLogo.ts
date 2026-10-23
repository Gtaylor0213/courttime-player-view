/**
 * Facility logos are stored as data URLs in facilities.logo_url and shipped in
 * every facility list response, so an unshrunk phone photo (one was 3.7 MB)
 * slows every page for every club. Uploads are resized here — the one place
 * web settings, web registration and the mobile app (any version) all pass
 * through.
 */
import sharp from 'sharp';

/** Longest side, in pixels. Still sharp at the largest size the apps show a logo. */
export const LOGO_MAX_DIMENSION = 512;
/** Logos already this small and within LOGO_MAX_DIMENSION are stored untouched. */
const KEEP_AS_IS_BYTES = 150 * 1024;
/** SVGs can't be resized here, so they are only accepted under this size. */
const MAX_SVG_BYTES = 200 * 1024;

export class FacilityLogoError extends Error {}

const DATA_URL_RE = /^data:([^;,]+)(;base64)?,(.*)$/s;

/**
 * Returns the logo to store: undefined/null/'' and non-data URLs pass through,
 * data URLs come back resized (opaque images as JPEG, transparent ones as PNG).
 * Throws FacilityLogoError when the data isn't a readable image.
 */
export async function normalizeFacilityLogo<T extends string | null | undefined>(value: T): Promise<T | string> {
  if (!value || !value.startsWith('data:')) return value;

  const match = DATA_URL_RE.exec(value);
  if (!match || !match[2]) throw new FacilityLogoError('Logo must be an uploaded image');
  const mime = match[1].toLowerCase();
  const input = Buffer.from(match[3], 'base64');

  if (mime === 'image/svg+xml') {
    if (input.length > MAX_SVG_BYTES) throw new FacilityLogoError('SVG logo must be under 200 KB');
    return value;
  }

  let image: sharp.Sharp;
  let meta: sharp.Metadata;
  try {
    image = sharp(input, { animated: false });
    meta = await image.metadata();
  } catch {
    throw new FacilityLogoError('Logo could not be read — please upload a PNG or JPG image');
  }

  const fitsAlready =
    (meta.width ?? Infinity) <= LOGO_MAX_DIMENSION &&
    (meta.height ?? Infinity) <= LOGO_MAX_DIMENSION &&
    input.length <= KEEP_AS_IS_BYTES &&
    (mime === 'image/png' || mime === 'image/jpeg');
  if (fitsAlready) return value;

  try {
    // rotate() applies the EXIF orientation so phone photos don't end up sideways.
    const resized = image
      .rotate()
      .resize(LOGO_MAX_DIMENSION, LOGO_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true });
    const { isOpaque } = await resized.clone().stats();
    const output = isOpaque
      ? await resized.flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
      : await resized.png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
    return `data:${isOpaque ? 'image/jpeg' : 'image/png'};base64,${output.toString('base64')}`;
  } catch {
    throw new FacilityLogoError('Logo could not be processed — please upload a PNG or JPG image');
  }
}
