// AHRS_ORIENTATION (PX4: SENS_BOARD_ROT, same numbering), picked by posing a model of the board.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  Compass, AlertTriangle, RotateCcw, RotateCw, ArrowDown, ArrowUp, ArrowDownLeft, ArrowDownRight, Undo2,
} from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { getVehicleClass } from '../../../shared/telemetry-types';
import type { VehicleKind } from '../calibration/shared/vehicle-models';
import { BoardMountScene } from './BoardMountScene';
import { ALL_ORIENTATIONS, orientationName, orientationCheck } from './board-orientation';
import {
  IDENTITY,
  poseForValue,
  valueForPose,
  moveBoard,
  sideInVehicle,
  type Mat3,
  type MountMove,
} from './board-mount-pose';

const MOVE_BUTTONS: { move: MountMove; labelKey: string; Icon: typeof RotateCw }[] = [
  { move: 'turnLeft', labelKey: 'mavlink-config:boardOrientationCard.turnLeft', Icon: RotateCcw },
  { move: 'turnRight', labelKey: 'mavlink-config:boardOrientationCard.turnRight', Icon: RotateCw },
  { move: 'rollLeft', labelKey: 'mavlink-config:boardOrientationCard.rollLeft', Icon: ArrowDownLeft },
  { move: 'rollRight', labelKey: 'mavlink-config:boardOrientationCard.rollRight', Icon: ArrowDownRight },
  { move: 'tipNoseDown', labelKey: 'mavlink-config:boardOrientationCard.pitchDown', Icon: ArrowDown },
  { move: 'tipNoseUp', labelKey: 'mavlink-config:boardOrientationCard.pitchUp', Icon: ArrowUp },
];

const SIDE_KEYS = {
  front: 'mavlink-config:boardOrientationCard.sideFront',
  back: 'mavlink-config:boardOrientationCard.sideBack',
  left: 'mavlink-config:boardOrientationCard.sideLeft',
  right: 'mavlink-config:boardOrientationCard.sideRight',
  up: 'mavlink-config:boardOrientationCard.sideUp',
  down: 'mavlink-config:boardOrientationCard.sideDown',
} as const;

export function BoardOrientationCard(): JSX.Element {
  const { t } = useTranslation();
  const { parameters, setParameterImmediate } = useParameterStore();
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  const orientParam = firmware === 'px4' ? 'SENS_BOARD_ROT' : 'AHRS_ORIENTATION';
  const attitude = useTelemetryStore((s) => s.attitude);
  const armed = useTelemetryStore((s) => s.flight.armed);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [noWebGl, setNoWebGl] = useState(false);

  const current = (parameters.get(orientParam)?.value as number) ?? 0;
  const supported = parameters.has(orientParam);
  const appliedPose = useMemo(() => poseForValue(current) ?? IDENTITY, [current]);
  const [pose, setPose] = useState<Mat3>(appliedPose);
  useEffect(() => setPose(appliedPose), [appliedPose]);

  const mavType = useConnectionStore((s) => s.connectionState.mavType);
  const qEnable = parameters.get('Q_ENABLE')?.value as number | undefined;
  const kind: VehicleKind = mavType === 11 ? 'boat' : getVehicleClass(mavType, { qEnable });
  const poseValue = valueForPose(pose);
  const applied = poseValue === current;
  const check = useMemo(
    () => orientationCheck(attitude.roll, attitude.pitch),
    [attitude.roll, attitude.pitch],
  );
  const handleNoWebGl = useCallback(() => setNoWebGl(true), []);

  const apply = async (value: number) => {
    setBusy(true);
    setStatus(null);
    try {
      const ok = await setParameterImmediate(orientParam, value);
      setStatus(ok
        ? t('mavlink-config:boardOrientationCard.setTo', { name: orientationName(value) })
        : t('mavlink-config:boardOrientationCard.couldNotWrite', { param: orientParam }));
    } finally {
      setBusy(false);
    }
  };

  if (!supported) return <></>;

  const arrowSide = sideInVehicle(pose, [1, 0, 0]);
  const topSide = sideInVehicle(pose, [0, 0, -1]);
  const facing = topSide === 'up'
    ? t('mavlink-config:boardOrientationCard.facingUpright')
    : topSide === 'down'
      ? t('mavlink-config:boardOrientationCard.facingUpsideDown')
      : t('mavlink-config:boardOrientationCard.facingSide', { side: t(SIDE_KEYS[topSide]) });

  return (
    <div className="bg-surface rounded-xl border border-subtle p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
          <Compass className="w-5 h-5 text-purple-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-content">{t('mavlink-config:boardOrientationCard.title')}</h3>
          <p className="text-xs text-content-secondary">
            {t('mavlink-config:boardOrientationCard.subtitle')}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-content">{orientationName(current)}</div>
          <div className="text-[11px] text-content-tertiary">
            {orientParam} {current}
          </div>
        </div>
      </div>

      {armed && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {t('mavlink-config:boardOrientationCard.disarmFirst')}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="shrink-0 rounded-xl border border-subtle bg-surface-raised p-3">
          {noWebGl ? (
            <div className="flex h-[320px] w-[320px] items-center justify-center p-6 text-center text-xs text-content-secondary">
              {t('mavlink-config:boardOrientationCard.no3d')}
            </div>
          ) : (
            <BoardMountScene
              pose={pose}
              kind={kind}
              roll={attitude.roll}
              pitch={attitude.pitch}
              tilt={applied}
              onUnavailable={handleNoWebGl}
            />
          )}
          {!noWebGl && (
            <div className="mt-1 text-center text-[10px] text-content-tertiary">{t('mavlink-config:boardOrientationCard.dragHint')}</div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {MOVE_BUTTONS.map(({ move, labelKey, Icon }) => (
              <button
                key={move}
                onClick={() => setPose((p) => moveBoard(p, move))}
                disabled={armed || busy}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-subtle bg-surface px-2 py-1.5 text-[11px] text-content-secondary hover:bg-surface-overlay hover:text-content disabled:opacity-40"
              >
                <Icon className="w-3.5 h-3.5" />
                {t(labelKey)}
              </button>
            ))}
          </div>
          <div className="mt-2 text-center text-[10px] leading-snug text-content-tertiary">
            <Trans i18nKey="mavlink-config:boardOrientationCard.buttonsHint" components={{ br: <br /> }} />
          </div>
        </div>

        <div className="flex-1 space-y-3">
          <div className="rounded-lg border border-subtle bg-surface-raised p-3 text-xs">
            <div className="text-content-tertiary mb-1">{t('mavlink-config:boardOrientationCard.onModelNow')}</div>
            <div className="text-content">
              {t('mavlink-config:boardOrientationCard.arrowPoints', { side: arrowSide === 'front' ? t('mavlink-config:boardOrientationCard.sideForward') : t(SIDE_KEYS[arrowSide]), facing })}
            </div>
            <div className="mt-1 text-[11px] text-content-tertiary">
              {t('mavlink-config:boardOrientationCard.goByArrow')}
            </div>
          </div>

          {poseValue === null ? (
            <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              {t('mavlink-config:boardOrientationCard.noPreset')}
            </div>
          ) : applied ? (
            <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              <div>{t('mavlink-config:boardOrientationCard.applied', { param: orientParam, value: poseValue, code: ALL_ORIENTATIONS[poseValue] })}</div>
              <div className="mt-1 text-emerald-400/80">
                {t('mavlink-config:boardOrientationCard.followsVehicle')}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              <div className="flex-1">
                {t('mavlink-config:boardOrientationCard.notApplied', { param: orientParam, value: poseValue, code: ALL_ORIENTATIONS[poseValue] })}
              </div>
              <button
                onClick={() => setPose(appliedPose)}
                disabled={busy}
                className="flex items-center gap-1 rounded px-2 py-1 text-content-secondary hover:text-content"
              >
                <Undo2 className="w-3.5 h-3.5" /> {t('common:reset')}
              </button>
              <button
                onClick={() => apply(poseValue)}
                disabled={armed || busy}
                className="rounded-lg bg-purple-500/80 px-3 py-1.5 font-medium text-white hover:bg-purple-500 disabled:opacity-40"
              >
                {t('common:apply')}
              </button>
            </div>
          )}

          <div className="text-[11px] text-content-tertiary tabular-nums">
            {t('mavlink-config:boardOrientationCard.attitude', { roll: attitude.roll.toFixed(0), pitch: attitude.pitch.toFixed(0), yaw: attitude.yaw.toFixed(0) })}
            <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${
              check.level ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
            }`}>
              {check.level ? t('mavlink-config:boardOrientationCard.readingLevel') : t('mavlink-config:boardOrientationCard.notLevel')}
            </span>
          </div>
          <p className="text-[11px] text-content-tertiary">{check.note}</p>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-[11px] text-content-tertiary hover:text-content"
            >
              {showAll ? t('mavlink-config:boardOrientationCard.hideFullList') : t('mavlink-config:boardOrientationCard.everyOrientation')}
            </button>
            {showAll && (
              <select
                value={current}
                onChange={(e) => apply(Number(e.target.value))}
                disabled={armed || busy}
                className="px-2 py-1 text-xs bg-surface-input border border-subtle rounded text-content-secondary"
              >
                {Object.entries(ALL_ORIENTATIONS).map(([value, code]) => (
                  <option key={value} value={value}>{code} ({value})</option>
                ))}
              </select>
            )}
          </div>

          {status && <div className="text-xs text-content-secondary">{status}</div>}
        </div>
      </div>
    </div>
  );
}
