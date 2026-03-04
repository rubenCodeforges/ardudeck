import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  decodeTerrarium,
  getSharedLookupTable,
  WATER_THRESHOLD,
  type ColorLookupTable,
} from '../../utils/terrain-colors';

const TERRAIN_TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/** Elevation range reported per visible tile set */
export interface ElevationRange {
  min: number;
  max: number;
}

interface TerrainOverlayLayerProps {
  opacity?: number;
  /** When set, clamp color mapping to this fixed range instead of using absolute scale */
  fixedRange?: ElevationRange | null;
  onElevationRangeChange?: (range: ElevationRange) => void;
}

/** Create a custom Leaflet GridLayer that renders color-coded terrain elevation tiles */
function createTerrainGridLayer(
  lut: ColorLookupTable,
  opacity: number,
  fixedRange: ElevationRange | null,
  onElevationRangeChange?: (range: ElevationRange) => void,
) {
  // Track min/max elevation across all visible tiles
  const tileElevations = new Map<string, { min: number; max: number }>();

  function reportRange() {
    if (!onElevationRangeChange) return;
    let globalMin = Infinity;
    let globalMax = -Infinity;
    for (const val of tileElevations.values()) {
      if (val.min < globalMin) globalMin = val.min;
      if (val.max > globalMax) globalMax = val.max;
    }
    if (globalMin === Infinity) {
      onElevationRangeChange({ min: 0, max: 0 });
    } else {
      onElevationRangeChange({ min: globalMin, max: globalMax });
    }
  }

  // When fixedRange is set, we normalize elevations to [fixedRange.min, fixedRange.max]
  // and map that onto the LUT. Otherwise we use absolute elevation mapping.
  const useFixed = fixedRange !== null && fixedRange.max > fixedRange.min;
  const fixedMin = useFixed ? fixedRange!.min : 0;
  const fixedSpan = useFixed ? (fixedRange!.max - fixedRange!.min) : 0;

  const TerrainLayer = L.GridLayer.extend({
    options: {
      maxNativeZoom: 15,
      maxZoom: 22,
      opacity,
      pane: 'overlayPane',
      crossOrigin: true,
    },

    createTile(coords: L.Coords, done: L.DoneCallback): HTMLCanvasElement {
      const canvas = document.createElement('canvas');
      const size = this.getTileSize();
      canvas.width = size.x;
      canvas.height = size.y;

      const tileKey = `${coords.x}:${coords.y}:${coords.z}`;
      (canvas as any)._terrainKey = tileKey;
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const url = TERRAIN_TILE_URL
        .replace('{z}', String(coords.z))
        .replace('{x}', String(coords.x))
        .replace('{y}', String(coords.y));

      img.onload = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          done(new Error('No 2d context'), canvas);
          return;
        }

        // Draw source image to offscreen canvas to read pixel data
        const offscreen = document.createElement('canvas');
        offscreen.width = size.x;
        offscreen.height = size.y;
        const offCtx = offscreen.getContext('2d')!;
        offCtx.drawImage(img, 0, 0, size.x, size.y);

        const srcData = offCtx.getImageData(0, 0, size.x, size.y);
        const src = srcData.data;
        const dst = ctx.createImageData(size.x, size.y);
        const out = dst.data;

        let tileMin = Infinity;
        let tileMax = -Infinity;

        const lutData = lut.data;
        const lutSteps = lut.steps;
        const lutMaxElev = lut.maxElevation;

        for (let i = 0; i < src.length; i += 4) {
          const r = src[i]!;
          const g = src[i + 1]!;
          const b = src[i + 2]!;

          const elev = decodeTerrarium(r, g, b);

          if (elev < WATER_THRESHOLD) {
            // Water/ocean/coastline noise - transparent
            out[i] = 0;
            out[i + 1] = 0;
            out[i + 2] = 0;
            out[i + 3] = 0;
          } else {
            if (elev < tileMin) tileMin = elev;
            if (elev > tileMax) tileMax = elev;

            let idx: number;
            if (useFixed) {
              // Normalize elevation to [0, 1] within fixed range, then map to LUT
              const norm = Math.max(0, Math.min(1, (elev - fixedMin) / fixedSpan));
              idx = Math.min(Math.floor(norm * lutSteps), lutSteps - 1);
            } else {
              // Absolute mapping
              idx = Math.min(Math.floor((elev / lutMaxElev) * lutSteps), lutSteps - 1);
            }

            const offset = idx * 4;
            out[i] = lutData[offset]!;
            out[i + 1] = lutData[offset + 1]!;
            out[i + 2] = lutData[offset + 2]!;
            out[i + 3] = lutData[offset + 3]!;
          }
        }

        ctx.putImageData(dst, 0, 0);

        // Track elevation range
        if (tileMin !== Infinity) {
          tileElevations.set(tileKey, { min: tileMin, max: tileMax });
          reportRange();
        }

        done(undefined, canvas);
      };

      img.onerror = () => {
        done(new Error('Tile load failed'), canvas);
      };

      img.src = url;
      return canvas;
    },
  });

  const layer = new TerrainLayer();

  // Clean up elevation tracking when tiles are removed
  layer.on('tileunload', (e: any) => {
    const tile = e.tile as HTMLCanvasElement;
    const key = (tile as any)._terrainKey as string | undefined;
    if (key) {
      tileElevations.delete(key);
      reportRange();
    }
  });

  return layer;
}

export function TerrainOverlayLayer({
  opacity = 0.6,
  fixedRange = null,
  onElevationRangeChange,
}: TerrainOverlayLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.GridLayer | null>(null);
  const callbackRef = useRef(onElevationRangeChange);
  callbackRef.current = onElevationRangeChange;

  // Serialize fixedRange to a stable string to avoid unnecessary layer recreations
  const rangeKey = fixedRange ? `${fixedRange.min}:${fixedRange.max}` : 'auto';

  useEffect(() => {
    const lut = getSharedLookupTable();
    const layer = createTerrainGridLayer(
      lut,
      opacity,
      fixedRange,
      (range) => callbackRef.current?.(range),
    );
    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map, opacity, rangeKey]);

  return null;
}
