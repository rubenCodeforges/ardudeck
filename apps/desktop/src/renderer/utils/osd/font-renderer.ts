/**
 * OSD Font Renderer
 *
 * Provides higher-level font rendering utilities for the OSD simulator,
 * including caching, screen buffer management, and canvas rendering.
 */

import {
  parseMcmFont,
  characterToImageData,
  OsdFont,
  OsdCharacter,
  OSD_CHAR_WIDTH,
  OSD_CHAR_HEIGHT,
} from '@ardudeck/msp-ts';

// Re-export for convenience
export { OSD_CHAR_WIDTH, OSD_CHAR_HEIGHT };

/** OSD display dimensions */
export const OSD_COLS = 30;
export const OSD_ROWS_PAL = 16;
export const OSD_ROWS_NTSC = 13;

export type VideoType = 'PAL' | 'NTSC';

export function getOsdRows(videoType: VideoType): number {
  return videoType === 'PAL' ? OSD_ROWS_PAL : OSD_ROWS_NTSC;
}

/**
 * Cached font with pre-rendered character images
 */
export interface CachedFont {
  font: OsdFont;
  /** Pre-rendered ImageData for each character */
  imageCache: Map<number, ImageData>;
  /** Pre-rendered data URLs for each character (for img src) */
  dataUrlCache: Map<number, string>;
}

/**
 * Load and cache a font from MCM content
 */
export function loadFont(mcmContent: string, name: string): CachedFont {
  const font = parseMcmFont(mcmContent, name);
  const imageCache = new Map<number, ImageData>();
  const dataUrlCache = new Map<number, string>();

  // Pre-render all characters
  for (const char of font.characters) {
    const imageData = characterToImageData(char);
    imageCache.set(char.index, imageData);
  }

  return {
    font,
    imageCache,
    dataUrlCache, // Lazily populated
  };
}

/**
 * Get or create a data URL for a character (lazy caching)
 */
export function getCharacterDataUrl(
  cachedFont: CachedFont,
  charIndex: number,
  scale: number = 1
): string {
  const cacheKey = charIndex * 100 + scale; // Simple composite key

  if (cachedFont.dataUrlCache.has(cacheKey)) {
    return cachedFont.dataUrlCache.get(cacheKey)!;
  }

  const imageData = cachedFont.imageCache.get(charIndex);
  if (!imageData) {
    // Return transparent placeholder for missing characters
    return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  }

  // Create canvas and render
  const canvas = document.createElement('canvas');
  canvas.width = OSD_CHAR_WIDTH * scale;
  canvas.height = OSD_CHAR_HEIGHT * scale;

  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  if (scale === 1) {
    ctx.putImageData(imageData, 0, 0);
  } else {
    // Render at 1x then scale up for crisp pixels
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = OSD_CHAR_WIDTH;
    tempCanvas.height = OSD_CHAR_HEIGHT;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
  }

  const dataUrl = canvas.toDataURL('image/png');
  cachedFont.dataUrlCache.set(cacheKey, dataUrl);

  return dataUrl;
}

/**
 * OSD Screen Buffer - represents the character grid
 */
export class OsdScreenBuffer {
  readonly width: number;
  readonly height: number;
  private buffer: Uint16Array; // 16-bit to support 512 characters

  constructor(videoType: VideoType = 'PAL') {
    this.width = OSD_COLS;
    this.height = getOsdRows(videoType);
    this.buffer = new Uint16Array(this.width * this.height);
    this.clear();
  }

  /** Clear buffer to blank (space character = 0x20) */
  clear(): void {
    this.buffer.fill(0x20);
  }

  /** Set character at position */
  setChar(x: number, y: number, charIndex: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.buffer[y * this.width + x] = charIndex;
  }

  /** Get character at position */
  getChar(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0x20;
    return this.buffer[y * this.width + x];
  }

  /** Draw a string starting at position (ASCII only for now) */
  drawString(x: number, y: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      this.setChar(x + i, y, charCode);
    }
  }

  /** Draw a string using symbol mapping */
  drawSymbols(x: number, y: number, symbols: number[]): void {
    for (let i = 0; i < symbols.length; i++) {
      this.setChar(x + i, y, symbols[i]);
    }
  }

  /** Get raw buffer for iteration */
  getBuffer(): Uint16Array {
    return this.buffer;
  }

  /** Resize buffer (changes video type) */
  resize(videoType: VideoType): void {
    const newHeight = getOsdRows(videoType);
    if (newHeight !== this.height) {
      (this as { height: number }).height = newHeight;
      this.buffer = new Uint16Array(this.width * newHeight);
      this.clear();
    }
  }
}

/**
 * Render entire OSD screen to a canvas
 */
export function renderOsdToCanvas(
  ctx: CanvasRenderingContext2D,
  buffer: OsdScreenBuffer,
  cachedFont: CachedFont,
  scale: number = 2,
  backgroundColor: string = 'rgba(0, 0, 0, 0.7)'
): void {
  const width = buffer.width * OSD_CHAR_WIDTH * scale;
  const height = buffer.height * OSD_CHAR_HEIGHT * scale;

  // Draw background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Disable smoothing for pixel-perfect rendering
  ctx.imageSmoothingEnabled = false;

  // Draw each character
  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      const charIndex = buffer.getChar(x, y);
      const imageData = cachedFont.imageCache.get(charIndex);

      if (imageData) {
        // Create temporary canvas for this character
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = OSD_CHAR_WIDTH;
        tempCanvas.height = OSD_CHAR_HEIGHT;
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.putImageData(imageData, 0, 0);

        // Draw scaled
        ctx.drawImage(
          tempCanvas,
          x * OSD_CHAR_WIDTH * scale,
          y * OSD_CHAR_HEIGHT * scale,
          OSD_CHAR_WIDTH * scale,
          OSD_CHAR_HEIGHT * scale
        );
      }
    }
  }
}

/**
 * Optimized batch renderer - renders to offscreen canvas first
 */
export class OsdRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private charCanvases: Map<number, HTMLCanvasElement> = new Map();
  private scale: number;
  private cachedFont: CachedFont | null = null;

  constructor(videoType: VideoType = 'PAL', scale: number = 2) {
    this.scale = scale;
    this.canvas = document.createElement('canvas');
    this.canvas.width = OSD_COLS * OSD_CHAR_WIDTH * scale;
    this.canvas.height = getOsdRows(videoType) * OSD_CHAR_HEIGHT * scale;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
  }

  setFont(cachedFont: CachedFont): void {
    this.cachedFont = cachedFont;
    this.charCanvases.clear(); // Clear char canvas cache on font change
  }

  setScale(scale: number): void {
    if (scale !== this.scale) {
      this.scale = scale;
      this.canvas.width = OSD_COLS * OSD_CHAR_WIDTH * scale;
      this.canvas.height =
        (this.canvas.height / (OSD_CHAR_HEIGHT * (this.scale / scale))) *
        OSD_CHAR_HEIGHT *
        scale;
      this.charCanvases.clear();
    }
  }

  resize(videoType: VideoType): void {
    this.canvas.height = getOsdRows(videoType) * OSD_CHAR_HEIGHT * this.scale;
  }

  /** Get or create a pre-rendered canvas for a character */
  private getCharCanvas(charIndex: number): HTMLCanvasElement | null {
    if (!this.cachedFont) return null;

    if (this.charCanvases.has(charIndex)) {
      return this.charCanvases.get(charIndex)!;
    }

    const imageData = this.cachedFont.imageCache.get(charIndex);
    if (!imageData) return null;

    const canvas = document.createElement('canvas');
    canvas.width = OSD_CHAR_WIDTH * this.scale;
    canvas.height = OSD_CHAR_HEIGHT * this.scale;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // Render at 1x
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = OSD_CHAR_WIDTH;
    tempCanvas.height = OSD_CHAR_HEIGHT;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imageData, 0, 0);

    // Scale up
    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);

    this.charCanvases.set(charIndex, canvas);
    return canvas;
  }

  /** Render buffer to internal canvas and return it */
  render(buffer: OsdScreenBuffer, backgroundColor?: string): HTMLCanvasElement {
    // Clear with background
    if (backgroundColor) {
      this.ctx.fillStyle = backgroundColor;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Draw characters
    for (let y = 0; y < buffer.height; y++) {
      for (let x = 0; x < buffer.width; x++) {
        const charIndex = buffer.getChar(x, y);
        const charCanvas = this.getCharCanvas(charIndex);

        if (charCanvas) {
          this.ctx.drawImage(
            charCanvas,
            x * OSD_CHAR_WIDTH * this.scale,
            y * OSD_CHAR_HEIGHT * this.scale
          );
        }
      }
    }

    return this.canvas;
  }

  /** Get the internal canvas dimensions */
  getDimensions(): { width: number; height: number } {
    return {
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }
}
