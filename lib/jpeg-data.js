export const MAX_FIRESTORE_IMAGE_BYTES = 600 * 1024;
export const MAX_FIRESTORE_IMAGE_BASE64_LENGTH =
  Math.ceil((MAX_FIRESTORE_IMAGE_BYTES * 4) / 3);

export function parseJpegDataUrl(value) {
  const prefix = "data:image/jpeg;base64,";
  if (typeof value !== "string" || !value.startsWith(prefix)) return null;

  const base64 = value.slice(prefix.length);
  if (
    base64.length === 0 ||
    base64.length > MAX_FIRESTORE_IMAGE_BASE64_LENGTH ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
  ) {
    return null;
  }

  const buffer = Buffer.from(base64, "base64");
  if (
    buffer.length === 0 ||
    buffer.length > MAX_FIRESTORE_IMAGE_BYTES ||
    buffer.toString("base64") !== base64 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer[2] !== 0xff
  ) {
    return null;
  }

  return { base64, buffer };
}
