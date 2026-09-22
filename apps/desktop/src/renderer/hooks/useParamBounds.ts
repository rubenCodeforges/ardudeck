import { useMemo } from 'react';
import { useParameterStore } from '../stores/parameter-store';
import { PARAM_RANGE_OVERRIDES, type ParameterMetadata } from '../../shared/parameter-metadata';

export interface ParamBounds {
  min: number;
  max: number;
  step: number;
  /** False when the vehicle's metadata had no usable range and the fallback is in use. */
  fromMetadata: boolean;
}

export function resolveParamBounds(
  paramId: string,
  meta: ParameterMetadata | undefined,
  fallbackMin: number,
  fallbackMax: number,
  fallbackStep: number
): ParamBounds {
  const fallback = {
    min: fallbackMin,
    max: fallbackMax,
    step: fallbackStep,
    fromMetadata: false,
  };

  const override = PARAM_RANGE_OVERRIDES[paramId];
  const min = override?.min ?? meta?.range?.min ?? fallbackMin;
  const max = override?.max ?? meta?.range?.max ?? fallbackMax;
  const increment = meta?.increment;
  const step = increment && increment > 0 ? increment : fallbackStep;

  // A range narrower than one step leaves nothing to drag.
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < step) return fallback;

  return { min, max, step, fromMetadata: Boolean(meta?.range) };
}

/** Slider bounds from the vehicle's own metadata; fallback until it loads. */
export function useParamBounds(
  paramId: string,
  fallbackMin: number,
  fallbackMax: number,
  fallbackStep: number
): ParamBounds {
  const metadata = useParameterStore((s) => s.metadata);

  return useMemo(
    () => resolveParamBounds(paramId, metadata?.[paramId], fallbackMin, fallbackMax, fallbackStep),
    [metadata, paramId, fallbackMin, fallbackMax, fallbackStep]
  );
}
