/**
 * HUD control panel — the left rail in the OSD Designer's HUD mode. Toggles
 * each HUD widget, sets style (colour / line weight / glow / units / scale),
 * and manages named HUD presets. Drives the shared hud-store, so changes apply
 * live to both the designer preview and the video overlay.
 */

import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Minus, Rows3, LocateFixed, Crosshair, RotateCw, Compass, Gauge, ArrowUpDown,
  TrendingUp, Activity, Battery, Home, Radio, LayoutGrid, Palette, Bookmark,
  Trash2, RotateCcw, Layers, SlidersHorizontal, Car, Plane, Puzzle, Milestone,
  type LucideIcon,
} from 'lucide-react';
import { useHudStore } from '../../stores/hud-store';
import { listModuleHudInstruments, subscribeModuleHudInstruments } from '../../modules/module-hud-registry';
import { HUD_WIDGETS, HUD_COLORS, type HudColor, type HudProfile, type HudWidgetId } from '../camera/hud/hud-config';
import { HUD_READOUTS, type HudReadoutCategory } from '../camera/hud/hud-readouts';

const READOUT_CATEGORY_ORDER: HudReadoutCategory[] = ['Power', 'Flight', 'Speed', 'Navigation', 'Environment', 'Status'];

const READOUT_CATEGORY_KEYS: Record<HudReadoutCategory, string> = {
  Power: 'osd:hudPanel.categoryPower',
  Flight: 'osd:hudPanel.categoryFlight',
  Speed: 'osd:hudPanel.categorySpeed',
  Navigation: 'osd:hudPanel.categoryNavigation',
  Environment: 'osd:hudPanel.categoryEnvironment',
  Status: 'osd:hudPanel.categoryStatus',
};

// Instrument widgets only (readouts render their label tag, not an icon).
const WIDGET_ICONS: Record<string, LucideIcon> = {
  horizon: Minus,
  pitchLadder: Rows3,
  fpm: LocateFixed,
  boresight: Crosshair,
  bankArc: RotateCw,
  headingTape: Compass,
  airspeedTape: Gauge,
  altitudeTape: ArrowUpDown,
  vsi: TrendingUp,
  waypoints: Milestone,
  status: Activity,
  battery: Battery,
  home: Home,
  linkGraph: Radio,
  groundSpeed: Gauge,
};

export function HudPanel() {
  const { t } = useTranslation();
  const config = useHudStore((s) => s.config);
  const presets = useHudStore((s) => s.presets);
  const toggleWidget = useHudStore((s) => s.toggleWidget);
  const setColor = useHudStore((s) => s.setColor);
  const setLineWeight = useHudStore((s) => s.setLineWeight);
  const setGlow = useHudStore((s) => s.setGlow);
  const setUnits = useHudStore((s) => s.setUnits);
  const setScale = useHudStore((s) => s.setScale);
  const resetConfig = useHudStore((s) => s.resetConfig);
  const savePreset = useHudStore((s) => s.savePreset);
  const loadPreset = useHudStore((s) => s.loadPreset);
  const deletePreset = useHudStore((s) => s.deletePreset);

  const designGround = useHudStore((s) => s.designGround);
  const setDesignGround = useHudStore((s) => s.setDesignGround);
  const setProfile = useHudStore((s) => s.setProfile);
  const toggleModuleInstrument = useHudStore((s) => s.toggleModuleInstrument);

  // Module-contributed instruments (e.g. a cargo's CCRP/CCIP reticle). Re-read
  // when a module registers or unregisters one (snapshot on count so React does
  // not loop). Absent when no such cargo is loaded, so nothing extra shows for
  // users without the module.
  useSyncExternalStore(subscribeModuleHudInstruments, () => listModuleHudInstruments().length);
  const moduleInstruments = listModuleHudInstruments();

  const [presetName, setPresetName] = useState('');
  const presetNames = Object.keys(presets);
  const activeWidgets = designGround ? config.widgetsGround : config.widgets;

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden">
      {/* What this surface composes - reinforces the destination bar. */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-subtle bg-indigo-500/[0.06]">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-300">
          <Layers className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-content leading-tight">{t('osd:hudPanel.hudOverlay')}</div>
          <div className="text-[10px] text-content-tertiary leading-tight">{t('osd:hudPanel.drawnBy')}</div>
        </div>
      </div>

      {/* Vehicle profile: two independent arrangements, one HUD */}
      <Section title={t('osd:hudPanel.vehicleProfile')} icon={designGround ? Car : Plane}>
        <div className="px-2 pb-1">
          <div className="inline-flex w-full items-center rounded-lg border border-subtle overflow-hidden bg-surface">
            {([['air', t('osd:hudPanel.aircraft'), Plane], ['ground', t('osd:hudPanel.ground'), Car]] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setDesignGround(key === 'ground')}
                className={`flex flex-1 items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  (key === 'ground') === designGround ? 'bg-blue-600/80 text-white' : 'text-content-secondary hover:text-content hover:bg-surface-raised'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="px-2 pb-1 text-[10px] leading-snug text-content-tertiary">
          {designGround ? t('osd:hudPanel.editingGround') : t('osd:hudPanel.editingAir')}
        </p>
        <Row label={t('osd:hudPanel.liveOverlayUses')}>
          <select
            value={config.profile}
            onChange={(e) => setProfile(e.target.value as HudProfile)}
            className="bg-surface-input text-content text-[11px] rounded-lg px-2 py-1 border border-subtle focus:border-blue-500 focus:outline-none"
          >
            <option value="auto">{t('osd:hudPanel.profileAuto')}</option>
            <option value="air">{t('osd:hudPanel.profileAir')}</option>
            <option value="ground">{t('osd:hudPanel.profileGround')}</option>
          </select>
        </Row>
      </Section>

      {/* Instruments */}
      <Section title={t('common:instruments')} icon={LayoutGrid}>
        {HUD_WIDGETS.map((wdef) => {
          const Icon = WIDGET_ICONS[wdef.id];
          const on = activeWidgets[wdef.id];
          return (
            <button
              key={wdef.id}
              onClick={() => toggleWidget(wdef.id, designGround)}
              className={`group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-surface-raised ${on ? 'text-content' : 'text-content-secondary'}`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${on ? 'bg-blue-500/15 text-blue-400' : 'bg-surface-raised text-content-tertiary'}`}>
                {Icon && <Icon className="h-3.5 w-3.5" />}
              </span>
              <span className="flex-1 truncate">{wdef.label}</span>
              {wdef.movable && <span className="text-[9px] uppercase tracking-wide text-content-tertiary">{t('osd:hudPanel.drag')}</span>}
              <span className={`h-3.5 w-3.5 shrink-0 rounded-[4px] border transition-colors ${on ? 'border-blue-500 bg-blue-500' : 'border-strong bg-surface-input'} flex items-center justify-center`}>
                {on && <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
              </span>
            </button>
          );
        })}
        {moduleInstruments.map((inst) => {
          const on = !!config.moduleInstruments[inst.id];
          return (
            <button
              key={inst.id}
              onClick={() => toggleModuleInstrument(inst.id)}
              className={`group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-surface-raised ${on ? 'text-content' : 'text-content-secondary'}`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${on ? 'bg-blue-500/15 text-blue-400' : 'bg-surface-raised text-content-tertiary'}`}>
                <Puzzle className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 truncate">{inst.label}</span>
              <span className="text-[9px] uppercase tracking-wide text-content-tertiary">{t('osd:hudPanel.module')}</span>
              <span className={`h-3.5 w-3.5 shrink-0 rounded-[4px] border transition-colors ${on ? 'border-blue-500 bg-blue-500' : 'border-strong bg-surface-input'} flex items-center justify-center`}>
                {on && <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
              </span>
            </button>
          );
        })}
      </Section>

      {/* Readouts - any telemetry value, placed anywhere (the composable part) */}
      <Section title={t('osd:hudPanel.readouts')} icon={SlidersHorizontal}>
        <p className="px-2 pb-1.5 text-[10px] leading-snug text-content-tertiary">
          {t('osd:hudPanel.readoutsHint')}
        </p>
        {READOUT_CATEGORY_ORDER.map((cat) => {
          const items = HUD_READOUTS.filter((r) => r.category === cat);
          if (items.length === 0) return null;
          return (
            <div key={cat} className="mb-1">
              <div className="px-2 pt-1.5 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-content-tertiary">{t(READOUT_CATEGORY_KEYS[cat])}</div>
              {items.map((r) => {
                const on = activeWidgets[r.id];
                return (
                  <button
                    key={r.id}
                    onClick={() => toggleWidget(r.id, designGround)}
                    className={`group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-surface-raised ${on ? 'text-content' : 'text-content-secondary'}`}
                  >
                    <span className={`flex h-5 min-w-[2.75rem] shrink-0 items-center justify-center rounded px-1.5 font-mono text-[10px] ${on ? 'bg-indigo-500/15 text-indigo-300' : 'bg-surface-raised text-content-tertiary'}`}>
                      {r.label}
                    </span>
                    <span className="flex-1 truncate">{r.description}</span>
                    <span className={`h-3.5 w-3.5 shrink-0 rounded-[4px] border transition-colors ${on ? 'border-indigo-500 bg-indigo-500' : 'border-strong bg-surface-input'} flex items-center justify-center`}>
                      {on && <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </Section>

      {/* Style */}
      <Section title={t('osd:hudPanel.style')} icon={Palette}>
        <Row label={t('osd:hudPanel.colour')}>
          <div className="flex gap-1.5">
            {(Object.keys(HUD_COLORS) as HudColor[]).map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${config.color === c ? 'border-content' : 'border-transparent'}`}
                style={{ backgroundColor: HUD_COLORS[c] }}
                data-tip={c}
              />
            ))}
          </div>
        </Row>
        <Row label={t('osd:hudPanel.line', { value: config.lineWeight.toFixed(1) })}>
          <input type="range" min={0.6} max={1.8} step={0.1} value={config.lineWeight}
            onChange={(e) => setLineWeight(parseFloat(e.target.value))} className="w-full accent-blue-500" />
        </Row>
        <Row label={t('osd:hudPanel.scale', { value: config.scale.toFixed(2) })}>
          <input type="range" min={0.7} max={1.3} step={0.05} value={config.scale}
            onChange={(e) => setScale(parseFloat(e.target.value))} className="w-full accent-blue-500" />
        </Row>
        <label className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-content cursor-pointer rounded-md hover:bg-surface-raised">
          <input type="checkbox" checked={config.glow} onChange={(e) => setGlow(e.target.checked)} className="h-3.5 w-3.5 rounded-sm accent-blue-500" />
          {t('osd:hudPanel.holographicGlow')}
        </label>
        <Row label={t('osd:hudPanel.units')}>
          <div className="inline-flex items-center rounded-lg border border-subtle overflow-hidden bg-surface">
            {(['metric', 'imperial'] as const).map((un) => (
              <button key={un} onClick={() => setUnits(un)}
                className={`px-2.5 py-1 text-[10px] font-medium capitalize transition-colors ${config.units === un ? 'bg-blue-600/80 text-white' : 'text-content-secondary hover:text-content hover:bg-surface-raised'}`}>
                {un === 'metric' ? t('osd:hudPanel.metric') : t('osd:hudPanel.imperial')}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      {/* Presets */}
      <Section title={t('osd:hudPanel.hudPresets')} icon={Bookmark}>
        <div className="flex gap-1.5 mb-2">
          <input value={presetName} onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && presetName.trim()) { savePreset(presetName); setPresetName(''); } }}
            placeholder={t('osd:hudPanel.saveAs')}
            className="min-w-0 flex-1 bg-surface-input text-content text-xs rounded-lg px-2.5 py-1.5 border border-subtle focus:border-blue-500 focus:outline-none placeholder-content-tertiary" />
          <button onClick={() => { if (presetName.trim()) { savePreset(presetName); setPresetName(''); } }}
            disabled={!presetName.trim()} className="shrink-0 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-600/80 hover:bg-blue-500/80 text-white disabled:opacity-40">{t('common:save')}</button>
        </div>
        {presetNames.length === 0 ? (
          <p className="text-[10px] text-content-tertiary px-2 py-1">{t('osd:hudPanel.noSavedHuds')}</p>
        ) : presetNames.map((n) => (
          <div key={n} className="flex items-center gap-1">
            <button onClick={() => loadPreset(n)} className="min-w-0 flex-1 text-left text-xs px-2 py-1.5 rounded-md hover:bg-surface-raised text-content truncate">{n}</button>
            <button onClick={() => deletePreset(n)} className="shrink-0 p-1.5 rounded-md text-content-tertiary hover:text-red-500 hover:bg-surface-raised" data-tip={t('osd:hudPanel.delete')}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button onClick={resetConfig} className="mt-2 flex w-full items-center gap-2 text-xs px-2 py-1.5 rounded-md hover:bg-surface-raised text-content-secondary">
          <RotateCcw className="h-3.5 w-3.5" /> {t('osd:hudPanel.resetHud')}
        </button>
      </Section>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="border-b border-subtle px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-content-secondary" />
        <h3 className="text-[10px] font-semibold text-content-secondary uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
      <span className="text-[11px] text-content-secondary shrink-0">{label}</span>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  );
}
