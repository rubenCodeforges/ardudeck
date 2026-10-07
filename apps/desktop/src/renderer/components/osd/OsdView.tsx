/**
 * OSD Designer
 *
 * A real OSD layout editor: design the on-screen-display, preview it against
 * demo values or live telemetry, then read it from / upload it to the flight
 * controller (ArduPilot over MAVLink parameters, Betaflight/iNAV over MSP).
 *
 * Layout:
 *   Toolbar  — preview data source + display options
 *   Sync bar — device, screen tabs, Load / Upload, presets  (OsdSyncBar)
 *   Body     — element library | always-editable canvas | contextual panel
 */

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { MonitorPlay, Cpu, Radio, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { OsdVideoBackdrop } from './OsdVideoBackdrop';
import { useOsdStore, BUNDLED_FONT_NAMES, type OsdElementKey, type OsdElementPosition, type OsdDataSource } from '../../stores/osd-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { OsdCanvas } from './OsdCanvas';
import { OsdElementOverlay } from './OsdElementOverlay';
import { OsdElementBrowser } from './OsdElementBrowser';
import { OsdContextPanel } from './OsdContextPanel';
import { OsdSyncBar } from './OsdSyncBar';
import { HudDestinationBar } from './HudDestinationBar';
import { RubyOsdDestinationBar } from './RubyOsdDestinationBar';
import { RubyOsdPanel } from './RubyOsdPanel';
import { RubyOsdPreview } from './RubyOsdPreview';
import { FighterHud, type FighterHudValues } from '../camera/hud/FighterHud';
import { useLinkHistory } from '../camera/hud/useLinkHistory';
import { useHudStore } from '../../stores/hud-store';
import { HudPanel } from './HudPanel';

// Deterministic demo link curve so the sparkline shows something in the designer.
const DEMO_LINK = Array.from({ length: 48 }, (_, i) =>
  Math.max(0.15, Math.min(1, 0.6 + 0.3 * Math.sin(i / 5) * Math.cos(i / 13))),
);
import { OSD_CHAR_WIDTH, OSD_CHAR_HEIGHT, getOsdCols, getOsdRows, isHdFormat, OSD_FORMAT_LABELS, type VideoType } from '../../utils/osd/font-renderer';
import { getElementSize } from '../../utils/osd/element-sizes';
import type { DemoTelemetry } from '../../utils/osd/element-renderers';

type OsdKind = 'text' | 'hud' | 'ruby';

function hudValuesFromDemo(d: DemoTelemetry): FighterHudValues {
  return {
    roll: d.roll, pitch: d.pitch, heading: d.heading, altitude: d.altitude,
    airspeed: d.airspeed, groundspeed: d.speed, vario: d.vario, throttle: d.throttle,
    batteryVoltage: d.batteryVoltage, batteryPercent: d.batteryPercent, current: d.batteryCurrent,
    mode: d.flightMode, armed: d.isArmed, distance: d.distance, homeDirection: d.homeDirection,
    gForce: d.gForce, gpsSats: d.gpsSats, hdop: 0.8, lat: d.latitude, lon: d.longitude,
    windSpeed: d.windSpeed,
  };
}

/** A thin draggable divider for resizing the side rails. */
function ResizeHandle({ onDrag }: { onDrag: (dx: number) => void }) {
  const { t } = useTranslation();
  const last = useRef(0);
  const down = (e: ReactPointerEvent) => {
    e.preventDefault();
    last.current = e.clientX;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - last.current;
      last.current = ev.clientX;
      onDrag(dx);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div
      onPointerDown={down}
      className="w-1.5 shrink-0 touch-none cursor-col-resize bg-transparent hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors"
      title={t('osd:osdView.dragToResize')}
    />
  );
}

const RAIL_MIN = 190;
const RAIL_MAX = 460;
const clampRail = (w: number) => Math.max(RAIL_MIN, Math.min(RAIL_MAX, w));
function loadRailWidth(key: string, def: number): number {
  try {
    const v = localStorage.getItem(key);
    return v ? clampRail(Number(v)) : def;
  } catch {
    return def;
  }
}

/** Measure a container's content box and keep it in state. */
function useElementSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setSize({ width: cr.width, height: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

export function OsdView() {
  const { t } = useTranslation();
  const {
    currentFont,
    currentFontName,
    isLoadingFont,
    fontError,
    videoType,
    scale,
    fitMode,
    showGrid,
    backgroundColor,
    dataSource,
    elementPositions,
    demoValues,
    loadBundledFont,
    setVideoType,
    setScale,
    setFitMode,
    setShowGrid,
    setBackgroundColor,
    setDataSource,
    setElementPosition,
    updateScreenBuffer,
    refreshTarget,
    target,
  } = useOsdStore();

  const [selectedElement, setSelectedElement] = useState<OsdElementKey | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [osdKind, setOsdKind] = useState<OsdKind>('hud');
  const [leftW, setLeftW] = useState(() => loadRailWidth('ardudeck.osd.leftW', 224));
  const [rightW, setRightW] = useState(() => loadRailWidth('ardudeck.osd.rightW', 264));
  useEffect(() => { try { localStorage.setItem('ardudeck.osd.leftW', String(leftW)); } catch { /* ignore */ } }, [leftW]);
  useEffect(() => { try { localStorage.setItem('ardudeck.osd.rightW', String(rightW)); } catch { /* ignore */ } }, [rightW]);
  const hudConfig = useHudStore((s) => s.config);
  const setHudPosition = useHudStore((s) => s.setPosition);
  const hudDesignGround = useHudStore((s) => s.designGround);
  const hudDesignWidgets = hudDesignGround ? hudConfig.widgetsGround : hudConfig.widgets;
  const liveLink = useLinkHistory(osdKind === 'hud' && dataSource === 'live' && hudDesignWidgets.linkGraph);

  const connectionState = useConnectionStore((s) => s.connectionState);

  // Load default font on mount.
  useEffect(() => {
    if (!currentFont) loadBundledFont(currentFontName || 'default');
  }, [currentFont, currentFontName, loadBundledFont]);

  useEffect(() => {
    if (currentFont) updateScreenBuffer();
  }, [currentFont, updateScreenBuffer]);

  // Keep target fresh and, on first connect, default the preview to live data.
  const autoLivedRef = useRef(false);
  useEffect(() => {
    refreshTarget();
    if (connectionState.isConnected && !autoLivedRef.current) {
      autoLivedRef.current = true;
      setDataSource('live');
    }
    if (!connectionState.isConnected) autoLivedRef.current = false;
  }, [connectionState.isConnected, connectionState.protocol, connectionState.autopilot, refreshTarget, setDataSource]);

  // Live preview: MSP needs polling; MAVLink streams on its own.
  const attitude = useTelemetryStore((s) => s.attitude);
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const battery = useTelemetryStore((s) => s.battery);
  const gps = useTelemetryStore((s) => s.gps);
  const position = useTelemetryStore((s) => s.position);
  const flight = useTelemetryStore((s) => s.flight);
  const wind = useTelemetryStore((s) => s.wind);

  useEffect(() => {
    const isMsp = connectionState.protocol === 'msp' || !!connectionState.fcVariant;
    if (dataSource === 'live' && isMsp && connectionState.isConnected) {
      const timer = setTimeout(() => window.electronAPI?.mspStartTelemetry(10), 100);
      return () => {
        clearTimeout(timer);
        window.electronAPI?.mspStopTelemetry();
      };
    }
  }, [dataSource, connectionState.protocol, connectionState.fcVariant, connectionState.isConnected]);

  useEffect(() => {
    if (dataSource === 'live' && currentFont) updateScreenBuffer();
  }, [dataSource, currentFont, attitude, vfrHud, battery, gps, position, flight, wind, updateScreenBuffer]);

  const cols = getOsdCols(videoType);
  const rows = getOsdRows(videoType);

  // Fit-to-window: measure the canvas viewport and scale the OSD to fill it.
  const { ref: viewportRef, size: viewport } = useElementSize();
  const nativeW = cols * OSD_CHAR_WIDTH;
  const nativeH = rows * OSD_CHAR_HEIGHT;
  const PAD = 48; // breathing room around the stage
  const fitScale =
    viewport.width > 0 && viewport.height > 0
      ? Math.max(0.5, Math.min((viewport.width - PAD) / nativeW, (viewport.height - PAD) / nativeH))
      : scale;
  const effectiveScale = fitMode ? fitScale : scale;
  const canvasWidth = nativeW * effectiveScale;
  const canvasHeight = nativeH * effectiveScale;

  // Instrument cluster is a fixed 16:9 stage, fit into the viewport.
  const INSTR_W = 1600;
  const INSTR_H = 900;
  const instrScale =
    viewport.width > 0 && viewport.height > 0
      ? Math.max(0.1, Math.min((viewport.width - PAD) / INSTR_W, (viewport.height - PAD) / INSTR_H))
      : 0.5;

  const hudValues: FighterHudValues =
    dataSource === 'live'
      ? {
          roll: attitude.roll,
          pitch: attitude.pitch,
          heading: vfrHud.heading || attitude.yaw,
          altitude: position.relativeAlt || vfrHud.alt,
          airspeed: vfrHud.airspeed,
          groundspeed: vfrHud.groundspeed,
          vario: vfrHud.climb,
          throttle: vfrHud.throttle,
          vx: position.vx,
          vy: position.vy,
          vz: position.vz,
          batteryVoltage: battery.voltage,
          batteryPercent: battery.remaining,
          current: battery.current,
          mode: flight.mode,
          armed: flight.armed,
          distance: 0,
          homeDirection: 0,
          gpsSats: gps.satellites,
          hdop: gps.hdop,
          lat: position.lat || gps.lat,
          lon: position.lon || gps.lon,
          windSpeed: wind.speed,
          linkHistory: hudConfig.widgets.linkGraph ? liveLink : undefined,
          linkLabel: t('osd:osdView.rcLink'),
        }
      : {
          ...hudValuesFromDemo(demoValues),
          linkHistory: hudConfig.widgets.linkGraph ? DEMO_LINK : undefined,
          linkLabel: t('osd:osdView.linkDemo'),
        };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-subtle bg-surface shrink-0 gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <h1 className="text-sm font-semibold text-content shrink-0 whitespace-nowrap">{t('osd:osdView.title')}</h1>
          <Segmented
            value={osdKind}
            onChange={setOsdKind}
            options={[
              { value: 'hud', label: t('osd:osdView.hud'), icon: MonitorPlay, tip: t('osd:osdView.hudTip') },
              { value: 'text', label: t('osd:osdView.textOsd'), icon: Cpu, tip: t('osd:osdView.textOsdTip') },
              { value: 'ruby', label: 'RubyFPV', icon: Radio, tip: t('osd:osdView.rubyTip') }, // i18n-exempt
            ]}
          />
          {osdKind !== 'ruby' && (
            <Segmented
              value={dataSource}
              onChange={setDataSource}
              options={[
                { value: 'demo', label: t('osd:osdView.demo') },
                { value: 'live', label: connectionState.isConnected ? t('common:live') : t('osd:osdView.liveOffline') },
              ]}
            />
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end flex-1 min-w-0">
          {osdKind === 'text' && (
            <>
              <Select label={t('osd:osdView.font')} value={currentFontName} disabled={isLoadingFont} onChange={loadBundledFont}
                options={BUNDLED_FONT_NAMES.map((n) => ({ value: n, label: n }))} />
              <Select label={t('osd:osdView.format')} value={videoType} onChange={(v) => setVideoType(v as VideoType)}
                options={(Object.keys(OSD_FORMAT_LABELS) as VideoType[]).map((k) => ({ value: k, label: OSD_FORMAT_LABELS[k] }))} />
            </>
          )}
          {osdKind !== 'ruby' && (
            <Select label={t('osd:osdView.zoom')} value={fitMode ? 'fit' : String(scale)}
              onChange={(v) => (v === 'fit' ? setFitMode(true) : setScale(parseInt(v)))}
              options={[{ value: 'fit', label: t('osd:osdView.fit') }, ...[1, 2, 3, 4].map((s) => ({ value: String(s), label: `${s}x` }))]} />
          )}
          {osdKind === 'text' && (
            <>
              <label className="flex items-center gap-1.5 text-[11px] text-content-secondary">
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)}
                  className="rounded bg-surface-raised border w-3 h-3" />
                {t('common:grid')}
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-content-secondary">
                <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)}
                  className="rounded bg-surface-raised border w-3 h-3" />
                {t('osd:osdView.labels')}
              </label>
            </>
          )}
          {osdKind !== 'ruby' && (
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-content-secondary">{t('osd:osdView.bg')}</label>
              <input type="color" value={backgroundColor.startsWith('rgba') ? '#0064c8' : backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-6 h-5 rounded cursor-pointer bg-transparent border border-subtle" data-tip={t('osd:osdView.bgTip')} />
            </div>
          )}
        </div>
      </div>

      {/* Destination bar - each mode goes somewhere different: HUD renders
          on-screen (never uploads), Text OSD lives in the FC (Load/Upload sync
          bar), RubyFPV is authored here and delivered to its ground board. */}
      {osdKind === 'hud' ? <HudDestinationBar /> : osdKind === 'ruby' ? <RubyOsdDestinationBar /> : <OsdSyncBar />}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left rail: HUD controls or text-OSD element library */}
        <div style={{ width: leftW }} className="border-r border-subtle bg-surface flex flex-col overflow-hidden shrink-0">
          {osdKind === 'hud' ? (
            <HudPanel />
          ) : osdKind === 'ruby' ? (
            <RubyOsdPanel />
          ) : (
            <OsdElementBrowser selectedElement={selectedElement} onSelect={setSelectedElement} />
          )}
        </div>
        <ResizeHandle onDrag={(dx) => setLeftW((w) => clampRail(w + dx))} />

        {/* Canvas viewport */}
        <div className="flex-1 flex flex-col bg-surface-inset min-w-0 overflow-hidden">
          <div ref={viewportRef} className="flex-1 flex items-center justify-center p-6 overflow-hidden min-h-0">
            {osdKind === 'hud' ? (
              <div
                className="relative rounded-md ring-1 ring-black/40 shadow-2xl overflow-hidden"
                style={{ width: INSTR_W * instrScale, height: INSTR_H * instrScale }}
              >
                <OsdVideoBackdrop backgroundColor={backgroundColor} className="absolute inset-0" />
                <div className="absolute inset-0 z-10">
                  <FighterHud v={hudValues} config={hudConfig} profile={hudDesignGround ? 'ground' : 'air'} editable onMovePosition={(id, x, y) => setHudPosition(id, { x, y })} />
                </div>
                <div className="absolute -top-px right-1 -translate-y-full text-[10px] text-content-tertiary font-mono pb-1">
                  {t('osd:osdView.hudBadge')}
                </div>
              </div>
            ) : osdKind === 'ruby' ? (
              <RubyOsdPreview />
            ) : fontError ? (
              <div className="px-3 py-2 rounded text-xs bg-red-500/10 border border-red-500/30 text-red-500">
                {fontError}
              </div>
            ) : isLoadingFont ? (
              <div className="text-content-secondary text-sm">{t('osd:osdView.loadingFont')}</div>
            ) : !currentFont ? (
              <div className="text-content-secondary text-sm">{t('osd:osdView.noFont')}</div>
            ) : (
              <div
                className="relative rounded-md ring-1 ring-black/40 shadow-2xl"
                style={{ width: canvasWidth, height: canvasHeight }}
                onClick={() => setSelectedElement(null)}
              >
                <OsdVideoBackdrop backgroundColor={backgroundColor} className="absolute inset-0 rounded-md overflow-hidden" />
                <div className="relative z-10">
                  <OsdCanvas scale={effectiveScale} transparent />
                </div>
                <div className="absolute inset-0 z-20">
                  {(Object.entries(elementPositions) as [OsdElementKey, OsdElementPosition][]).map(
                    ([id, pos]) => (
                      <OsdElementOverlay
                        key={id}
                        elementId={id}
                        position={pos}
                        size={getElementSize(id)}
                        scale={effectiveScale}
                        videoType={videoType}
                        isSelected={selectedElement === id}
                        showLabels={showLabels}
                        onSelect={setSelectedElement}
                        onPositionChange={(eid, x, y) => setElementPosition(eid, { x, y })}
                      />
                    )
                  )}
                </div>
                {/* Format badge */}
                <div className="absolute -top-px right-1 -translate-y-full text-[10px] text-content-tertiary font-mono pb-1">
                  {isHdFormat(videoType) ? 'HD' : videoType} · {cols}×{rows}
                </div>
              </div>
            )}
          </div>

          <p className="text-center pb-2 text-[10px] text-content-tertiary shrink-0">
            {osdKind === 'hud' ? (
              t('osd:osdView.hudHint')
            ) : osdKind === 'ruby' ? (
              t('osd:osdView.rubyHint')
            ) : (
              <>
                {t('osd:osdView.textHint')}
                {target === 'ardupilot' && ` ${t('osd:osdView.textHintDimmed')}`}
                {isHdFormat(videoType) && ` ${t('osd:osdView.textHintDigital')}`}
              </>
            )}
          </p>
        </div>

        {/* Contextual panel - hidden in RubyFPV mode (it has its own editor rail) */}
        {osdKind !== 'ruby' && (
          <>
            <ResizeHandle onDrag={(dx) => setRightW((w) => clampRail(w - dx))} />
            <div style={{ width: rightW }} className="border-l border-subtle bg-surface flex flex-col overflow-hidden shrink-0">
              <OsdContextPanel
                dataSource={dataSource}
                selectedElement={selectedElement}
                onClearSelection={() => setSelectedElement(null)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── small toolbar primitives ────────────────────────────────────────────────

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: LucideIcon; tip?: string }[];
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-subtle overflow-hidden bg-surface">
      {options.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            data-tip={opt.tip}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-xs font-medium transition-colors ${
              value === opt.value
                ? 'bg-blue-600/80 text-white'
                : 'text-content-secondary hover:text-content hover:bg-surface-raised'
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="text-[10px] text-content-secondary uppercase tracking-wide">{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface-raised text-content text-xs rounded-lg px-2.5 py-1.5 border border-subtle focus:border-blue-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
