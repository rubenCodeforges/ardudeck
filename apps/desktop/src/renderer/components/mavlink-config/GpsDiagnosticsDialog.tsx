// UBX diagnostics through the autopilot's GPS port: sky view, signals, interference, constellations, u-center bridge.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  X, Satellite, Radio, Cable, AlertTriangle, Loader2, Crosshair, Signal, Ruler, ShieldAlert,
  CheckCircle2, Info, Copy, Check, Compass, BarChart3, Settings2, FlaskConical,
} from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import { MetricTile, type TrackConfig } from '../weather/MetricTile';
import { t as i18nT } from '../../../shared/i18n/index.js';
import type { GpsDiagEvent, UbxPvt, UbxRfBlock, UbxSatellite, UbxVersion } from '../../../shared/gps-diagnostics-types';

const GREEN = 'var(--gauge-green)';
const AMBER = 'var(--gauge-amber)';
const RED = 'var(--gauge-red)';

const GNSS: Record<number, { name: string; color: string }> = {
  0: { name: 'GPS', color: '#3b82f6' },
  1: { name: 'SBAS', color: '#94a3b8' },
  2: { name: 'Galileo', color: '#10b981' },
  3: { name: 'BeiDou', color: '#ef4444' },
  5: { name: 'QZSS', color: '#a855f7' },
  6: { name: 'GLONASS', color: '#f59e0b' },
  7: { name: 'NavIC', color: '#14b8a6' },
};
const gnssName = (id: number) => GNSS[id]?.name ?? i18nT('mavlink-config:gpsDiagnosticsDialog.systemN', { id });
const gnssColor = (id: number) => GNSS[id]?.color ?? '#94a3b8';

// ArduPilot GPSn_GNSS_MODE bits, keyed to the UBX gnssId for the colour dot. 0 = receiver default.
const GNSS_MODE_BITS = [
  { bit: 0, gnssId: 0 },
  { bit: 2, gnssId: 2 },
  { bit: 3, gnssId: 3 },
  { bit: 6, gnssId: 6 },
  { bit: 5, gnssId: 5 },
  { bit: 1, gnssId: 1 },
];

const FIX_KEYS = ['noFix', 'deadReckoning', 'fix2d', 'fix3d', 'gnssDr', 'timeOnly'].map((k) => `mavlink-config:gpsDiagnosticsDialog.fix.${k}`);
const JAM_KEYS = ['common:unknown', 'mavlink-config:gpsDiagnosticsDialog.jam.ok', 'mavlink-config:gpsDiagnosticsDialog.jam.warning', 'mavlink-config:gpsDiagnosticsDialog.jam.critical'];
const ANT_KEYS = ['mavlink-config:gpsDiagnosticsDialog.ant.initialising', 'common:unknown', 'mavlink-config:gpsDiagnosticsDialog.ant.ok', 'mavlink-config:gpsDiagnosticsDialog.ant.shortCircuit', 'mavlink-config:gpsDiagnosticsDialog.ant.openCircuit'];
const fixName = (n: number): string | undefined => (FIX_KEYS[n] ? i18nT(FIX_KEYS[n]!) : undefined);
const jamStateName = (n: number): string | undefined => (JAM_KEYS[n] ? i18nT(JAM_KEYS[n]!) : undefined);
const antStatusName = (n: number): string | undefined => (ANT_KEYS[n] ? i18nT(ANT_KEYS[n]!) : undefined);
const DEFAULT_BRIDGE_PORT = 2001;
/** No satellite report this long after data started flowing: the receiver is not speaking UBX. */
const NO_UBX_AFTER_MS = 5000;

const SEGMENT = 'flex bg-surface-input rounded-lg border border-subtle overflow-hidden';
const segmentBtn = (active: boolean) =>
  `px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-blue-500/20 text-blue-400' : 'text-content-secondary hover:text-content'}`;

function Card({ icon, tint, title, subtitle, children, className = '' }: {
  icon: ReactNode; tint: string; title: string; subtitle?: string; children: ReactNode; className?: string;
}) {
  return (
    <section className={`bg-surface rounded-xl border border-subtle p-4 ${className}`}>
      <div className="mb-3 flex items-center gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}>{icon}</div>
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-content">{title}</h4>
          {subtitle && <p className="text-[11px] text-content-secondary">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-subtle bg-surface px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-raised">{icon}</div>
      <h4 className="text-sm font-medium text-content">{title}</h4>
      <div className="max-w-md text-xs leading-relaxed text-content-secondary">{children}</div>
    </div>
  );
}

function SkyPlot({ sats }: { sats: UbxSatellite[] }) {
  const R = 92;
  const visible = sats.filter((s) => s.cno > 0 && s.elevDeg >= 0);
  return (
    <svg viewBox="-110 -110 220 220" className="mx-auto h-60 w-60">
      <circle r={R} fill="var(--bg-surface-raised)" stroke="currentColor" className="text-content-tertiary" strokeOpacity={0.4} />
      {[60, 30].map((el) => (
        <g key={el}>
          <circle r={((90 - el) / 90) * R} fill="none" stroke="currentColor" className="text-content-tertiary" strokeOpacity={0.25} strokeDasharray="2 3" />
          <text x={3} y={-((90 - el) / 90) * R - 2} fontSize={7} className="fill-content-tertiary">{el}°</text>
        </g>
      ))}
      <line x1={-R} y1={0} x2={R} y2={0} stroke="currentColor" className="text-content-tertiary" strokeOpacity={0.15} />
      <line x1={0} y1={-R} x2={0} y2={R} stroke="currentColor" className="text-content-tertiary" strokeOpacity={0.15} />
      {[['N', 0, -R - 7], ['E', R + 7, 3], ['S', 0, R + 12], ['W', -R - 7, 3]].map(([t, x, y]) => (
        <text key={t as string} x={x as number} y={y as number} textAnchor="middle" fontSize={9} fontWeight={600} className="fill-content-secondary">{t}</text>
      ))}
      {visible.map((s) => {
        const d = ((90 - s.elevDeg) / 90) * R;
        const a = (s.azimDeg * Math.PI) / 180;
        const c = gnssColor(s.gnssId);
        return (
          <g key={`${s.gnssId}-${s.svId}`} transform={`translate(${d * Math.sin(a)} ${-d * Math.cos(a)})`}>
            <title>{i18nT(s.used ? 'mavlink-config:gpsDiagnosticsDialog.skySatTitleUsed' : 'mavlink-config:gpsDiagnosticsDialog.skySatTitle', { name: gnssName(s.gnssId), sv: s.svId, cno: s.cno, elev: s.elevDeg })}</title>
            <circle r={5.5} fill={s.used ? c : 'var(--bg-surface-solid)'} stroke={c} strokeWidth={1.6} />
            <text y={-8} textAnchor="middle" fontSize={6.5} className="fill-content-secondary">{s.svId}</text>
          </g>
        );
      })}
    </svg>
  );
}

function SignalChart({ sats }: { sats: UbxSatellite[] }) {
  const groups = useMemo(() => {
    const m = new Map<number, UbxSatellite[]>();
    for (const s of sats.filter((x) => x.cno > 0)) m.set(s.gnssId, [...(m.get(s.gnssId) ?? []), s]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([id, list]) => [id, list.sort((a, b) => b.cno - a.cno)] as const);
  }, [sats]);
  const H = 120;
  const MAX = 50;
  return (
    <div className="relative">
      {[40, 30, 20].map((db) => (
        <div key={db} className="pointer-events-none absolute left-0 right-0 flex items-center gap-1.5" style={{ top: H - (db / MAX) * H }}>
          <span className="w-6 text-right text-[9px] tabular-nums text-content-tertiary">{db}</span>
          <div className="h-px flex-1 border-t border-dashed border-subtle" />
        </div>
      ))}
      <div className="ml-8 flex items-end gap-3 overflow-x-auto pb-1">
        {groups.map(([gnssId, list]) => (
          <div key={gnssId} className="flex flex-col">
            <div className="flex items-end gap-[3px]" style={{ height: H }}>
              {list.map((s) => (
                <div key={s.svId} className="group relative flex w-3.5 flex-col items-center justify-end" style={{ height: H }}>
                  <div
                    className="w-full rounded-t-sm transition-[height] duration-500"
                    style={{
                      height: `${Math.min(100, (s.cno / MAX) * 100)}%`,
                      background: gnssColor(gnssId),
                      opacity: s.used ? 1 : 0.3,
                    }}
                    title={i18nT(s.used ? 'mavlink-config:gpsDiagnosticsDialog.barTitleUsed' : 'mavlink-config:gpsDiagnosticsDialog.barTitleUnused', { name: gnssName(gnssId), sv: s.svId, cno: s.cno })}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-[3px]">
              {list.map((s) => (
                <span key={s.svId} className="w-3.5 text-center text-[8px] tabular-nums text-content-tertiary">{s.svId}</span>
              ))}
            </div>
            <div className="mt-1 flex items-center gap-1 border-t border-subtle pt-1 text-[10px] font-medium" style={{ color: gnssColor(gnssId) }}>
              {gnssName(gnssId)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type Finding = { level: 'ok' | 'warn' | 'bad'; text: string };

function diagnose(sats: UbxSatellite[], rf: UbxRfBlock[], pvt: UbxPvt | null): Finding[] {
  const out: Finding[] = [];
  const tracked = sats.filter((s) => s.cno > 0);
  const used = sats.filter((s) => s.used);
  if (rf.some((b) => b.jammingState === 3 || b.jamInd > 160)) {
    out.push({ level: 'bad', text: i18nT('mavlink-config:gpsDiagnosticsDialog.findStrongInterference') });
  } else if (rf.some((b) => b.jammingState === 2 || b.jamInd > 80)) {
    out.push({ level: 'warn', text: i18nT('mavlink-config:gpsDiagnosticsDialog.findSomeInterference') });
  }
  if (rf.some((b) => b.antStatus === 3 || b.antStatus === 4)) {
    out.push({ level: 'bad', text: i18nT('mavlink-config:gpsDiagnosticsDialog.findAntenna', { status: antStatusName(rf.find((b) => b.antStatus >= 3)!.antStatus)!.toLowerCase() }) });
  }
  if (used.length > 0) {
    const avg = used.reduce((a, s) => a + s.cno, 0) / used.length;
    if (avg < 30) out.push({ level: 'warn', text: i18nT('mavlink-config:gpsDiagnosticsDialog.findWeakSignal', { avg: avg.toFixed(0) }) });
  }
  const systems = new Set(tracked.map((s) => s.gnssId).filter((g) => g !== 1));
  if (tracked.length > 0 && systems.size === 1) {
    out.push({ level: 'warn', text: i18nT('mavlink-config:gpsDiagnosticsDialog.findSingleSystem', { name: gnssName([...systems][0]!) }) });
  }
  if (pvt && pvt.fixType < 3 && tracked.length >= 6) {
    out.push({ level: 'warn', text: i18nT('mavlink-config:gpsDiagnosticsDialog.findNo3dFix') });
  }
  if (out.length === 0 && used.length >= 10) out.push({ level: 'ok', text: i18nT('mavlink-config:gpsDiagnosticsDialog.findHealthy') });
  return out;
}

function FindingRow({ f }: { f: Finding }) {
  const style = f.level === 'ok'
    ? { color: 'var(--status-success-fg)', background: 'var(--status-success-bg)' }
    : f.level === 'warn'
      ? { color: 'var(--status-warn-fg)', background: 'var(--status-warn-bg)' }
      : { color: 'var(--status-danger-fg)', background: 'var(--status-danger-bg)' };
  const Icon = f.level === 'ok' ? CheckCircle2 : f.level === 'warn' ? AlertTriangle : ShieldAlert;
  return (
    <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed" style={style}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{f.text}</span>
    </div>
  );
}

function RfDetails({ blocks }: { blocks: UbxRfBlock[] }) {
  const { t } = useTranslation();
  if (blocks.length === 0) return <p className="text-xs text-content-tertiary">{t('mavlink-config:gpsDiagnosticsDialog.rfWaiting')}</p>;
  return (
    <div className="space-y-2">
      {blocks.map((b) => (
        <div key={b.blockId} className="rounded-lg bg-surface-raised p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-content-secondary">
            {blocks.length > 1 ? t('mavlink-config:gpsDiagnosticsDialog.rfBand', { n: b.blockId + 1 }) : t('mavlink-config:gpsDiagnosticsDialog.rfFrontEnd')}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-content-secondary">{t('mavlink-config:gpsDiagnosticsDialog.jamming')}</dt>
            <dd className="text-right font-medium" style={{ color: b.jammingState >= 2 ? (b.jammingState === 3 ? RED : AMBER) : 'var(--text-primary)' }}>
              {jamStateName(b.jammingState)}
            </dd>
            <dt className="text-content-secondary">{t('mavlink-config:gpsDiagnosticsDialog.noiseLevel')}</dt>
            <dd className="text-right tabular-nums text-content">{b.noisePerMs}</dd>
            <dt className="text-content-secondary">{t('mavlink-config:gpsDiagnosticsDialog.gainAgc')}</dt>
            <dd className="text-right tabular-nums text-content">{Math.round((b.agcCnt / 8191) * 100)}%</dd>
            <dt className="text-content-secondary">{t('mavlink-config:gpsDiagnosticsDialog.antenna')}</dt>
            <dd className="text-right text-content">
              {antStatusName(b.antStatus) ?? b.antStatus}{b.antPower === 1 ? t('mavlink-config:gpsDiagnosticsDialog.powered') : ''}
            </dd>
          </dl>
        </div>
      ))}
    </div>
  );
}

function ReceiverSetup() {
  const { t } = useTranslation();
  const { parameters, setParameter } = useParameterStore();
  const modeName = parameters.has('GPS1_GNSS_MODE') ? 'GPS1_GNSS_MODE' : parameters.has('GPS_GNSS_MODE') ? 'GPS_GNSS_MODE' : null;
  const rateName = parameters.has('GPS1_RATE_MS') ? 'GPS1_RATE_MS' : parameters.has('GPS_RATE_MS') ? 'GPS_RATE_MS' : null;
  const mode = modeName ? Number(parameters.get(modeName)?.value ?? 0) : 0;
  const rate = rateName ? Number(parameters.get(rateName)?.value ?? 200) : 200;
  const sbas = Number(parameters.get('GPS_SBAS_MODE')?.value ?? 2);
  const autoConfig = Number(parameters.get('GPS_AUTO_CONFIG')?.value ?? 1);
  const [saved, setSaved] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const set = async (name: string, value: number) => {
    setSaved(null);
    setFailed(null);
    if (await setParameter(name, value)) setSaved(t('mavlink-config:gpsDiagnosticsDialog.savedReboot'));
    else setFailed(t('mavlink-config:gpsDiagnosticsDialog.notAccepted', { name }));
  };

  if (!modeName) return <p className="text-xs text-content-tertiary">{t('mavlink-config:gpsDiagnosticsDialog.noConstellationSetting')}</p>;
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-content-secondary">{t('mavlink-config:gpsDiagnosticsDialog.constellations')}</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => void set(modeName, 0)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${mode === 0 ? 'border-blue-500/50 bg-blue-500/15 text-blue-400' : 'border-subtle text-content-secondary hover:text-content'}`}
          >
            {t('mavlink-config:gpsDiagnosticsDialog.receiverDefault')}
          </button>
          {GNSS_MODE_BITS.map(({ bit, gnssId }) => {
            const on = mode !== 0 && (mode & (1 << bit)) !== 0;
            return (
              <button
                key={bit}
                onClick={() => void set(modeName, on ? mode & ~(1 << bit) : mode | (1 << bit))}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${on ? 'border-transparent text-content' : 'border-subtle text-content-secondary hover:text-content'}`}
                style={on ? { background: `${gnssColor(gnssId)}26`, borderColor: `${gnssColor(gnssId)}66` } : undefined}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: gnssColor(gnssId), opacity: on ? 1 : 0.4 }} />
                {gnssName(gnssId)}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-content-tertiary">{t('mavlink-config:gpsDiagnosticsDialog.constellationsHint')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {rateName && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-content-secondary">{t('mavlink-config:gpsDiagnosticsDialog.updateRate')}</span>
            <div className={SEGMENT}>
              {[[200, '5 Hz'], [125, '8 Hz'], [100, '10 Hz']].map(([ms, label]) => (
                <button key={ms} onClick={() => void set(rateName, ms as number)} className={segmentBtn(rate === ms)}>{label}</button>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs text-content-secondary">SBAS</span>
          <div className={SEGMENT}>
            {[[0, 'common:off'], [1, 'common:on'], [2, 'common:default']].map(([v, labelKey]) => (
              <button key={v} onClick={() => void set('GPS_SBAS_MODE', v as number)} className={segmentBtn(sbas === v)}>{t(labelKey as string)}</button>
            ))}
          </div>
        </div>
      </div>

      {autoConfig === 0 && (
        <FindingRow f={{ level: 'warn', text: t('mavlink-config:gpsDiagnosticsDialog.autoConfigOff') }} />
      )}
      {saved && <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--status-success-fg)' }}><Check className="h-3.5 w-3.5" />{saved}</p>}
      {failed && <p className="text-xs" style={{ color: 'var(--status-danger-fg)' }}>{failed}</p>}
    </div>
  );
}

function UcenterBridge({ open, bridge }: { open: boolean; bridge: { port: number | null; clients: number; error?: string } }) {
  const { t } = useTranslation();
  const [port, setPort] = useState(DEFAULT_BRIDGE_PORT);
  const [copied, setCopied] = useState(false);
  const running = bridge.port !== null;
  const address = `127.0.0.1:${bridge.port ?? port}`;
  const copy = () => {
    void navigator.clipboard?.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg bg-surface-raised px-3 py-2">
        <span
          className={`h-2 w-2 rounded-full ${running ? 'animate-pulse' : ''}`}
          style={{ background: running ? (bridge.clients > 0 ? GREEN : AMBER) : 'var(--text-tertiary)' }}
        />
        <span className="flex-1 text-xs text-content">
          {running ? (bridge.clients > 0 ? t('mavlink-config:gpsDiagnosticsDialog.ucenterConnected') : t('mavlink-config:gpsDiagnosticsDialog.waitingUcenter')) : t('mavlink-config:gpsDiagnosticsDialog.bridgeOff')}
        </span>
        <code className="font-mono text-xs text-content-secondary">{address}</code>
        <button onClick={copy} data-tip={t('mavlink-config:gpsDiagnosticsDialog.copyAddress')} className="rounded p-1 text-content-secondary hover:bg-surface-overlay hover:text-content">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-content-secondary">{t('common:port')}</label>
        <input
          type="number"
          value={port}
          disabled={running}
          onChange={(e) => setPort(Number(e.target.value))}
          className="input w-24 py-1 text-xs"
        />
        <button
          disabled={!open}
          onClick={() => void (running ? window.electronAPI.gpsDiagBridgeStop() : window.electronAPI.gpsDiagBridgeStart(port))}
          className={`ml-auto rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
            running ? 'border border-subtle bg-surface-raised text-content hover:bg-surface-overlay' : 'bg-blue-600 text-white hover:bg-blue-500'
          }`}
        >
          {running ? t('mavlink-config:gpsDiagnosticsDialog.stopBridge') : t('mavlink-config:gpsDiagnosticsDialog.startBridge')}
        </button>
      </div>
      {bridge.error && <p className="text-xs" style={{ color: 'var(--status-danger-fg)' }}>{bridge.error}</p>}
      <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-content-tertiary">
        <li>{t('mavlink-config:gpsDiagnosticsDialog.bridgeStep1')}</li>
        <li>{t('mavlink-config:gpsDiagnosticsDialog.bridgeStep2', { address })}</li>
        <li>{t('mavlink-config:gpsDiagnosticsDialog.bridgeStep3')}</li>
      </ol>
    </div>
  );
}

const signalTrack = (avg: number): TrackConfig => ({
  min: 10, max: 50, value: avg,
  zones: [{ from: 10, to: 25, color: RED }, { from: 25, to: 32, color: AMBER }, { from: 32, to: 50, color: GREEN }],
  markerColor: avg >= 32 ? GREEN : avg >= 25 ? AMBER : RED,
  tip: i18nT('mavlink-config:gpsDiagnosticsDialog.signalTip'),
});

const jamTrack = (ind: number): TrackConfig => ({
  min: 0, max: 255, value: ind,
  zones: [{ from: 0, to: 80, color: GREEN }, { from: 80, to: 160, color: AMBER }, { from: 160, to: 255, color: RED }],
  markerColor: ind >= 160 ? RED : ind >= 80 ? AMBER : GREEN,
  tip: i18nT('mavlink-config:gpsDiagnosticsDialog.jamTip'),
});

export function GpsDiagnosticsDialog({ onClose }: { onClose: () => void }) {
  const isSitl = useConnectionStore((s) => s.connectionState.isSitl ?? false);
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sats, setSats] = useState<UbxSatellite[] | null>(null);
  const [pvt, setPvt] = useState<UbxPvt | null>(null);
  const [rf, setRf] = useState<UbxRfBlock[]>([]);
  const [version, setVersion] = useState<UbxVersion | null>(null);
  const [rxRate, setRxRate] = useState(0);
  const [firstDataAt, setFirstDataAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [bridge, setBridge] = useState<{ port: number | null; clients: number; error?: string }>({ port: null, clients: 0 });
  const lastTraffic = useRef<{ bytes: number; at: number } | null>(null);

  useEffect(() => {
    const off = window.electronAPI.onGpsDiagEvent((e: GpsDiagEvent) => {
      if (e.kind === 'state') {
        setOpen(e.open);
        if (e.error) setError(e.error);
      } else if (e.kind === 'sats') setSats(e.sats);
      else if (e.kind === 'pvt') setPvt(e.pvt);
      else if (e.kind === 'rf') setRf(e.blocks);
      else if (e.kind === 'version') setVersion(e.version);
      else if (e.kind === 'bridge') setBridge({ port: e.port, clients: e.clients, error: e.error });
      else if (e.kind === 'traffic') {
        const t = Date.now();
        const prev = lastTraffic.current;
        if (prev && t > prev.at) setRxRate(((e.rxBytes - prev.bytes) * 1000) / (t - prev.at));
        lastTraffic.current = { bytes: e.rxBytes, at: t };
        if (e.rxBytes > 0) setFirstDataAt((v) => v ?? t);
      }
    });
    void window.electronAPI.gpsDiagStart().then((r) => { if (!r.ok) setError(r.error ?? i18nT('mavlink-config:gpsDiagnosticsDialog.couldNotOpenPort')); });
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      off();
      window.clearInterval(tick);
      void window.electronAPI.gpsDiagStop();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = sats ?? [];
  const tracked = list.filter((s) => s.cno > 0);
  const used = list.filter((s) => s.used);
  const avgCno = used.length ? used.reduce((a, s) => a + s.cno, 0) / used.length : 0;
  const worstJam = rf.reduce((m, b) => Math.max(m, b.jamInd), 0);
  const worstJamState = rf.reduce((m, b) => Math.max(m, b.jammingState), 0);
  const findings = diagnose(list, rf, pvt);
  const legend = useMemo(() => {
    const m = new Map<number, { tracked: number; used: number }>();
    for (const s of tracked) {
      const c = m.get(s.gnssId) ?? { tracked: 0, used: 0 };
      c.tracked++;
      if (s.used) c.used++;
      m.set(s.gnssId, c);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [tracked]);

  const hasSatReport = sats !== null;
  const noUbx = !hasSatReport && firstDataAt !== null && now - firstDataAt > NO_UBX_AFTER_MS;
  const status: { label: string; color: string; pulse: boolean } = error
    ? { label: t('mavlink-config:gpsDiagnosticsDialog.notAvailable'), color: RED, pulse: false }
    : !open
      ? { label: t('mavlink-config:gpsDiagnosticsDialog.openingPort'), color: AMBER, pulse: true }
      : rxRate > 0
        ? { label: t('mavlink-config:gpsDiagnosticsDialog.live', { rate: (rxRate / 1024).toFixed(1) }), color: GREEN, pulse: true }
        : { label: t('mavlink-config:gpsDiagnosticsDialog.waitingReceiver'), color: AMBER, pulse: true };

  const body = (() => {
    if (error) {
      return (
        <EmptyState icon={<AlertTriangle className="h-6 w-6" style={{ color: RED }} />} title={t('mavlink-config:gpsDiagnosticsDialog.couldNotStart')}>{error}</EmptyState>
      );
    }
    if (isSitl && !hasSatReport) {
      return (
        <EmptyState icon={<FlaskConical className="h-6 w-6 text-blue-400" />} title={t('mavlink-config:gpsDiagnosticsDialog.sitlTitle')}>
          {t('mavlink-config:gpsDiagnosticsDialog.sitlBody')}
          {pvt && <div className="mt-2 text-content">{t('mavlink-config:gpsDiagnosticsDialog.simulatedFix', { fix: fixName(pvt.fixType) ?? pvt.fixType, count: pvt.numSv })}</div>}
        </EmptyState>
      );
    }
    if (noUbx) {
      return (
        <EmptyState icon={<Info className="h-6 w-6 text-blue-400" />} title={t('mavlink-config:gpsDiagnosticsDialog.noUbxTitle')}>
          {t('mavlink-config:gpsDiagnosticsDialog.noUbxBody')}
        </EmptyState>
      );
    }
    if (!hasSatReport) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-xs text-content-secondary">
          <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          {t('mavlink-config:gpsDiagnosticsDialog.askingSats')}
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MetricTile
            icon={<Crosshair className="h-3.5 w-3.5" />}
            label={t('mavlink-config:gpsDiagnosticsDialog.fixLabel')}
            value={pvt ? fixName(pvt.fixType) ?? '?' : '...'}
            valueColor={pvt && pvt.fixType >= 3 ? GREEN : AMBER}
            animate={false}
          />
          <MetricTile
            icon={<Satellite className="h-3.5 w-3.5" />}
            label={t('mavlink-config:gpsDiagnosticsDialog.satsUsed')}
            value={`${used.length}`}
            unit={t('mavlink-config:gpsDiagnosticsDialog.ofTracked', { n: tracked.length })}
            valueColor={used.length >= 12 ? GREEN : used.length >= 8 ? AMBER : RED}
            animate={false}
          />
          <MetricTile
            icon={<Signal className="h-3.5 w-3.5" />}
            label={t('common:signal')}
            value={used.length ? avgCno.toFixed(0) : '-'}
            unit="dBHz"
            track={used.length ? signalTrack(avgCno) : undefined}
            animate
          />
          <MetricTile
            icon={<Ruler className="h-3.5 w-3.5" />}
            label={t('mavlink-config:gpsDiagnosticsDialog.accuracy')}
            value={pvt && pvt.hAccM < 1000 ? pvt.hAccM.toFixed(1) : '-'}
            unit={pvt && pvt.vAccM < 1000 ? t('mavlink-config:gpsDiagnosticsDialog.accuracyVert', { v: pvt.vAccM.toFixed(1) }) : 'm'}
            animate={false}
          />
          <MetricTile
            icon={<Radio className="h-3.5 w-3.5" />}
            label={t('mavlink-config:gpsDiagnosticsDialog.interference')}
            value={rf.length ? jamStateName(worstJamState)! : '-'}
            valueColor={worstJamState >= 3 ? RED : worstJamState === 2 ? AMBER : undefined}
            track={rf.length ? jamTrack(worstJam) : undefined}
            animate
          />
        </div>

        {findings.length > 0 && <div className="space-y-2">{findings.map((f) => <FindingRow key={f.text} f={f} />)}</div>}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
          <Card icon={<Compass className="h-4 w-4 text-emerald-400" />} tint="bg-emerald-500/20" title={t('mavlink-config:gpsDiagnosticsDialog.skyView')} subtitle={t('mavlink-config:gpsDiagnosticsDialog.skyViewSub')}>
            <SkyPlot sats={list} />
            <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
              {legend.map(([id, c]) => (
                <span key={id} className="flex items-center gap-1.5 text-[11px] text-content-secondary">
                  <span className="h-2 w-2 rounded-full" style={{ background: gnssColor(id) }} />
                  {gnssName(id)} <span className="tabular-nums text-content-tertiary">{c.used}/{c.tracked}</span>
                </span>
              ))}
            </div>
          </Card>
          <Card icon={<BarChart3 className="h-4 w-4 text-blue-400" />} tint="bg-blue-500/20" title={t('mavlink-config:gpsDiagnosticsDialog.signalStrength')} subtitle={t('mavlink-config:gpsDiagnosticsDialog.signalStrengthSub')}>
            {tracked.length ? <SignalChart sats={list} /> : <p className="py-10 text-center text-xs text-content-tertiary">{t('mavlink-config:gpsDiagnosticsDialog.noSatsYet')}</p>}
          </Card>
        </div>
      </div>
    );
  })();

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/50" onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center p-6">
        <div className="pointer-events-auto flex max-h-[92vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-xl border border-subtle bg-surface-solid shadow-2xl">
          <div className="flex items-center gap-3 border-b border-subtle px-5 py-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20">
              <Satellite className="h-[18px] w-[18px] text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-content">{t('mavlink-config:gpsDiagnosticsDialog.title')}</h3>
              <p className="truncate text-[11px] text-content-secondary">
                {version ? t('mavlink-config:gpsDiagnosticsDialog.versionLine', { software: version.software, hardware: version.hardware }) : t('mavlink-config:gpsDiagnosticsDialog.subtitle')}
              </p>
            </div>
            <span className="ml-auto flex items-center gap-2 rounded-full border border-subtle bg-surface px-3 py-1 text-[11px] text-content-secondary">
              <span className={`h-2 w-2 rounded-full ${status.pulse ? 'animate-pulse' : ''}`} style={{ background: status.color }} />
              {status.label}
            </span>
            <button onClick={onClose} data-tip={t('mavlink-config:gpsDiagnosticsDialog.closeTip')} className="rounded p-1.5 text-content-secondary hover:bg-surface-raised hover:text-content">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 border-b border-subtle px-5 py-2 text-[11px]" style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-fg)' }}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {t('mavlink-config:gpsDiagnosticsDialog.exclusiveWarning')}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-surface-base p-5">
            {body}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card icon={<Settings2 className="h-4 w-4 text-purple-400" />} tint="bg-purple-500/20" title={t('mavlink-config:gpsDiagnosticsDialog.receiverSetup')} subtitle={t('mavlink-config:gpsDiagnosticsDialog.receiverSetupSub')} className="lg:col-span-1">
                <ReceiverSetup />
              </Card>
              <Card icon={<Radio className="h-4 w-4 text-amber-400" />} tint="bg-amber-500/20" title={t('mavlink-config:gpsDiagnosticsDialog.interferenceAntenna')} subtitle={t('mavlink-config:gpsDiagnosticsDialog.interferenceAntennaSub')}>
                <RfDetails blocks={rf} />
              </Card>
              <Card icon={<Cable className="h-4 w-4 text-teal-400" />} tint="bg-teal-500/20" title={t('mavlink-config:gpsDiagnosticsDialog.ucenterBridge')} subtitle={t('mavlink-config:gpsDiagnosticsDialog.ucenterBridgeSub')}>
                <UcenterBridge open={open} bridge={bridge} />
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
