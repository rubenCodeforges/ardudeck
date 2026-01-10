import { useEffect, useRef, useMemo } from 'react';
import { useOsdStore } from '../../stores/osd-store';
import {
  OSD_CHAR_WIDTH,
  OSD_CHAR_HEIGHT,
  OSD_COLS,
  getOsdRows,
} from '../../utils/osd/font-renderer';

interface OsdCanvasProps {
  className?: string;
}

/**
 * OSD Canvas - renders the OSD screen buffer using the loaded font
 */
export function OsdCanvas({ className = '' }: OsdCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const currentFont = useOsdStore((s) => s.currentFont);
  const screenBuffer = useOsdStore((s) => s.screenBuffer);
  const renderVersion = useOsdStore((s) => s.renderVersion);
  const videoType = useOsdStore((s) => s.videoType);
  const scale = useOsdStore((s) => s.scale);
  const showGrid = useOsdStore((s) => s.showGrid);
  const backgroundColor = useOsdStore((s) => s.backgroundColor);

  // Calculate canvas dimensions
  const rows = getOsdRows(videoType);
  const canvasWidth = OSD_COLS * OSD_CHAR_WIDTH * scale;
  const canvasHeight = rows * OSD_CHAR_HEIGHT * scale;

  // Pre-render character canvases for the current font
  const charCanvases = useMemo(() => {
    if (!currentFont) return new Map<number, HTMLCanvasElement>();

    const map = new Map<number, HTMLCanvasElement>();

    for (const [charIndex, imageData] of currentFont.imageCache) {
      const canvas = document.createElement('canvas');
      canvas.width = OSD_CHAR_WIDTH * scale;
      canvas.height = OSD_CHAR_HEIGHT * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;

      // Render at 1x first
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = OSD_CHAR_WIDTH;
      tempCanvas.height = OSD_CHAR_HEIGHT;
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.putImageData(imageData, 0, 0);

      // Scale up
      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
      map.set(charIndex, canvas);
    }

    return map;
  }, [currentFont, scale]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear with background color
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Disable smoothing for pixel-perfect rendering
    ctx.imageSmoothingEnabled = false;

    // Draw grid if enabled
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;

      for (let x = 0; x <= OSD_COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * OSD_CHAR_WIDTH * scale, 0);
        ctx.lineTo(x * OSD_CHAR_WIDTH * scale, canvasHeight);
        ctx.stroke();
      }

      for (let y = 0; y <= rows; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * OSD_CHAR_HEIGHT * scale);
        ctx.lineTo(canvasWidth, y * OSD_CHAR_HEIGHT * scale);
        ctx.stroke();
      }
    }

    // Draw characters
    if (charCanvases.size > 0) {
      for (let y = 0; y < screenBuffer.height; y++) {
        for (let x = 0; x < screenBuffer.width; x++) {
          const charIndex = screenBuffer.getChar(x, y);
          const charCanvas = charCanvases.get(charIndex);

          if (charCanvas) {
            ctx.drawImage(
              charCanvas,
              x * OSD_CHAR_WIDTH * scale,
              y * OSD_CHAR_HEIGHT * scale
            );
          }
        }
      }
    }
  }, [
    charCanvases,
    screenBuffer,
    renderVersion,
    canvasWidth,
    canvasHeight,
    showGrid,
    backgroundColor,
    scale,
  ]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      className={`border border-gray-600 rounded ${className}`}
      style={{
        imageRendering: 'pixelated',
      }}
    />
  );
}

/**
 * OSD Preview with aspect ratio container and optional CRT effect
 */
export function OsdPreview({
  className = '',
  showCrtEffect = false,
}: {
  className?: string;
  showCrtEffect?: boolean;
}) {
  const videoType = useOsdStore((s) => s.videoType);
  const scale = useOsdStore((s) => s.scale);

  const rows = getOsdRows(videoType);
  const aspectRatio = (OSD_COLS * OSD_CHAR_WIDTH) / (rows * OSD_CHAR_HEIGHT);

  return (
    <div className={`relative ${className}`}>
      {/* Aspect ratio container */}
      <div
        className="relative mx-auto"
        style={{
          aspectRatio: aspectRatio.toFixed(4),
          maxWidth: OSD_COLS * OSD_CHAR_WIDTH * scale,
        }}
      >
        <OsdCanvas className="w-full h-full" />

        {/* CRT scanline effect overlay */}
        {showCrtEffect && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 2px)',
              mixBlendMode: 'multiply',
            }}
          />
        )}
      </div>

      {/* Video type badge */}
      <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">
        {videoType} {rows}×{OSD_COLS}
      </div>
    </div>
  );
}
