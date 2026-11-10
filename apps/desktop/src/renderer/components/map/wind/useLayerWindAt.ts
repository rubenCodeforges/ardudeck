import { useMemo } from 'react';
import { useWindStore } from '../../../stores/wind-store';
import { useOverlayStore } from '../../../stores/overlay-store';
import { sampleWind, windVectorFromUV } from './wind-field';
import type { WindAt } from '../../../utils/flight-briefing';

/** Wind at a point from the map's wind layer (its altitude and scrubbed hour), or null while the layer is off. */
export function useLayerWindAt(): { windAt: WindAt | null; altitudeM: number | undefined } {
  const windOn = useOverlayStore((s) => s.activeOverlays.has('wind'));
  const field = useWindStore((s) => s.field);
  const frameIndex = useWindStore((s) => s.frameIndex);
  const windAt = useMemo<WindAt | null>(() => {
    const frame = windOn ? field?.frames[frameIndex] : undefined;
    if (!field || !frame) return null;
    return (lat, lng) => {
      const uv = sampleWind(field, frame, lat, lng);
      if (!uv) return null;
      const v = windVectorFromUV(uv.u, uv.v);
      return { speedMs: v.speed, fromDeg: v.dirFromDeg };
    };
  }, [windOn, field, frameIndex]);
  return { windAt, altitudeM: windAt ? field?.altitudeM : undefined };
}
