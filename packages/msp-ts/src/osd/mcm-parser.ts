/**
 * MCM Font Parser for MAX7456/AT7456E OSD chips
 *
 * MCM file format:
 * - Line 1: "MAX7456" header
 * - 64 lines per character (512 characters total)
 * - Only first 54 lines per char contain pixel data
 * - Each line: 8 binary digits = 4 pixels (2-bit each)
 * - Character dimensions: 12 pixels wide × 18 pixels tall
 *
 * 2-bit pixel encoding:
 * - 00 = black
 * - 01 = transparent
 * - 10 = white
 * - 11 = transparent (same as 01)
 */

export interface OsdCharacter {
  index: number;
  /** Raw 2-bit pixel data: 12×18 = 216 pixels, packed as 54 bytes */
  rawBytes: Uint8Array;
  /** Expanded pixel values (0-3) for each of 216 pixels */
  pixels: Uint8Array;
}

export interface OsdFont {
  name: string;
  characterCount: number;
  characters: OsdCharacter[];
}

/** Character dimensions for MAX7456 */
export const OSD_CHAR_WIDTH = 12;
export const OSD_CHAR_HEIGHT = 18;
export const OSD_CHAR_PIXELS = OSD_CHAR_WIDTH * OSD_CHAR_HEIGHT; // 216

/** Lines per character in MCM file */
const MCM_LINES_PER_CHAR = 64;
const MCM_DATA_LINES_PER_CHAR = 54;

/** Pixel values */
export const OSD_PIXEL_BLACK = 0b00;
export const OSD_PIXEL_TRANSPARENT_1 = 0b01;
export const OSD_PIXEL_WHITE = 0b10;
export const OSD_PIXEL_TRANSPARENT_2 = 0b11;

/**
 * Parse an MCM font file content into an OsdFont structure
 */
export function parseMcmFont(content: string, name: string = 'unknown'): OsdFont {
  const lines = content.split('\n').map((line) => line.trim());

  // Validate header
  if (lines[0] !== 'MAX7456') {
    throw new Error(`Invalid MCM file: expected "MAX7456" header, got "${lines[0]}"`);
  }

  const characters: OsdCharacter[] = [];

  // Parse each character (512 chars max, but some fonts may have 256)
  const dataLines = lines.slice(1);
  const charCount = Math.floor(dataLines.length / MCM_LINES_PER_CHAR);

  for (let charIndex = 0; charIndex < charCount; charIndex++) {
    const charStartLine = charIndex * MCM_LINES_PER_CHAR;
    const charLines = dataLines.slice(charStartLine, charStartLine + MCM_DATA_LINES_PER_CHAR);

    const character = parseCharacter(charIndex, charLines);
    characters.push(character);
  }

  return {
    name,
    characterCount: characters.length,
    characters,
  };
}

/**
 * Parse a single character from its 54 data lines
 */
function parseCharacter(index: number, lines: string[]): OsdCharacter {
  if (lines.length !== MCM_DATA_LINES_PER_CHAR) {
    throw new Error(`Character ${index}: expected ${MCM_DATA_LINES_PER_CHAR} lines, got ${lines.length}`);
  }

  // Each line is 8 binary digits = 4 pixels (2-bit each)
  // 54 lines × 4 pixels = 216 pixels = 12×18
  const rawBytes = new Uint8Array(MCM_DATA_LINES_PER_CHAR);
  const pixels = new Uint8Array(OSD_CHAR_PIXELS);

  let pixelIndex = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    if (line.length !== 8) {
      throw new Error(`Character ${index}, line ${lineIdx}: expected 8 digits, got ${line.length}`);
    }

    // Parse line as binary and store raw byte
    const byte = parseInt(line, 2);
    rawBytes[lineIdx] = byte;

    // Extract 4 pixels from this byte (2 bits each, MSB first)
    for (let i = 0; i < 4; i++) {
      const shift = 6 - i * 2; // 6, 4, 2, 0
      const pixel = (byte >> shift) & 0b11;
      pixels[pixelIndex++] = pixel;
    }
  }

  return {
    index,
    rawBytes,
    pixels,
  };
}

/**
 * Convert pixel value to RGBA color
 */
export function pixelToRgba(pixel: number): [number, number, number, number] {
  switch (pixel) {
    case OSD_PIXEL_BLACK:
      return [0, 0, 0, 255]; // Black, opaque
    case OSD_PIXEL_WHITE:
      return [255, 255, 255, 255]; // White, opaque
    case OSD_PIXEL_TRANSPARENT_1:
    case OSD_PIXEL_TRANSPARENT_2:
    default:
      return [0, 0, 0, 0]; // Transparent
  }
}

/**
 * Convert an OSD character to ImageData for canvas rendering
 */
export function characterToImageData(char: OsdCharacter): ImageData {
  const imageData = new ImageData(OSD_CHAR_WIDTH, OSD_CHAR_HEIGHT);
  const data = imageData.data;

  for (let i = 0; i < char.pixels.length; i++) {
    const [r, g, b, a] = pixelToRgba(char.pixels[i]);
    const offset = i * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  }

  return imageData;
}

/**
 * Convert an OSD character to a data URL for use as image src
 */
export function characterToDataUrl(char: OsdCharacter, scale: number = 1): string {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(OSD_CHAR_WIDTH * scale, OSD_CHAR_HEIGHT * scale)
    : document.createElement('canvas');

  if (!(canvas instanceof OffscreenCanvas)) {
    canvas.width = OSD_CHAR_WIDTH * scale;
    canvas.height = OSD_CHAR_HEIGHT * scale;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  // Disable image smoothing for pixel-perfect scaling
  ctx.imageSmoothingEnabled = false;

  // Draw at 1:1 first
  const imageData = characterToImageData(char);

  if (scale === 1) {
    ctx.putImageData(imageData, 0, 0);
  } else {
    // Create temp canvas for 1:1, then scale up
    const tempCanvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(OSD_CHAR_WIDTH, OSD_CHAR_HEIGHT)
      : document.createElement('canvas');

    if (!(tempCanvas instanceof OffscreenCanvas)) {
      tempCanvas.width = OSD_CHAR_WIDTH;
      tempCanvas.height = OSD_CHAR_HEIGHT;
    }

    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) throw new Error('Could not get temp canvas context');

    tempCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0, OSD_CHAR_WIDTH * scale, OSD_CHAR_HEIGHT * scale);
  }

  // Return data URL (only works with HTMLCanvasElement in browser)
  return (canvas as HTMLCanvasElement).toDataURL('image/png');
}

/**
 * Pre-render all characters to data URLs for efficient display
 */
export function prerenderFont(font: OsdFont, scale: number = 1): Map<number, string> {
  const cache = new Map<number, string>();

  for (const char of font.characters) {
    cache.set(char.index, characterToDataUrl(char, scale));
  }

  return cache;
}

/**
 * Check if a character is fully transparent (blank)
 */
export function isCharacterBlank(char: OsdCharacter): boolean {
  return char.pixels.every(
    (p) => p === OSD_PIXEL_TRANSPARENT_1 || p === OSD_PIXEL_TRANSPARENT_2
  );
}

/**
 * Serialize a font back to MCM format
 */
export function serializeToMcm(font: OsdFont): string {
  const lines: string[] = ['MAX7456'];

  for (const char of font.characters) {
    // Write 54 data lines
    for (let i = 0; i < MCM_DATA_LINES_PER_CHAR; i++) {
      const byte = char.rawBytes[i];
      lines.push(byte.toString(2).padStart(8, '0'));
    }
    // Write 10 padding lines (all transparent = 01010101)
    for (let i = 0; i < MCM_LINES_PER_CHAR - MCM_DATA_LINES_PER_CHAR; i++) {
      lines.push('01010101');
    }
  }

  return lines.join('\n');
}
