import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { usePseudoTxStore, rcFunctionsFromParams } from '../../../stores/pseudo-tx-store';
import { useConnectionStore } from '../../../stores/connection-store';
import { useParameterStore } from '../../../stores/parameter-store';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useVehicleClass } from '../../../hooks/useVehicleClass';
import { useHandoverCheck } from '../../../hooks/useHandoverCheck';
import { radioUsable, reversibleThrottle } from '../../../utils/joystick-safety';
import { GAUGE_COLORS } from './RoundGauge';
import { gaugeTint } from './ReadoutPrimitives';
import { useInDock } from './dock-context';

export type SticksVariant = 'full' | 'compact';

interface Pos { x: number; y: number }

const RADIO_FRESH_MS = 1500;
const mono = 'font-mono tabular-nums leading-none whitespace-nowrap';
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/** role=slider: the instrument drag ignores sliders, so dragging a pad flies instead of moving it. */
function Pad({ value, size, enabled, live, label, onChange, onRelease }: {
  value: Pos; size: number; enabled: boolean; live: boolean; label: string;
  onChange: (p: Pos) => void; onRelease: () => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  const fromEvent = (e: ReactPointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    onChange({ x: clamp(((e.clientX - r.left) / r.width) * 2 - 1), y: clamp(((e.clientY - r.top) / r.height) * 2 - 1) });
  };
  const end = () => { setActive(false); onRelease(); };
  const half = size / 2;
  const r = half - 9;
  const dx = half + value.x * r;
  const dy = half + value.y * r;
  const dot = !enabled ? GAUGE_COLORS.tickMinor : active ? GAUGE_COLORS.text : live ? GAUGE_COLORS.green : GAUGE_COLORS.textDim;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={ref}
        role="slider"
        aria-label={label}
        aria-disabled={!enabled}
        onPointerDown={(e) => {
          if (!enabled || e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setActive(true);
          fromEvent(e);
        }}
        onPointerMove={(e) => { if (active) fromEvent(e); }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={() => { if (active) end(); }}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative touch-none select-none ${enabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-45'}`}
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="block">
          <rect x={0.75} y={0.75} width={size - 1.5} height={size - 1.5} rx={10} fill={GAUGE_COLORS.bezel}
            stroke={live ? gaugeTint(GAUGE_COLORS.green, 55) : GAUGE_COLORS.bezelEdge} strokeWidth={1.5} />
          <line x1={half} y1={8} x2={half} y2={size - 8} stroke={GAUGE_COLORS.bezelEdge} strokeWidth={1} />
          <line x1={8} y1={half} x2={size - 8} y2={half} stroke={GAUGE_COLORS.bezelEdge} strokeWidth={1} />
          <circle cx={half} cy={half} r={r * 0.5} fill="none" stroke={GAUGE_COLORS.bezelEdge} strokeWidth={0.75} strokeDasharray="2 3" />
          <circle cx={dx} cy={dy} r={active ? 13 : 11} fill={gaugeTint(dot, active ? 22 : 14)} />
          <circle cx={dx} cy={dy} r={6} fill={dot} />
        </svg>
      </div>
      <span className={`${mono} text-[8px] font-semibold tracking-widest`} style={{ color: GAUGE_COLORS.tickMinor }}>{label}</span>
    </div>
  );
}

export function SticksInstrument({ variant = 'full' }: { variant?: SticksVariant } = {}): JSX.Element {
  const { t } = useTranslation();
  const inDock = useInDock();
  const enabled = usePseudoTxStore((s) => s.enabled);
  const virtual = usePseudoTxStore((s) => s.virtualAxes !== null);
  const control = usePseudoTxStore((s) => s.vehicleControl);
  const fps = usePseudoTxStore((s) => s.vehicleFps);
  const sendError = usePseudoTxStore((s) => s.vehicleSendError);
  const vehicleUp = useConnectionStore((s) => s.connectionState.isConnected);
  const params = useParameterStore((s) => s.parameters);
  const vehicleClass = useVehicleClass();
  const check = useHandoverCheck();
  const checkRef = useRef(check);
  checkRef.current = check;

  const param = useCallback((n: string) => {
    const v = params.get(n)?.value;
    return typeof v === 'number' ? v : undefined;
  }, [params]);
  const centredThrottle = reversibleThrottle(vehicleClass, param);
  const ours = control && virtual;
  const otherInControl = control && !virtual;

  const [left, setLeft] = useState<Pos>({ x: 0, y: centredThrottle ? 0 : 1 });
  const [right, setRight] = useState<Pos>({ x: 0, y: 0 });
  const [note, setNote] = useState<string | null>(null);
  const turnedOnStore = useRef(false);

  // while ours, every stick move goes on the wire
  useEffect(() => {
    if (ours) usePseudoTxStore.getState().setVirtualAxes([left.x, left.y, right.x, right.y]);
  }, [ours, left, right]);

  // control can also end elsewhere (link lost, panel, joystick unplugged): leave the pads neutral then too
  const wasOurs = useRef(false);
  useEffect(() => {
    if (wasOurs.current && !ours) {
      setLeft({ x: 0, y: centredThrottle ? 0 : 1 });
      setRight({ x: 0, y: 0 });
    }
    wasOurs.current = ours;
  }, [ours, centredThrottle]);

  // losing the window must not leave the sticks held deflected
  useEffect(() => {
    const centre = () => {
      setRight({ x: 0, y: 0 });
      setLeft((p) => ({ x: 0, y: centredThrottle ? 0 : p.y }));
    };
    window.addEventListener('blur', centre);
    return () => window.removeEventListener('blur', centre);
  }, [centredThrottle]);

  /** Start where the vehicle already is: its live radio if one is flying it, else neutral. */
  const startPositions = (): { l: Pos; r: Pos } => {
    const fns = rcFunctionsFromParams();
    const tel = useTelemetryStore.getState();
    const rc = tel.rcChannels.channels;
    const fresh = tel.lastRcChannels > 0 && Date.now() - tel.lastRcChannels < RADIO_FRESH_MS;
    if (fresh && radioUsable({ roles: fns, liveRc: rc })) {
      const at = (ch: number) => rc[ch - 1]!;
      return {
        l: { x: clamp((at(fns.yaw) - 1500) / 500), y: clamp(1 - (2 * (at(fns.throttle) - 1000)) / 1000) },
        r: { x: clamp((at(fns.roll) - 1500) / 500), y: clamp((at(fns.pitch) - 1500) / 500) },
      };
    }
    return { l: { x: 0, y: centredThrottle ? 0 : 1 }, r: { x: 0, y: 0 } };
  };

  const stopControl = () => {
    // display only: the vehicle goes straight back to its own radio, never through a neutral frame
    setLeft({ x: 0, y: centredThrottle ? 0 : 1 });
    setRight({ x: 0, y: 0 });
    const s = usePseudoTxStore.getState();
    s.disableVehicleControl();
    if (s.virtualAxes) s.setVirtualAxes(null);
    if (turnedOnStore.current) { s.disable(); turnedOnStore.current = false; }
  };

  const startControl = () => {
    setNote(null);
    if (!vehicleUp) { setNote(t('map:sticksInstrument.noVehicle')); return; }
    const { l, r } = startPositions();
    setLeft(l);
    setRight(r);
    const s = usePseudoTxStore.getState();
    if (!s.enabled) { s.enable(); turnedOnStore.current = true; }
    s.setVirtualAxes([l.x, l.y, r.x, r.y]);
    // the store needs one poll to turn these axes into channels before the check can judge them
    setTimeout(() => {
      const c = checkRef.current;
      if (!c.ok) { setNote(c.problems[0] ?? null); stopControl(); return; }
      const res = usePseudoTxStore.getState().enableVehicleControl();
      if (!res.ok) { setNote(res.reason ?? null); stopControl(); }
    }, 80);
  };

  const status = ours
    ? { text: t('map:sticksInstrument.inControl', { fps }), color: GAUGE_COLORS.green }
    : otherInControl
      ? { text: t('map:sticksInstrument.joystickInControl'), color: GAUGE_COLORS.amber }
      : !vehicleUp
        ? { text: t('map:sticksInstrument.noVehicle'), color: GAUGE_COLORS.textDim }
        : { text: t('map:sticksInstrument.off'), color: GAUGE_COLORS.textDim };
  const message = sendError ?? note;
  const box = variant === 'full' ? 104 : 80;
  const chrome = inDock ? {} : { background: GAUGE_COLORS.face, border: `1.5px solid ${ours ? gaugeTint(GAUGE_COLORS.green, 60) : GAUGE_COLORS.bezelEdge}` };

  return (
    <div className={`select-none px-3 pt-2 pb-2.5 ${inDock ? '' : 'rounded-lg shadow-xl'}`} style={{ ...chrome, color: GAUGE_COLORS.text }}>
      <div className="mb-2 flex items-center gap-2">
        {variant === 'full' && (
          <span className="text-[9px] font-semibold tracking-widest uppercase leading-none" style={{ color: GAUGE_COLORS.textDim }}>{t('map:sticksInstrument.title')}</span>
        )}
        <span className={`${mono} text-[9.5px] font-bold tracking-wider`} style={{ color: status.color }}>{status.text}</span>
        <button
          type="button"
          onClick={() => (control ? stopControl() : startControl())}
          data-tip={control ? t('map:sticksInstrument.offTip') : t('map:sticksInstrument.onTip')}
          className={`${mono} ml-auto flex items-center gap-1.5 rounded-full py-[3px] pl-1 pr-2 text-[9px] font-bold tracking-wider transition-colors`}
          style={control
            ? { color: GAUGE_COLORS.green, background: gaugeTint(GAUGE_COLORS.green, 16), border: `1px solid ${gaugeTint(GAUGE_COLORS.green, 55)}` }
            : { color: GAUGE_COLORS.textDim, border: `1px solid ${GAUGE_COLORS.bezelEdge}` }}
        >
          <span className="relative h-3 w-5 rounded-full" style={{ background: control ? GAUGE_COLORS.green : GAUGE_COLORS.bezelEdge }}>
            <span className="absolute top-0.5 h-2 w-2 rounded-full bg-white transition-all" style={{ left: control ? 10 : 2 }} />
          </span>
          {t('map:sticksInstrument.control')}
        </button>
      </div>
      <div className="flex items-start gap-3">
        <Pad
          value={left} size={box} enabled={ours} live={ours} label={t('map:sticksInstrument.left')}
          onChange={setLeft}
          onRelease={() => setLeft((p) => ({ x: 0, y: centredThrottle ? 0 : p.y }))}
        />
        <Pad
          value={right} size={box} enabled={ours} live={ours} label={t('map:sticksInstrument.right')}
          onChange={setRight}
          onRelease={() => setRight({ x: 0, y: 0 })}
        />
      </div>
      {message && <div className="mt-1.5 text-[10px] leading-snug" style={{ color: GAUGE_COLORS.amber, maxWidth: 2 * box + 12 }}>{message}</div>}
      {!enabled && !message && variant === 'full' && (
        <div className="mt-1.5 text-[10px] leading-snug" style={{ color: GAUGE_COLORS.textDim, maxWidth: 2 * box + 12 }}>{t('map:sticksInstrument.hint')}</div>
      )}
    </div>
  );
}
