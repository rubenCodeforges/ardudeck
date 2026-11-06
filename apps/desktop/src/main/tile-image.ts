/** PNG, JPEG, GIF or WebP by magic bytes: what MapLibre and Leaflet can decode. */
export function isImageBytes(buf: Uint8Array): boolean {
  if (buf.length < 8) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true;
  return buf.length >= 12
    && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
}
