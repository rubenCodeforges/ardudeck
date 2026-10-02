/**
 * What ArduDeck tells the Trainer, and deliberately nothing more.
 *
 * The Trainer owns how a flight is configured: regions, cameras, conditions, the frame file,
 * the whole `LaunchConfig`. ArduDeck owns WHERE the aircraft is and WHAT it is. This module is
 * the seam, and it is kept to intent on purpose: the launch config is a large shape that
 * changes with the game, and a copy of it here would be a second implementation in a second
 * repository with an app release between them, which cannot be kept in step.
 *
 * `fcOwner` is not sent. If ArduDeck is the one asking, ArduDeck is running the flight
 * controller: that is what asking MEANS on this path, and making it a field would make it
 * something this side could get wrong.
 */

import type { TrainerConditions } from '../../shared/trainer-types.js';
import { t } from '../../shared/i18n/index.js';

/** Matches `TRAINER_REQUEST_VERSION` in the game's `shared/trainer-launch.ts`. */
export const TRAINER_REQUEST_VERSION = 1;

export interface TrainerRequest {
  version: number;
  home: { lat: number; lon: number; altM?: number; headingDeg?: number };
  region?: string;
  frame?: { frameClass: number; frameType: number; specPath: string | null };
  camera?: { kind: string; tiltDeg?: number; lensFovDeg?: number };
  conditions?: TrainerConditions;
  stream?: { enabled: boolean; port?: number };
  fullscreen?: boolean;
}

export interface TrainerRequestInput {
  /** Where this app's flight controller takes off from. */
  home: { lat: number; lon: number; altM?: number | null; headingDeg?: number | null } | null;
  /** FRAME_CLASS / FRAME_TYPE the running stack mixes for. */
  frameClass?: number | null;
  frameType?: number | null;
  /** The custom frame JSON: mass, props, disc area, battery. */
  framePath?: string | null;
  camera?: { kind: string; tiltDeg?: number; lensFovDeg?: number } | null;
  conditions?: TrainerConditions | null;
  region?: string | null;
  /** The FPV feed back into this app's camera panel. */
  stream?: { enabled: boolean; port?: number } | null;
  fullscreen?: boolean;
}

export type TrainerRequestResult =
  | { ok: true; request: TrainerRequest }
  | { ok: false; error: string };

/**
 * Refuses without a take-off point rather than sending one the Trainer will reject.
 *
 * The failure is worth catching on this side because the message can name what to do about it:
 * this app knows whether a flight controller is running and whether it has a fix, and the
 * Trainer only ever sees a missing field.
 */
export function buildTrainerRequest(input: TrainerRequestInput): TrainerRequestResult {
  const { home } = input;
  if (!home || !Number.isFinite(home.lat) || !Number.isFinite(home.lon)) {
    return {
      ok: false,
      error: t('main:trainer.noTakeoffPoint'),
    };
  }
  if (home.lat === 0 && home.lon === 0) {
    // The uninitialised coordinate. Every GPS reads it before a fix, and it is in the Gulf of
    // Guinea, where no region is baked, so the Trainer would refuse with a puzzling message
    // about coverage rather than the true one about a fix.
    return { ok: false, error: t('main:trainer.noGpsFix') };
  }

  const request: TrainerRequest = {
    version: TRAINER_REQUEST_VERSION,
    home: { lat: home.lat, lon: home.lon },
  };
  if (typeof home.altM === 'number' && Number.isFinite(home.altM)) request.home.altM = home.altM;
  if (typeof home.headingDeg === 'number' && Number.isFinite(home.headingDeg)) {
    request.home.headingDeg = home.headingDeg;
  }

  // Both halves or neither: FRAME_CLASS without FRAME_TYPE leaves the mixer and the airframe
  // rotated relative to one another, which diverges into an oscillation rather than flying.
  if (Number.isFinite(input.frameClass) && Number.isFinite(input.frameType)) {
    request.frame = {
      frameClass: input.frameClass as number,
      frameType: input.frameType as number,
      specPath: input.framePath ?? null,
    };
  }

  if (input.camera?.kind) request.camera = input.camera;
  if (input.conditions) request.conditions = input.conditions;
  if (input.region) request.region = input.region;
  if (input.stream) request.stream = input.stream;
  if (input.fullscreen !== undefined) request.fullscreen = input.fullscreen;

  return { ok: true, request };
}
