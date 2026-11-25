import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronDown, CircleDot, Fan, Gauge, Hand, Power, RotateCw, Wind } from 'lucide-react';
import { useParameterStore } from '../../../stores/parameter-store';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { DraggableSlider } from '../../ui/DraggableSlider';
import { AUX_HIGH_PWM, MOTOR_INTERLOCK_OPTION, channelsForFunction, interlockChannel } from './heli-utils';
import { SwashDiagram, swashServos } from './SwashDiagram';
import { LivePwmInput, useLiveParamWriter } from '../servo-output/LivePwmInput';
import { PitchGauge, type GaugeMarker } from './PitchGauge';
import { ThrottleCurve } from './ThrottleCurve';

const K = 'mavlink-config:heli';
const SV_MAN_MODES = [0, 1, 2, 3, 4] as const;
const THROTTLE_CURVE = ['H_RSC_THRCRV_0', 'H_RSC_THRCRV_25', 'H_RSC_THRCRV_50', 'H_RSC_THRCRV_75', 'H_RSC_THRCRV_100'] as const;

function Card({ icon, tint, title, subtitle, children }: {
  icon: React.ReactNode; tint: string; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-subtle bg-surface p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tint}`}>{icon}</div>
        <div className="flex-1">
          <h3 className="font-medium text-content">{title}</h3>
          <p className="text-xs text-content-secondary">{subtitle}</p>
        </div>
      </div>
      <div className="flex-1 space-y-4">{children}</div>
    </div>
  );
}

/** RPM messages arrive at 2 Hz; older than this and the sensor or link is gone. */
const RPM_STALE_MS = 3000;

function StatusTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'ok' | 'warn' | 'bad' | 'idle' }) {
  const tones = {
    ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    warn: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    bad: 'border-red-500/30 bg-red-500/10 text-red-300',
    idle: 'border-subtle bg-surface text-content',
  } as const;
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${tones[tone]}`}>
      <div className="shrink-0 opacity-80">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-content-secondary">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div>{children}</div>
    </div>
  );
}

export default function HeliSetupTab(): JSX.Element {
  const { t } = useTranslation();
  const parameters = useParameterStore((s) => s.parameters);
  const setParameter = useParameterStore((s) => s.setParameter);
  const setParameterImmediate = useParameterStore((s) => s.setParameterImmediate);
  const getMeta = useParameterStore((s) => s.getParameterMetadata);
  const servoOutput = useTelemetryStore((s) => s.servoOutput);
  const rcChannels = useTelemetryStore((s) => s.rcChannels);
  const armed = useTelemetryStore((s) => s.flight.armed);
  const rpm = useTelemetryStore((s) => s.rpm);
  const rpmFresh = rpm && Date.now() - rpm.timestamp < RPM_STALE_MS ? rpm : null;
  const [showEndpoints, setShowEndpoints] = useState(false);
  const writeLive = useLiveParamWriter();

  const get = (name: string) => parameters.get(name)?.value;
  const has = (name: string) => parameters.has(name);
  const num = (name: string, fb: number) => get(name) ?? fb;
  const valueName = (name: string) => {
    const v = get(name);
    return v === undefined ? '-' : (getMeta(name)?.values?.[v] ?? String(v));
  };

  const bounds = (name: string, fb: { min: number; max: number }, narrow?: { floor?: number; ceil?: number }) => {
    const r = getMeta(name)?.range ?? fb;
    return {
      min: Math.max(r.min, narrow?.floor ?? -Infinity),
      max: Math.min(r.max, narrow?.ceil ?? Infinity),
      step: getMeta(name)?.increment ?? 1,
    };
  };

  const slider = (name: string, label: string, fb: { min: number; max: number }, color: string, extra?: {
    hint?: string; unit?: string; narrow?: { floor?: number; ceil?: number };
  }) => has(name) && (
    <DraggableSlider
      key={name}
      label={label}
      value={num(name, fb.min)}
      onChange={(v) => setParameter(name, v)}
      {...bounds(name, fb, extra?.narrow)}
      color={color}
      hint={extra?.hint}
      unit={extra?.unit ?? getMeta(name)?.units}
    />
  );

  // option labels come from the firmware's own parameter metadata
  const select = (name: string, label: string, hint?: string) => {
    if (!has(name)) return null;
    const values = getMeta(name)?.values ?? {};
    const current = num(name, 0);
    const entries = Object.entries(values);
    if (!entries.some(([v]) => Number(v) === current)) entries.push([String(current), String(current)]);
    return (
      <label key={name} className="block">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-sm text-content">{label}</span>
          <span className="font-mono text-[10px] text-content-tertiary">{name}</span>
        </div>
        <select
          value={current}
          onChange={(e) => setParameter(name, Number(e.target.value))}
          className="w-full rounded-lg border bg-surface-raised px-3 py-2.5 text-sm text-content focus:border-blue-500 focus:outline-none"
        >
          {entries.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {hint && <p className="mt-1 text-[11px] text-content-tertiary">{hint}</p>}
      </label>
    );
  };

  if (!has('H_RSC_MODE')) {
    return (
      <div className="m-6 rounded-xl border border-subtle bg-surface p-5 text-sm text-content-secondary">
        {t(`${K}.noParams`)}
      </div>
    );
  }

  const swType = num('H_SW_TYPE', 3);
  const tailType = num('H_TAIL_TYPE', 0);
  const rscMode = num('H_RSC_MODE', 1);
  const svMan = num('H_SV_MAN', 0);
  const rscChannels = channelsForFunction(31, get, 16);
  const ramp = num('H_RSC_RAMP_TIME', 1);
  const runup = num('H_RSC_RUNUP_TIME', 10);
  const ilCh = interlockChannel(get);
  const ilPwm = ilCh ? rcChannels?.channels?.[ilCh - 1] : undefined;
  const ilState = !ilCh ? 'missing' : ilPwm === undefined || ilPwm === 0 ? 'unknown' : ilPwm > AUX_HIGH_PWM ? 'on' : 'off';
  const swashAssigned = [33, 34, 35].filter((fn) => channelsForFunction(fn, get, 16).length > 0).length;

  const hoverParam = has('H_COL_HOVER') ? 'H_COL_HOVER' : 'H_COLL_HOVER';
  const colYawParam = has('H_COL2YAW') ? 'H_COL2YAW' : 'H_COLYAW';
  const angles = has('H_COL_ANG_MAX');
  const colMin = num('H_COL_MIN', 1250);
  const colMax = num('H_COL_MAX', 1750);
  const colMid = has('H_COL_MID') ? num('H_COL_MID', 1500) : null;

  const marker = (id: string, label: string, color: string, fb: { min: number; max: number }, step = 0.5): GaugeMarker | null => {
    if (!has(id)) return null;
    const r = getMeta(id)?.range ?? fb;
    return { id, label, color, value: num(id, 0), min: r.min, max: r.max, step, onCommit: (v) => setParameter(id, v) };
  };
  const gaugeMarkers = (angles
    ? [
      marker('H_COL_ANG_MAX', t(`${K}.collective.angMax`), 'rgb(239, 68, 68)', { min: 5, max: 20 }),
      marker('H_COL_ZERO_THRST', t(`${K}.collective.angZero`), 'rgb(34, 197, 94)', { min: -5, max: 0 }),
      marker('H_COL_ANG_MIN', t(`${K}.collective.angMin`), 'rgb(245, 158, 11)', { min: -20, max: 0 }),
      marker('H_COL_LAND_MIN', t(`${K}.collective.landMin`), 'rgb(148, 163, 184)', { min: -10, max: 0 }),
    ]
    : [
      marker('H_COL_MAX', t(`${K}.collective.max`), 'rgb(239, 68, 68)', { min: 1000, max: 2000 }, 1),
      marker('H_COL_MID', t(`${K}.collective.mid`), 'rgb(34, 197, 94)', { min: 1000, max: 2000 }, 1),
      marker('H_COL_MIN', t(`${K}.collective.min`), 'rgb(245, 158, 11)', { min: 1000, max: 2000 }, 1),
    ]).filter((m): m is GaugeMarker => m !== null);
  const gaugeLo = angles ? Math.min(-15, ...gaugeMarkers.map((m) => m.value)) : Math.min(1000, ...gaugeMarkers.map((m) => m.value));
  const gaugeHi = angles ? Math.max(15, ...gaugeMarkers.map((m) => m.value)) : Math.max(2000, ...gaugeMarkers.map((m) => m.value));

  const assignInterlock = async (ch: number) => {
    if (ilCh && ilCh !== ch) await setParameter(`RC${ilCh}_OPTION`, 0);
    if (ch > 0) await setParameter(`RC${ch}_OPTION`, MOTOR_INTERLOCK_OPTION);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatusTile
          icon={<CircleDot className="h-5 w-5" />}
          label={t(`${K}.status.swash`)}
          value={t(`${K}.status.swashValue`, { type: valueName('H_SW_TYPE'), n: swashAssigned })}
          tone={swashAssigned >= 3 ? 'idle' : 'warn'}
        />
        <StatusTile
          icon={<Power className="h-5 w-5" />}
          label={t(`${K}.status.interlock`)}
          value={ilCh ? `${t(`${K}.interlock.state.${ilState}`)} · RC${ilCh}` : t(`${K}.interlock.none`)}
          tone={ilState === 'missing' ? 'bad' : ilState === 'on' ? 'warn' : ilState === 'off' ? 'ok' : 'idle'}
        />
        <StatusTile
          icon={<Gauge className="h-5 w-5" />}
          label={t(`${K}.status.rsc`)}
          value={rscChannels.length ? `${valueName('H_RSC_MODE')} · S${rscChannels[0]}` : t(`${K}.status.noRscOutput`)}
          tone={rscChannels.length ? 'idle' : 'bad'}
        />
        <StatusTile
          icon={<Hand className="h-5 w-5" />}
          label={t(`${K}.status.servoMode`)}
          value={t(`${K}.collective.svManMode.${svMan}`)}
          tone={svMan === 0 ? 'ok' : 'warn'}
        />
      </div>

      {svMan !== 0 && <Warn>{t(`${K}.svManActive`)}</Warn>}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card icon={<CircleDot className="h-5 w-5 text-sky-400" />} tint="bg-sky-500/20" title={t(`${K}.swash.title`)} subtitle={t(`${K}.swash.subtitle`)}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <div className="w-full lg:w-[300px] lg:shrink-0">
              <SwashDiagram get={get} outputs={servoOutput?.outputs} />
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              {select('H_SW_TYPE', t(`${K}.swash.type`))}
              {select('H_SW_COL_DIR', t(`${K}.swash.colDir`), t(`${K}.swash.colDirHint`))}
              {select('H_SW_LIN_SVO', t(`${K}.swash.linearize`))}
              {select('H_FLYBAR_MODE', t(`${K}.swash.flybar`))}
              <div className="rounded-lg bg-surface-raised p-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-xs font-medium text-content">{t(`${K}.trims.title`)}</span>
                  {/* i18n-exempt: parameter name */}
                  <span className="font-mono text-[10px] text-content-tertiary">SERVOn_TRIM</span>
                </div>
                <div className="grid grid-cols-[1fr_auto_88px] items-center gap-x-3 gap-y-1.5 text-xs">
                  <span className="text-[10px] uppercase tracking-wider text-content-tertiary">{t(`${K}.trims.servo`)}</span>
                  <span className="text-right text-[10px] uppercase tracking-wider text-content-tertiary">{t(`${K}.trims.live`)}</span>
                  <span className="text-center text-[10px] uppercase tracking-wider text-content-tertiary">{t(`${K}.trims.trim`)}</span>
                  {[...swashServos(swType, get, t).map((sv) => ({ fn: sv.fn, name: t(`${K}.roles.swashServo`, { n: sv.label }) })), { fn: 36, name: t(`${K}.roles.tailServo`) }].map(({ fn, name }) => {
                    const ch = channelsForFunction(fn, get, 16)[0];
                    if (!ch) return null;
                    const trimId = `SERVO${ch}_TRIM`;
                    return (
                      <React.Fragment key={fn}>
                        <span className="truncate text-content">{name} <span className="font-mono text-content-tertiary">S{ch}</span></span>
                        <span className="text-right font-mono text-content-secondary">{servoOutput?.outputs?.[ch - 1] ?? '-'}</span>
                        <LivePwmInput
                          value={num(trimId, 1500)}
                          disabled={!has(trimId) || armed}
                          onWrite={(v) => writeLive(trimId, v)}
                          min={num(`SERVO${ch}_MIN`, 1000)}
                          max={num(`SERVO${ch}_MAX`, 2000)}
                          className="h-7 w-full rounded border border-subtle bg-surface px-2 text-center font-mono text-xs text-content focus:border-sky-500/60 focus:outline-none disabled:opacity-40"
                        />
                      </React.Fragment>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-content-tertiary">{t(`${K}.trims.hint`)}</p>
              </div>
            </div>
          </div>
          {swType === 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {slider('H_SW_H3_SV1_POS', t(`${K}.swash.servoPos`, { n: 1 }), { min: -180, max: 180 }, '#38BDF8')}
              {slider('H_SW_H3_SV2_POS', t(`${K}.swash.servoPos`, { n: 2 }), { min: -180, max: 180 }, '#38BDF8')}
              {slider('H_SW_H3_SV3_POS', t(`${K}.swash.servoPos`, { n: 3 }), { min: -180, max: 180 }, '#38BDF8')}
              {slider('H_SW_H3_PHANG', t(`${K}.swash.phaseAngle`), { min: -30, max: 30 }, '#818CF8')}
            </div>
          )}
          {has('H_DUAL_MODE') && (
            <div className="grid gap-4 md:grid-cols-2">
              {select('H_DUAL_MODE', t(`${K}.swash.dualMode`))}
              {select('H_SW2_TYPE', t(`${K}.swash.type2`))}
              {select('H_SW2_COL_DIR', t(`${K}.swash.colDir2`))}
              {slider('H_DCP_SCALER', t(`${K}.swash.dcpScaler`), { min: 0, max: 1 }, '#A78BFA')}
            </div>
          )}
          {swashAssigned < 3 && <Warn>{t(`${K}.outputs.missingSwash`)}</Warn>}
        </Card>

        <Card icon={<RotateCw className="h-5 w-5 text-emerald-400" />} tint="bg-emerald-500/20" title={t(`${K}.collective.title`)} subtitle={t(angles ? `${K}.collective.subtitleAngles` : `${K}.collective.subtitle`)}>
          <PitchGauge markers={gaugeMarkers} unit={angles ? '°' : ''} lo={gaugeLo} hi={gaugeHi} />
          <p className="text-[11px] text-content-tertiary">{t(`${K}.collective.gaugeHint`)}</p>

          {has('H_SV_MAN') && (
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-sm text-content">{t(`${K}.collective.svMan`)}</span>
                <span className="font-mono text-[10px] text-content-tertiary">H_SV_MAN</span>
              </div>
              <div className="flex gap-1 rounded-lg bg-surface-raised p-1">
                {SV_MAN_MODES.map((m) => (
                  <button
                    key={m}
                    disabled={armed}
                    onClick={() => setParameterImmediate('H_SV_MAN', m)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${svMan === m
                      ? (m === 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300')
                      : 'text-content-secondary hover:bg-surface hover:text-content'}`}
                  >
                    {t(`${K}.collective.svManMode.${m}`)}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-content-tertiary">{t(`${K}.collective.svManHint`)}</p>
            </div>
          )}

          {has('H_CYC_MAX') && (
            <DraggableSlider
              label={t(`${K}.collective.cycMax`)}
              value={num('H_CYC_MAX', 2500) / 100}
              onChange={(v) => setParameter('H_CYC_MAX', Math.round(v * 100))}
              min={0}
              max={45}
              step={0.5}
              color="#8B5CF6"
              unit="°"
              hint={has(hoverParam) ? t(`${K}.collective.hover`, { v: (num(hoverParam, 0.5) * 100).toFixed(0) }) : undefined}
            />
          )}

          {angles && (
            <div className="rounded-lg border border-subtle">
              <button onClick={() => setShowEndpoints((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-xs text-content-secondary hover:text-content">
                {t(`${K}.collective.endpoints`)}
                <ChevronDown className={`h-4 w-4 transition-transform ${showEndpoints ? 'rotate-180' : ''}`} />
              </button>
              {showEndpoints && (
                <div className="space-y-4 px-3 pb-3">
                  {slider('H_COL_MAX', t(`${K}.collective.max`), { min: 1000, max: 2000 }, '#EF4444', { narrow: { floor: (colMid ?? colMin) + 1 } })}
                  {slider('H_COL_MIN', t(`${K}.collective.min`), { min: 1000, max: 2000 }, '#F59E0B', { narrow: { ceil: (colMid ?? colMax) - 1 } })}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card icon={<Fan className="h-5 w-5 text-orange-400" />} tint="bg-orange-500/20" title={t(`${K}.rsc.title`)} subtitle={t(`${K}.rsc.subtitle`)}>
          {select('H_RSC_MODE', t(`${K}.rsc.mode`))}
          {rscChannels.length === 0 && <Warn>{t(`${K}.rsc.noOutput`)}</Warn>}
          {rpmFresh && (rpmFresh.rpm1 !== null || rpmFresh.rpm2 !== null) && (
            <div className="flex items-center gap-6 rounded-lg bg-surface-raised px-4 py-3">
              {rpmFresh.rpm1 !== null && (
                <div>
                  <div className="text-[11px] text-content-tertiary">{t(`${K}.rsc.headSpeed`)}</div>
                  <div className="text-xl font-semibold tabular-nums text-content">{t(`${K}.rsc.rpmValue`, { rpm: Math.round(rpmFresh.rpm1) })}</div>
                </div>
              )}
              {rpmFresh.rpm2 !== null && (
                <div>
                  <div className="text-[11px] text-content-tertiary">{t(`${K}.rsc.rpm2`)}</div>
                  <div className="text-xl font-semibold tabular-nums text-content">{t(`${K}.rsc.rpmValue`, { rpm: Math.round(rpmFresh.rpm2) })}</div>
                </div>
              )}
              {rscMode === 4 && has('H_RSC_GOV_SETPNT') && (
                <div className="ml-auto text-right">
                  <div className="text-[11px] text-content-tertiary">{t(`${K}.rsc.govTarget`)}</div>
                  <div className="text-sm tabular-nums text-content-secondary">{t(`${K}.rsc.rpmValue`, { rpm: Math.round(num('H_RSC_GOV_SETPNT', 0)) })}</div>
                </div>
              )}
            </div>
          )}
          {rscMode === 2 && slider('H_RSC_SETPOINT', t(`${K}.rsc.setpoint`), { min: 0, max: 100 }, '#F97316')}
          {(rscMode === 3 || rscMode === 4) && (
            <div className="rounded-lg bg-surface-raised p-3">
              <div className="mb-1 text-xs font-medium text-content">{t(`${K}.rsc.curve`)}</div>
              <ThrottleCurve
                values={THROTTLE_CURVE.map((n) => num(n, 0))}
                onCommit={(i, v) => setParameter(THROTTLE_CURVE[i]!, v)}
                xLabel={t(`${K}.rsc.curveX`)}
                yLabel={t(`${K}.rsc.curveY`)}
              />
            </div>
          )}
          {rscMode === 4 && (
            <div className="grid gap-4 md:grid-cols-2">
              {slider('H_RSC_GOV_SETPNT', t(`${K}.rsc.govRpm`), { min: 800, max: 3500 }, '#F43F5E')}
              {slider('H_RSC_GOV_RANGE', t(`${K}.rsc.govRange`), { min: 50, max: 200 }, '#F43F5E')}
              {slider('H_RSC_GOV_DROOP', t(`${K}.rsc.govDroop`), { min: 0, max: 150 }, '#F43F5E')}
              {slider('H_RSC_GOV_TCGAIN', t(`${K}.rsc.govTcGain`), { min: 50, max: 100 }, '#F43F5E')}
              {slider('H_RSC_GOV_DISGAG', t(`${K}.rsc.govDisengage`), { min: 0, max: 50 }, '#F43F5E')}
            </div>
          )}
          {rscMode === 4 && (!has('RPM1_TYPE') || num('RPM1_TYPE', 0) === 0) && <Warn>{t(`${K}.rsc.govNeedsRpm`)}</Warn>}
          <div className="grid gap-4 md:grid-cols-2">
            {slider('H_RSC_RAMP_TIME', t(`${K}.rsc.ramp`), { min: 0, max: 60 }, '#38BDF8', { hint: t(`${K}.rsc.rampHint`) })}
            {slider('H_RSC_RUNUP_TIME', t(`${K}.rsc.runup`), { min: 0, max: 60 }, '#22C55E', { hint: t(`${K}.rsc.runupHint`) })}
            {slider('H_RSC_IDLE', t(`${K}.rsc.idle`), { min: 0, max: 50 }, '#94A3B8', { hint: t(`${K}.rsc.idleHint`) })}
            {slider('H_RSC_CRITICAL', t(`${K}.rsc.critical`), { min: 0, max: 100 }, '#EF4444', { hint: t(`${K}.rsc.criticalHint`) })}
          </div>
          {runup < ramp + 1 && <Warn>{t(`${K}.rsc.runupTooShort`, { runup, ramp })}</Warn>}
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-sm text-content">{t(`${K}.interlock.title`)}</span>
              {/* i18n-exempt: parameter name */}
              <span className="font-mono text-[10px] text-content-tertiary">RCn_OPTION = 32</span>
            </div>
            <select
              value={ilCh ?? 0}
              onChange={(e) => void assignInterlock(Number(e.target.value))}
              className="w-full rounded-lg border bg-surface-raised px-3 py-2.5 text-sm text-content focus:border-blue-500 focus:outline-none"
            >
              <option value={0}>{t(`${K}.interlock.none`)}</option>
              {Array.from({ length: 12 }, (_, i) => i + 5).map((ch) => (
                <option key={ch} value={ch}>{t(`${K}.interlock.channel`, { ch })}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-content-tertiary">{ilCh ? t(`${K}.interlock.hint`) : t(`${K}.interlock.missing`)}</p>
          </div>
        </Card>

        <Card icon={<Wind className="h-5 w-5 text-violet-400" />} tint="bg-violet-500/20" title={t(`${K}.tail.title`)} subtitle={t(`${K}.tail.subtitle`)}>
          {select('H_TAIL_TYPE', t(`${K}.tail.type`))}
          {tailType === 1 && slider('H_GYR_GAIN', t(`${K}.tail.gyrGain`), { min: 0, max: 1000 }, '#A78BFA')}
          {tailType === 1 && slider('H_GYR_GAIN_ACRO', t(`${K}.tail.gyrGainAcro`), { min: 0, max: 1000 }, '#A78BFA')}
          {(tailType === 2 || tailType === 5) && slider('H_TAIL_SPEED', t(`${K}.tail.speed`), { min: 0, max: 100 }, '#F472B6')}
          {slider(colYawParam, t(`${K}.tail.colYaw`), { min: -10, max: 10 }, '#60A5FA', { hint: t(`${K}.tail.colYawHint`) })}
        </Card>
      </div>
    </div>
  );
}
