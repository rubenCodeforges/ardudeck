import type { FcServoConfig } from './servo-wizard-store';

const SERVO_FIELDS = ['min', 'max', 'middle', 'rate', 'forwardFromChannel', 'reversedSources'] as const;

/** Only this tab's changed fields go onto the live FC config, so servo tabs can't undo each other. */
export function mergeServoEdit(
  base: FcServoConfig | undefined,
  edited: FcServoConfig,
  live: FcServoConfig | undefined,
): FcServoConfig | null {
  const changed = SERVO_FIELDS.filter((f) => edited[f] !== undefined && (!base || base[f] !== edited[f]));
  if (changed.length === 0) return null;
  if (!live) return edited;
  const out: FcServoConfig = { ...live };
  for (const f of changed) (out as unknown as Record<string, number | undefined>)[f] = edited[f];
  return out;
}
