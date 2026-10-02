/**
 * Is a GPS wired up, and is the firmware set up to hear it.
 *
 * The status card next to this one answers "what is the fix"; this one answers
 * "why is there no fix at all", which is almost always a port that is not
 * carrying the GPS protocol. Both firmwares are handled: ArduPilot gives each
 * serial port a protocol, PX4 gives each GPS a port.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Satellite, AlertTriangle, RotateCw, Check, Activity } from 'lucide-react';
import { GpsDiagnosticsDialog } from './GpsDiagnosticsDialog';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { GpsPortGlyph } from './GpsPortGlyph';
import {
  readApGpsSetup,
  readPx4GpsSetup,
  apSerialGpsWrites,
  apCanGpsWrites,
  apSerialPorts,
  apProtocolName,
  apSocketHint,
  px4SerialGpsWrites,
  px4CanGpsWrites,
  portLabel,
  AP_PROTOCOL_GPS,
  PX4_GPS_PORTS,
} from './gps-setup';

export function GpsSetupCard(): JSX.Element {
  const { t } = useTranslation();
  const { parameters, setParameter } = useParameterStore();
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  const gps = useTelemetryStore((s) => s.gps);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const armed = useTelemetryStore((s) => s.flight?.armed ?? false);

  const isPx4 = firmware === 'px4';
  const get = useMemo(
    () => (name: string) => parameters.get(name)?.value as number | undefined,
    [parameters],
  );

  const known = isPx4
    ? parameters.has('GPS_1_CONFIG')
    : parameters.has('GPS_TYPE') || parameters.has('GPS1_TYPE');
  const ap = useMemo(() => readApGpsSetup(get), [get]);
  const px4 = useMemo(() => readPx4GpsSetup(get), [get]);
  const setup = isPx4 ? px4 : ap;
  // ArduPilot: the ports this board actually exposes, named for what they are.
  // PX4: the firmware's own fixed port list.
  const apPorts = useMemo(() => apSerialPorts(get), [get]);
  const tiles = useMemo(() => (
    isPx4
      ? PX4_GPS_PORTS.filter((p) => p.value !== 0).map((p) => ({
          value: p.value, name: p.label, sub: t('mavlink-config:gpsSetupCard.px4Port') as string | null,
        }))
      : apPorts.map((p) => ({
          value: p.index,
          name: `SERIAL${p.index}`,
          sub: p.protocol === AP_PROTOCOL_GPS ? 'GPS' : apProtocolName(p.protocol),
        }))
  ), [isPx4, apPorts, t]);
  const currentPort = isPx4 ? px4.port : (ap.gpsPorts[0] ?? null);
  const onCan = setup.bus === 'can';

  const receiving = gps.fixType > 0 || gps.satellites > 0;
  // Data arriving settles the question: whatever the parameters look like,
  // the link works, so never accuse a working setup of being misconfigured.
  const problem = receiving ? null : setup.problem;
  const baud = isPx4
    ? (px4.baud === 0 ? t('mavlink-config:gpsSetupCard.auto') : `${px4.baud}`)
    : `${(get(`SERIAL${currentPort ?? 3}_BAUD`) ?? 0) * 1000 || t('mavlink-config:gpsSetupCard.auto')}`;

  const write = async (writes: Array<{ name: string; value: number }>, what: string) => {
    setBusy(true);
    setNote(null);
    try {
      let ok = 0;
      for (const w of writes) {
        if (parameters.has(w.name) && await setParameter(w.name, w.value)) ok++;
      }
      setNote(ok === writes.length
        ? t('mavlink-config:gpsSetupCard.writeDone', { what })
        : t('mavlink-config:gpsSetupCard.writePartial', { ok, total: writes.length }));
    } finally {
      setBusy(false);
    }
  };

  if (!known) return <></>;

  return (
    <div className="bg-surface rounded-xl border border-subtle p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
          <Satellite className="w-5 h-5 text-emerald-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-content">{t('mavlink-config:gpsSetupCard.title')}</h3>
          <p className="text-xs text-content-secondary">
            {t('mavlink-config:gpsSetupCard.subtitle')}
          </p>
        </div>
        {!isPx4 && (
          <button
            onClick={() => setDiagOpen(true)}
            disabled={armed}
            data-tip={armed ? t('mavlink-config:gpsSetupCard.diagDisarmFirst') : t('mavlink-config:gpsSetupCard.diagTip')}
            className="flex items-center gap-1.5 rounded-lg border border-subtle bg-surface-raised px-3 py-1.5 text-xs text-content hover:bg-surface-overlay disabled:opacity-40"
          >
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            {t('mavlink-config:gpsSetupCard.diagnostics')}
          </button>
        )}
        <div className="text-right">
          <div className="text-xs text-content">
            {onCan
              ? 'DroneCAN' // i18n-exempt
              : currentPort !== null
                ? (isPx4 ? portLabel(PX4_GPS_PORTS, currentPort) : `SERIAL${currentPort}`)
                : t('mavlink-config:gpsSetupCard.notAssigned')}
          </div>
          <div className="text-[11px] text-content-tertiary tabular-nums">
            {onCan ? 'CAN1' : t('mavlink-config:gpsSetupCard.baud', { baud })}
          </div>
        </div>
      </div>

      {problem && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {problem}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* The link as it stands right now: receiver, cable, autopilot. */}
        <div className="shrink-0 min-w-[190px] rounded-xl border border-subtle bg-surface-raised p-4 flex flex-col items-center justify-center">
          <svg width="150" height="76" viewBox="0 0 150 76" role="img" aria-label={t('mavlink-config:gpsSetupCard.linkAria')}>
            <g className={receiving ? 'text-emerald-400' : 'text-content-tertiary'}>
              <rect x="6" y="20" width="34" height="34" rx="6"
                fill="currentColor" fillOpacity={receiving ? 0.18 : 0.08}
                stroke="currentColor" strokeWidth="1.6" />
              <circle cx="23" cy="37" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="23" cy="37" r="2.4" fill="currentColor" />
              <path d="M40 37 H110" stroke="currentColor" strokeWidth="2"
                strokeDasharray={receiving ? '0' : '5 5'} />
              {receiving && (
                <circle r="3" fill="currentColor">
                  <animateMotion dur="1.8s" repeatCount="indefinite" path="M40 37 H110" />
                </circle>
              )}
              <rect x="110" y="14" width="34" height="46" rx="6"
                fill="currentColor" fillOpacity={receiving ? 0.18 : 0.08}
                stroke="currentColor" strokeWidth="1.6" />
              <rect x="118" y="24" width="18" height="26" rx="3" fill="currentColor" fillOpacity="0.35" />
            </g>
          </svg>
          <div className="mt-2 text-center">
            <div className="text-xs text-content">
              {receiving ? t('mavlink-config:gpsSetupCard.satellites', { count: gps.satellites }) : t('mavlink-config:gpsSetupCard.noData')}
            </div>
            <div className="text-[11px] text-content-tertiary tabular-nums">
              {receiving ? `HDOP ${gps.hdop.toFixed(1)}` : t('mavlink-config:gpsSetupCard.checkSocket')}
            </div>
          </div>
          <div className={`mt-2 rounded-full px-2 py-0.5 text-[10px] ${
            receiving ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
          }`}>
            {receiving ? t('mavlink-config:gpsSetupCard.linkUp') : t('mavlink-config:gpsSetupCard.nothingArriving')}
          </div>
        </div>

        <div className="flex-1">
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(122px,1fr))]">
            {tiles.map((p) => {
              const active = !onCan && currentPort === p.value;
              const hint = isPx4 ? null : apSocketHint(p.value);
              return (
                <button
                  key={p.value}
                  onClick={() => write(
                    isPx4 ? px4SerialGpsWrites(p.value) : apSerialGpsWrites(p.value),
                    t('mavlink-config:gpsSetupCard.portSetToGps', { name: p.name }),
                  )}
                  disabled={busy}
                  data-tip={isPx4
                    ? `GPS_1_CONFIG ${p.value}`
                    : `${hint ? `${hint}. ` : ''}${t('mavlink-config:gpsSetupCard.serialTip', { n: p.value })}`}
                  className={`relative flex flex-col items-center rounded-lg border px-2 py-2 transition-colors disabled:opacity-40 ${
                    active
                      ? 'border-emerald-500/50 bg-emerald-500/10'
                      : 'border-subtle bg-surface-raised hover:bg-surface-overlay'
                  }`}
                >
                  {active && (
                    <Check className="absolute right-1.5 top-1.5 h-3 w-3 text-emerald-400" />
                  )}
                  <GpsPortGlyph kind="serial" active={active} />
                  <span className={`mt-1 text-center text-[11px] leading-tight ${
                    active ? 'text-content' : 'text-content-secondary'
                  }`}>
                    {p.name}
                  </span>
                  {p.sub && (
                    <span className="text-[10px] leading-tight text-content-tertiary">{p.sub}</span>
                  )}
                </button>
              );
            })}

            <button
              onClick={() => write(isPx4 ? px4CanGpsWrites() : apCanGpsWrites(), t('mavlink-config:gpsSetupCard.droneCanEnabled'))}
              disabled={busy}
              data-tip={t('mavlink-config:gpsSetupCard.canTip')}
              className={`relative flex flex-col items-center rounded-lg border px-2 py-2 transition-colors disabled:opacity-40 ${
                onCan
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : 'border-subtle bg-surface-raised hover:bg-surface-overlay'
              }`}
            >
              {onCan && <Check className="absolute right-1.5 top-1.5 h-3 w-3 text-emerald-400" />}
              <GpsPortGlyph kind="can" active={onCan} />
              <span className={`mt-1 text-center text-[11px] leading-tight ${
                onCan ? 'text-content' : 'text-content-secondary'
              }`}>
                {'DroneCAN' /* i18n-exempt */}
              </span>
            </button>
          </div>

          {note ? (
            <div className="mt-3 flex items-start gap-2 text-xs text-emerald-300">
              <RotateCw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{note}</span>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-content-tertiary">
              {isPx4
                ? t('mavlink-config:gpsSetupCard.px4Hint')
                : t('mavlink-config:gpsSetupCard.apHint')}
            </p>
          )}
        </div>
      </div>
      {diagOpen && <GpsDiagnosticsDialog onClose={() => setDiagOpen(false)} />}
    </div>
  );
}
