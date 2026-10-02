import { Camera, Check, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TrainerCatalogue, TrainerStatus } from '../../../shared/trainer-types';

/**
 * The aircraft, most of which ArduDeck already knows.
 *
 * The FRAME is not chosen here: the flight controller this app is running is already mixing for
 * one, and the Trainer simulates that. Offering a second choice would let the mixer and the
 * airframe disagree, which diverges into an oscillation rather than flying.
 *
 * What IS chosen is the camera, and by KIND rather than from a saved list. A launcher that has
 * only ever had its default FPV camera could otherwise never be asked for a gimbal, which is the
 * one genuinely different thing to fly behind: it is stabilised, so it gives no attitude cue at
 * all. The Trainer builds a camera for a kind nobody owns yet.
 */

export interface CameraChoice {
  kind: string;
  tiltDeg: number;
  lensFovDeg: number;
}

export function TrainerVehicleStep({
  catalogue,
  camera,
  onCamera,
  status,
}: {
  catalogue: TrainerCatalogue;
  camera: CameraChoice | null;
  onCamera: (choice: CameraChoice | null) => void;
  status: TrainerStatus | null;
}): JSX.Element {
  const { t } = useTranslation();
  // Only what a pilot can actually fly by. An action camera records and is not a view, and the
  // Trainer would silently fall back to a flyable one, so offering it would be a lie.
  const kinds = catalogue.cameraKinds.filter((k) => k.flyable);
  const spec = kinds.find((k) => k.kind === camera?.kind);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-content">{t('trainer:trainerVehicleStep.title')}</h2>
        <p className="mt-0.5 text-xs text-content-tertiary">
          {t('trainer:trainerVehicleStep.subtitle')}
        </p>
      </div>

      <section>
        <h3 className="mb-2.5 flex items-center gap-1.5 border-l-2 border-blue-500/60 pl-2.5 text-xs font-medium uppercase tracking-wide text-content-secondary">
          <Camera className="h-3.5 w-3.5" />
          {t('trainer:trainerVehicleStep.goggles')}
        </h3>

        <div className="grid gap-2.5 sm:grid-cols-3">
          <KindCard
            active={camera === null}
            onClick={() => onCamera(null)}
            label={t('trainer:trainerVehicleStep.trainersOwn')}
            blurb={t('trainer:trainerVehicleStep.trainersOwnBlurb')}
          />
          {kinds.map((k) => (
            <KindCard
              key={k.kind}
              active={camera?.kind === k.kind}
              onClick={() =>
                onCamera({
                  kind: k.kind,
                  tiltDeg: k.tiltDefaultDeg,
                  lensFovDeg: k.defaultLensFovDeg,
                })
              }
              label={k.label}
              blurb={k.blurb}
              badge={k.stabilised ? t('trainer:trainerVehicleStep.stabilised') : undefined}
            />
          ))}
        </div>

        {camera && spec && (
          <div className="card card-body mt-3 space-y-4">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-xs font-medium text-content-secondary">{spec.tiltLabel}</span>
                <span className="text-xs text-content-tertiary">{camera.tiltDeg}°</span>
              </div>
              <input
                type="range"
                className="w-full accent-blue-500"
                min={spec.tiltMinDeg}
                max={spec.tiltMaxDeg}
                step={1}
                value={camera.tiltDeg}
                onChange={(e) => onCamera({ ...camera, tiltDeg: Number(e.target.value) })}
              />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-content-secondary">{t('trainer:trainerVehicleStep.lens')}</span>
              <div className="flex gap-2">
                {spec.lenses.map((fov) => (
                  <button
                    key={fov}
                    onClick={() => onCamera({ ...camera, lensFovDeg: fov })}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                      camera.lensFovDeg === fov
                        ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                        : 'border-subtle text-content-secondary hover:bg-surface-raised'
                    }`}
                  >
                    {fov}°
                  </button>
                ))}
              </div>
            </div>

            {spec.stabilised && (
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-content-tertiary">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {t('trainer:trainerVehicleStep.stabilisedHint')}
              </p>
            )}
          </div>
        )}
      </section>

      <div className="card card-body space-y-1.5 text-xs">
        <Row
          label={t('trainer:trainerVehicleStep.takeoffPoint')}
          value={
            status?.home
              ? `${status.home.lat.toFixed(5)}, ${status.home.lon.toFixed(5)}`
              : t('trainer:trainerVehicleStep.waitingForFix')
          }
        />
        <Row label={t('trainer:trainerVehicleStep.flightController')} value={t('trainer:trainerVehicleStep.arduDeckKeepsIt')} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-content-tertiary">{label}</span>
      <span className="text-content-secondary">{value}</span>
    </div>
  );
}

function KindCard({
  active,
  onClick,
  label,
  blurb,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  blurb: string;
  badge?: string;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`card wx-card card-body py-3 text-left ${
        active ? '!border-blue-500/60 ring-1 ring-blue-500/30' : 'hover:border-strong'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-sm font-medium text-content">{label}</span>
        {badge && (
          <span className="shrink-0 rounded-full border border-subtle bg-surface-raised px-1.5 py-0.5 text-[10px] text-content-tertiary">
            {badge}
          </span>
        )}
        {active && <Check className="h-4 w-4 shrink-0 text-blue-400" />}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-content-tertiary">{blurb}</p>
    </button>
  );
}
