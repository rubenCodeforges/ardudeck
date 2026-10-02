/**
 * The instruments catalog: a desktop port of the mobile Instruments screen.
 * A role rail on the left, cards on the right; every card shows the instrument
 * ITSELF in its current variant (rendered cold, pointer-events off, scaled to
 * fit), with a show/hide switch, the variant picker, and a size stepper, so
 * "Strip" or "Cell" is something you SEE rather than a word you have to decode.
 *
 * Roles come from a single placement map so the grouping here is stable; the
 * "Layout and presets" pane holds presets, saved layouts, global opacity and
 * a positions reset. A search box spans every group.
 *
 * Opened from the Instruments button (InstrumentsMenu), it replaces the old
 * flat toggle dropdown, which had outgrown itself now that instruments carry
 * three to five display variants each.
 */
import { useTranslation } from 'react-i18next';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  useMapInstrumentsStore,
  resolveInstrumentVisible,
  INSTRUMENT_SCALE_MIN,
  INSTRUMENT_SCALE_MAX,
  INSTRUMENT_SCALE_STEP,
  INSTRUMENT_OPACITY_MIN,
  type InstrumentDisplayMode,
} from '../../../stores/map-instruments-store';
import { MAP_INSTRUMENTS, instrumentLabel, instrumentSuitsProfile, type MapInstrumentDef } from './registry';
import { useDetectedProfile, useInstrumentProfile, useInstrumentProfileStore } from './useInstrumentProfile';
import { PRESET_INSTRUMENT_LAYOUTS, type PresetAccent } from './preset-layouts';
import { useTelemetryStore } from '../../../stores/telemetry-store';

// One accent per preset so the cards read as distinct choices, not identical
// grey tiles (mirrors the mobile catalog). Palette colors work on both themes.
const PRESET_ACCENTS: Record<PresetAccent, { edge: string }> = {
  green: { edge: '#34d399' },
  blue: { edge: '#60a5fa' },
  amber: { edge: '#fbbf24' },
  violet: { edge: '#a78bfa' },
};
import { runAutoArrange, restorePreviousLayout } from './arrange-controller';
import { semanticsOf } from './auto-arrange';

// ---- Roles -----------------------------------------------------------------

type InstrumentRole =
  | 'primaryFlight'
  | 'power'
  | 'navigation'
  | 'command'
  | 'status'
  | 'summary';

// Flight-critical first, chrome last. Mirrors the mobile rail order.
const ROLE_ORDER: InstrumentRole[] = [
  'primaryFlight',
  'power',
  'navigation',
  'command',
  'status',
  'summary',
];

const INSTRUMENT_ROLE: Record<string, InstrumentRole> = {
  attitude: 'primaryFlight',
  altitude: 'primaryFlight',
  speed: 'primaryFlight',
  heading: 'primaryFlight',
  vsi: 'primaryFlight',
  tilt: 'primaryFlight',
  steer: 'primaryFlight',
  xtrack: 'navigation',
  battery: 'power',
  gps: 'navigation',
  rtk: 'navigation',
  home: 'navigation',
  mission: 'navigation',
  'flight-mode': 'status',
  link: 'status',
  annunciator: 'status',
  controls: 'command',
  'flight-data': 'summary',
};

function roleOf(id: string): InstrumentRole {
  // The table holds deliberate DISPLAY grouping overrides (rtk/mission read
  // as navigation here); anything else, generated battery instances
  // included, follows its placement semantics instead of dumping to status.
  if (INSTRUMENT_ROLE[id]) return INSTRUMENT_ROLE[id];
  const sem = semanticsOf(id).role;
  return sem === 'video' ? 'status' : sem;
}

const ROLE_TITLE: Record<InstrumentRole, string> = {
  primaryFlight: 'map:instrumentsCatalog.rolePrimaryFlight',
  power: 'map:instrumentsCatalog.rolePower',
  navigation: 'map:instrumentsCatalog.roleNavigation',
  command: 'map:instrumentsCatalog.roleCommand',
  status: 'map:instrumentsCatalog.roleStatus',
  summary: 'map:instrumentsCatalog.roleSummary', // i18n-exempt: i18n key
};

const ROLE_BLURB: Record<InstrumentRole, string> = {
  primaryFlight: 'map:instrumentsCatalog.blurbPrimaryFlight',
  power: 'map:instrumentsCatalog.blurbPower',
  navigation: 'map:instrumentsCatalog.blurbNavigation',
  command: 'map:instrumentsCatalog.blurbCommand',
  status: 'map:instrumentsCatalog.blurbStatus',
  summary: 'map:instrumentsCatalog.blurbSummary', // i18n-exempt: i18n key
};

// One accent per role, vivid in both themes (same intent as the mobile
// status/mode palette). Flight-relevant roles take distinct hues; summary
// stays a quiet violet.
const ROLE_COLOR: Record<InstrumentRole, string> = {
  primaryFlight: '#3b82f6',
  power: '#f59e0b',
  navigation: '#22c55e',
  command: '#ef4444',
  status: '#2dd4bf',
  summary: '#a78bfa',
};

function RoleIcon({ role, className }: { role: InstrumentRole; className?: string }): JSX.Element {
  const p = { className, fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (role) {
    case 'primaryFlight':
      return (<svg {...p}><path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z" /></svg>);
    case 'power':
      return (<svg {...p}><rect x="2" y="7" width="16" height="10" rx="2" /><path d="M20 10v4" /><path d="M7 9l-1 3h3l-1 3" /></svg>);
    case 'navigation':
      return (<svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /></svg>);
    case 'command':
      return (<svg {...p}><circle cx="12" cy="8" r="3" /><path d="M12 11v7" /><path d="M8 21h8" /></svg>);
    case 'status':
      return (<svg {...p}><path d="M3 12h4l2 6 4-14 2 8h6" /></svg>);
    case 'summary':
      return (<svg {...p}><path d="M4 6h16M4 12h16M4 18h10" /></svg>);
  }
}

const layoutIcon = (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

// ---- Small building blocks -------------------------------------------------

/** Renders a child at natural size, scaled DOWN to fit the box (never up), so
 * a chip variant stays chip-sized and a round gauge shrinks to a thumbnail,
 * the same honesty as the mobile FittedBox(scaleDown) preview. */
function FitPreview({ children }: { children: ReactNode }): JSX.Element {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => {
      // offset* is the untransformed layout size, so it stays stable as we
      // apply the scale transform below (transform does not affect layout).
      const nw = i.offsetWidth;
      const nh = i.offsetHeight;
      if (!nw || !nh) return;
      const s = Math.min(o.clientWidth / nw, o.clientHeight / nh, 1);
      if (s > 0 && Number.isFinite(s)) setScale(s);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    measure();
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className="w-full h-[80px] flex items-center justify-center overflow-hidden">
      <div ref={inner} className="pointer-events-none" style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
        {children}
      </div>
    </div>
  );
}

function ToggleSwitch({ on, accent, onClick }: { on: boolean; accent: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      role="switch"
      aria-checked={on}
      className="relative w-9 h-5 rounded-full shrink-0 transition-colors"
      style={{ background: on ? accent : 'rgba(120,124,138,0.35)' }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: on ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  );
}

function StepButton({ glyph, onClick, disabled }: { glyph: 'minus' | 'plus'; onClick: () => void; disabled: boolean }): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="w-6 h-6 flex items-center justify-center rounded-md border border-subtle bg-surface text-content-secondary hover:text-content hover:border-default disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        {glyph === 'minus' ? <path strokeLinecap="round" d="M5 12h14" /> : <path strokeLinecap="round" d="M12 5v14M5 12h14" />}
      </svg>
    </button>
  );
}

// The analog gauge, the numeric card, then any registry variants: the exact
// option set the on-map config popover offers, kept in one place.
function displayOptionsOf(def: MapInstrumentDef): Array<{ id: InstrumentDisplayMode; labelKey: string }> {
  return [
    { id: 'analog', labelKey: 'map:instrumentDisplay.analog' },
    ...(def.NumericComponent ? [{ id: 'numeric' as InstrumentDisplayMode, labelKey: 'map:instrumentDisplay.numeric' }] : []),
    ...(def.variants ?? []).map((v) => ({ id: v.id as InstrumentDisplayMode, labelKey: v.labelKey })),
  ];
}

function componentFor(def: MapInstrumentDef, mode: InstrumentDisplayMode): () => JSX.Element {
  const variant = def.variants?.find((v) => v.id === mode);
  if (variant) return variant.Component;
  if (mode === 'numeric' && def.NumericComponent) return def.NumericComponent;
  return def.Component;
}

// ---- Instrument card -------------------------------------------------------

function InstrumentCard({ def, accent }: { def: MapInstrumentDef; accent: string }): JSX.Element | null {
  // Fixed-monitor instruments exist only while the vehicle streams that
  // monitor; one already placed stays listed so it can be toggled off.
  const monitorStreams = useTelemetryStore((s) => def.monitorId === undefined || s.batteries[def.monitorId] !== undefined);
  const placed = useMapInstrumentsStore((s) => resolveInstrumentVisible(s.visible, def.id));
  // An aircraft instrument is not offered on a rover and the other way round,
  // but one already on the map stays listed so it can be taken off.
  const profile = useInstrumentProfile();
  if (!monitorStreams && !placed) return null;
  if (!instrumentSuitsProfile(def, profile) && !placed) return null;
  return <InstrumentCardBody def={def} accent={accent} />;
}

function InstrumentCardBody({ def, accent }: { def: MapInstrumentDef; accent: string }): JSX.Element {
  const { t } = useTranslation();
  const visibleMap = useMapInstrumentsStore((s) => s.visible);
  const mode = useMapInstrumentsStore((s) => s.displayMode[def.id] ?? 'analog') as InstrumentDisplayMode;
  const scale = useMapInstrumentsStore((s) => s.scale[def.id] ?? 1);
  const toggle = useMapInstrumentsStore((s) => s.toggle);
  const setDisplayMode = useMapInstrumentsStore((s) => s.setDisplayMode);
  const setScale = useMapInstrumentsStore((s) => s.setScale);

  const visible = resolveInstrumentVisible(visibleMap, def.id);
  const options = displayOptionsOf(def);
  const Preview = componentFor(def, mode);

  return (
    <div
      onClick={() => toggle(def.id)}
      className="group relative flex flex-col rounded-xl bg-surface-solid cursor-pointer overflow-hidden transition-all duration-150 shadow-sm hover:shadow-lg hover:-translate-y-0.5"
      style={{
        border: '1px solid',
        // Accent-tinted hairline when live, quiet neutral when parked.
        borderColor: visible ? `color-mix(in srgb, ${accent} 40%, var(--border-default))` : 'var(--border-subtle)',
      }}
    >
      {/* Identity bar: a soft accent gradient down the left edge. */}
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: `linear-gradient(180deg, ${accent}, color-mix(in srgb, ${accent} 55%, transparent))`, opacity: visible ? 1 : 0.25 }}
      />

      <div className="pl-3.5 pr-3 pt-3 pb-3">
        {/* The instrument itself, set into a tinted "screen" so each group's
            wells carry a hint of its accent instead of flat grey. */}
        <div
          className="rounded-lg overflow-hidden"
          style={{
            background: `color-mix(in srgb, ${accent} ${visible ? 9 : 4}%, var(--bg-base))`,
            border: '1px solid var(--border-subtle)',
            boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.10)',
            opacity: visible ? 1 : 0.5,
          }}
        >
          <FitPreview><Preview /></FitPreview>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <span className={'flex-1 min-w-0 truncate text-[13px] font-semibold ' + (visible ? 'text-content' : 'text-content-tertiary')}>
            {instrumentLabel(def, t)}
          </span>
          <ToggleSwitch on={visible} accent={accent} onClick={() => toggle(def.id)} />
        </div>

        {options.length > 1 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {options.map((opt) => {
              const active = mode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDisplayMode(def.id, opt.id); }}
                  className={
                    'shrink-0 px-2.5 py-1 rounded-full text-[11px] border transition-colors ' +
                    (active ? 'font-medium' : 'border-subtle text-content-secondary hover:text-content hover:border-default')
                  }
                  style={
                    active
                      ? { background: `color-mix(in srgb, ${accent} 16%, transparent)`, borderColor: `color-mix(in srgb, ${accent} 65%, transparent)`, color: `color-mix(in srgb, ${accent} 70%, var(--text-primary))` }
                      : undefined
                  }
                >
                  {t(opt.labelKey)}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-content-tertiary flex-1">{t('map:instrumentsCatalog.size')}</span>
          <StepButton glyph="minus" disabled={scale <= INSTRUMENT_SCALE_MIN} onClick={() => setScale(def.id, scale - INSTRUMENT_SCALE_STEP)} />
          <span className="w-11 text-center text-[12px] font-medium tabular-nums text-content-secondary">{Math.round(scale * 100)}%</span>
          <StepButton glyph="plus" disabled={scale >= INSTRUMENT_SCALE_MAX} onClick={() => setScale(def.id, scale + INSTRUMENT_SCALE_STEP)} />
        </div>
      </div>
    </div>
  );
}

// Unselected-tab chips share their own tailwind hover; the active pill is
// accent-tinted inline. Kept below the cards so the pane reads top-down.
function SectionHeading({ label, accent }: { label: string; accent: string }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[3px] h-3 rounded" style={{ background: accent }} />
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>{label}</span>
    </div>
  );
}

const CARD_GRID = 'grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]';

// ---- Panes -----------------------------------------------------------------

function GroupPane({ role }: { role: InstrumentRole }): JSX.Element {
  const { t } = useTranslation();
  const accent = ROLE_COLOR[role];
  const defs = MAP_INSTRUMENTS.filter((d) => roleOf(d.id) === role);
  return (
    <div className="p-4">
      <SectionHeading label={t(ROLE_TITLE[role])} accent={accent} />
      <p className="mt-1.5 mb-3 text-[11px] text-content-tertiary">{t(ROLE_BLURB[role])}</p>
      <div className={CARD_GRID}>
        {defs.map((def) => <InstrumentCard key={def.id} def={def} accent={accent} />)}
      </div>
    </div>
  );
}

function SearchPane({ query }: { query: string }): JSX.Element {
  const { t } = useTranslation();
  const q = query.toLowerCase();
  const hits = MAP_INSTRUMENTS.filter((d) => {
    if (instrumentLabel(d, t).toLowerCase().includes(q)) return true;
    if (d.id.toLowerCase().includes(q)) return true;
    if (t(ROLE_TITLE[roleOf(d.id)]).toLowerCase().includes(q)) return true;
    return (d.variants ?? []).some((v) => t(v.labelKey).toLowerCase().includes(q));
  });

  if (hits.length === 0) {
    return <div className="p-8 text-center text-xs text-content-tertiary">{t('map:instrumentsCatalog.nothingMatches', { query })}</div>;
  }
  return (
    <div className="p-4">
      <SectionHeading label={t('map:instrumentsCatalog.matches', { count: hits.length })} accent="var(--text-secondary)" />
      <div className={CARD_GRID + ' mt-3'}>
        {hits.map((def) => <InstrumentCard key={def.id} def={def} accent={ROLE_COLOR[roleOf(def.id)]} />)}
      </div>
    </div>
  );
}

function LayoutPane({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation();
  const opacity = useMapInstrumentsStore((s) => s.opacity);
  const arrangeSnapshot = useMapInstrumentsStore((s) => s.arrangeSnapshot);
  const setOpacity = useMapInstrumentsStore((s) => s.setOpacity);
  const savedLayouts = useMapInstrumentsStore((s) => s.savedLayouts);
  const saveLayout = useMapInstrumentsStore((s) => s.saveLayout);
  const applyLayout = useMapInstrumentsStore((s) => s.applyLayout);
  const deleteLayout = useMapInstrumentsStore((s) => s.deleteLayout);
  const importLayout = useMapInstrumentsStore((s) => s.importLayout);
  const resetPositions = useMapInstrumentsStore((s) => s.resetPositions);

  const [savingName, setSavingName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const savedNames = Object.keys(savedLayouts).sort((a, b) => a.localeCompare(b));

  const commitSave = () => {
    const name = (savingName ?? '').trim();
    if (name) saveLayout(name);
    setSavingName(null);
  };

  // Export bundles the name with the snapshot so an import knows what to call
  // it; a small header lets the importer reject unrelated JSON.
  const exportLayout = (name: string) => {
    const layout = savedLayouts[name];
    if (!layout) return;
    const payload = { app: 'ardudeck', kind: 'instrument-layout', version: 1, name, layout };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^\w.-]+/g, '_')}.ardudeck-layout.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Accepts either the exported wrapper or a bare snapshot; the store validates.
  const doImport = (raw: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setImportError(t('map:instrumentsCatalog.invalidJson'));
      return;
    }
    const obj = parsed as { name?: unknown; layout?: unknown };
    const layout = obj && typeof obj === 'object' && 'layout' in obj ? obj.layout : parsed;
    const suggested = obj && typeof obj === 'object' && typeof obj.name === 'string' ? obj.name : t('map:instrumentsCatalog.importedName');
    // Avoid clobbering an existing name silently.
    let name = suggested;
    for (let i = 2; savedLayouts[name]; i++) name = `${suggested} ${i}`;
    if (importLayout(name, layout)) {
      setImporting(false);
      setImportText('');
      setImportError(null);
    } else {
      setImportError(t('map:instrumentsCatalog.notLayout'));
    }
  };

  const onImportFile = (file: File | undefined) => {
    if (!file) return;
    file.text().then(doImport).catch(() => setImportError(t('map:instrumentsCatalog.readFailed')));
  };

  const applyRow = 'w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded text-xs text-content-secondary hover:bg-surface-raised hover:text-content transition-colors';
  const profileMode = useInstrumentProfileStore((s) => s.mode);
  const setProfileMode = useInstrumentProfileStore((s) => s.setMode);
  const detected = useDetectedProfile();

  return (
    <div className="p-4 space-y-5 max-w-[560px]">
      <div>
        <SectionHeading label={t('map:instrumentsCatalog.arrange')} accent="var(--text-secondary)" />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              // Close first: the glide happens on the map, not behind a modal.
              onClose();
              requestAnimationFrame(() => { runAutoArrange(); });
            }}
            data-tip={t('map:instrumentsCatalog.autoArrangeTip')}
            className="flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2.5 text-[13px] text-blue-500 hover:bg-blue-500/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h5M4 12h8M4 17h5M15 5l1.2 2.8L19 9l-2.8 1.2L15 13l-1.2-2.8L11 9l2.8-1.2L15 5z" />
            </svg>
            {t('map:instrumentsCatalog.autoArrange')}
          </button>
          {arrangeSnapshot && (
            <button
              type="button"
              onClick={() => { restorePreviousLayout(); }}
              data-tip={t('map:instrumentsCatalog.restoreTip')}
              className="flex items-center gap-2 rounded-lg border border-subtle px-3 py-2.5 text-[13px] text-content-secondary hover:text-content hover:bg-surface-raised transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l-4-4 4-4M5 10h9a5 5 0 010 10h-3" />
              </svg>
              {t('map:instrumentsCatalog.restore')}
            </button>
          )}
        </div>
      </div>

      <div>
        <SectionHeading label={t('map:instrumentsCatalog.vehicleProfile')} accent="var(--text-secondary)" />
        <p className="mt-1.5 text-[11px] text-content-tertiary">
          {t('map:instrumentsCatalog.vehicleProfileHint')}
        </p>
        <div className="mt-2 flex items-center gap-1 rounded-lg border border-subtle p-1 w-fit">
          {([
            ['auto', detected === 'ground' ? t('map:instrumentsCatalog.profileAutoGround') : t('map:instrumentsCatalog.profileAutoAir')],
            ['air', t('map:instrumentsCatalog.profileAir')],
            ['ground', t('map:instrumentsCatalog.profileGround')],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setProfileMode(value)}
              className={`rounded px-2.5 py-1 text-[11px] transition-colors ${
                profileMode === value
                  ? 'bg-blue-500/15 text-blue-500'
                  : 'text-content-secondary hover:bg-surface-raised hover:text-content'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading label={t('map:instrumentsCatalog.presets')} accent="var(--text-secondary)" />
        <div className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {PRESET_INSTRUMENT_LAYOUTS.map(({ name, nameKey, descriptionKey, accent, layout }) => {
            const a = PRESET_ACCENTS[accent];
            return (
              <button
                key={name}
                type="button"
                onClick={() => applyLayout(layout, name)}
                className="rounded-lg border border-subtle bg-surface-solid shadow-sm px-3 py-2.5 text-left hover:border-default hover:shadow-md transition-all border-l-2"
                style={{ borderLeftColor: a.edge }}
              >
                <span className="flex items-center gap-2">
                  <span style={{ color: a.edge }}>{layoutIcon}</span>
                  <span className="flex-1 min-w-0 truncate text-[13px] text-content">{t(nameKey)}</span>
                  <span className="text-[10px] uppercase tracking-wide text-content-tertiary">{t('map:instrumentsCatalog.preset')}</span>
                </span>
                <span className="mt-1 block text-[11px] leading-snug text-content-tertiary">{t(descriptionKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <SectionHeading label={t('map:instrumentsCatalog.savedLayouts')} accent="var(--text-secondary)" />
        <div className="mt-2 space-y-0.5">
          {savedNames.length === 0 && savingName === null && (
            <p className="px-1 py-1 text-[11px] text-content-tertiary">{t('map:instrumentsCatalog.noSaved')}</p>
          )}
          {savedNames.map((name) => (
            <div key={name} className="flex items-center gap-0.5">
              <button type="button" onClick={() => { const l = savedLayouts[name]; if (l) applyLayout(l, name); }} className={applyRow + ' flex-1 min-w-0'}>
                {layoutIcon}
                <span className="truncate">{name}</span>
              </button>
              {/* Overwrite this saved layout with the current arrangement
                  (saveLayout replaces an entry of the same name). */}
              <button
                type="button"
                onClick={() => saveLayout(name)}
                data-tip={t('map:instrumentsCatalog.updateTip')}
                className="shrink-0 p-1.5 rounded text-content-tertiary hover:text-blue-500 hover:bg-surface-raised transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v10m0 0l-3.5-3.5M12 14l3.5-3.5M5 19h14" />
                </svg>
              </button>
              {/* Export a shareable file others can import. */}
              <button
                type="button"
                onClick={() => exportLayout(name)}
                data-tip={t('map:instrumentsCatalog.exportTip')}
                className="shrink-0 p-1.5 rounded text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => deleteLayout(name)}
                data-tip={t('map:instrumentsCatalog.deleteTip')}
                className="shrink-0 p-1.5 rounded text-content-tertiary hover:text-red-500 hover:bg-surface-raised transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
          {savingName === null ? (
            <button type="button" onClick={() => setSavingName('')} className={applyRow}>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M12 5v14M5 12h14" />
              </svg>
              {t('map:instrumentsCatalog.saveCurrent')}
            </button>
          ) : (
            <div className="flex items-center gap-1 px-1 py-0.5">
              <input
                autoFocus
                type="text"
                value={savingName}
                placeholder={t('common:layoutName')}
                onChange={(e) => setSavingName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitSave(); if (e.key === 'Escape') setSavingName(null); }}
                className="flex-1 min-w-0 px-2 py-1 text-xs rounded bg-surface-input border border-default text-content focus:outline-none focus:border-blue-500"
              />
              <button type="button" onClick={commitSave} disabled={!savingName.trim()} className="shrink-0 px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">{t('common:save')}</button>
            </div>
          )}

          {importing ? (
            <div className="px-1 py-1 space-y-1.5">
              <textarea
                autoFocus
                value={importText}
                onChange={(e) => { setImportText(e.target.value); setImportError(null); }}
                placeholder={t('map:instrumentsCatalog.pastePlaceholder')}
                rows={3}
                className="w-full px-2 py-1.5 text-[11px] font-mono rounded bg-surface-input border border-default text-content focus:outline-none focus:border-blue-500 resize-none"
              />
              {importError && <p className="text-[11px] text-red-500">{importError}</p>}
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => doImport(importText)} disabled={!importText.trim()} className="px-2.5 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">{t('map:instrumentsCatalog.import')}</button>
                <label className="px-2.5 py-1 text-xs rounded border border-subtle text-content-secondary hover:text-content hover:border-default transition-colors cursor-pointer">
                  {t('map:instrumentsCatalog.fromFile')}
                  <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => onImportFile(e.target.files?.[0])} />
                </label>
                <button type="button" onClick={() => { setImporting(false); setImportText(''); setImportError(null); }} className="ml-auto px-2.5 py-1 text-xs rounded border border-subtle text-content-secondary hover:text-content transition-colors">{t('common:cancel')}</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setImporting(true)} className={applyRow}>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5 5 5M12 5v12" />
              </svg>
              {t('map:instrumentsCatalog.importShared')}
            </button>
          )}
        </div>
      </div>

      <div>
        <SectionHeading label={t('map:instrumentsCatalog.opacity')} accent="var(--text-secondary)" />
        <div className="mt-2 flex items-center gap-3">
          <input
            type="range"
            min={Math.round(INSTRUMENT_OPACITY_MIN * 100)}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={(e) => setOpacity(Number(e.target.value) / 100)}
            className="flex-1 accent-blue-600"
          />
          <span className="w-10 text-right text-xs tabular-nums text-content-secondary">{Math.round(opacity * 100)}%</span>
        </div>
        <p className="mt-1.5 text-[11px] text-content-tertiary">{t('map:instrumentsCatalog.opacityHint')}</p>
      </div>

      <button
        type="button"
        onClick={resetPositions}
        className="flex items-center gap-2 text-xs text-content-secondary hover:text-content transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 006.34 6.34M4 15a8 8 0 0013.66 2.66" />
        </svg>
        {t('map:instrumentsCatalog.resetPositions')}
      </button>
    </div>
  );
}

// ---- Rail + modal shell ----------------------------------------------------

function RailTile({
  active,
  accent,
  icon,
  title,
  trailing,
  onClick,
}: {
  active: boolean;
  accent: string;
  icon: ReactNode;
  title: string;
  trailing?: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border transition-colors ' + (active ? '' : 'border-transparent hover:bg-surface-raised')}
      style={active ? { background: `color-mix(in srgb, ${accent} 14%, transparent)`, borderColor: `color-mix(in srgb, ${accent} 55%, transparent)` } : undefined}
    >
      <span className="w-[3px] h-4 rounded shrink-0" style={{ background: accent }} />
      <span style={{ color: active ? accent : 'var(--text-secondary)' }} className="shrink-0">{icon}</span>
      <span className={'flex-1 min-w-0 truncate text-left text-[12px] ' + (active ? 'text-content font-medium' : 'text-content-secondary')}>{title}</span>
      {trailing && <span className="text-[11px] tabular-nums text-content-tertiary">{trailing}</span>}
    </button>
  );
}

export function InstrumentsCatalog({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation();
  const visibleMap = useMapInstrumentsStore((s) => s.visible);
  // null selects the Layout and presets pane. It opens first: picking a
  // preset is what most visits to this dialog are for (mirrors mobile).
  const [role, setRole] = useState<InstrumentRole | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visibleCount = useMemo(
    () => MAP_INSTRUMENTS.reduce((n, i) => n + (resolveInstrumentVisible(visibleMap, i.id) ? 1 : 0), 0),
    [visibleMap],
  );

  const countsByRole = useMemo(() => {
    const out = {} as Record<InstrumentRole, { on: number; total: number }>;
    for (const r of ROLE_ORDER) out[r] = { on: 0, total: 0 };
    for (const def of MAP_INSTRUMENTS) {
      const r = roleOf(def.id);
      out[r].total += 1;
      if (resolveInstrumentVisible(visibleMap, def.id)) out[r].on += 1;
    }
    return out;
  }, [visibleMap]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-[920px] h-full max-h-[600px] flex flex-col rounded-xl bg-surface-solid border border-subtle shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-subtle">
            <span className="text-sm font-semibold text-content">{t('map:instrumentsCatalog.title')}</span>
            <span className="text-[11px] text-content-tertiary">{t('map:instrumentsCatalog.onScreen', { visible: visibleCount, total: MAP_INSTRUMENTS.length })}</span>
            <div className="ml-auto relative">
              <svg className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-content-tertiary pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-4-4" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('map:instrumentsCatalog.searchPlaceholder')}
                className="w-52 pl-7 pr-2 py-1.5 text-xs rounded bg-surface-input border border-default text-content placeholder:text-content-tertiary focus:outline-none focus:border-blue-500"
              />
            </div>
            <button type="button" onClick={onClose} data-tip={t('common:close')} className="p-1.5 rounded text-content-secondary hover:text-content hover:bg-surface-raised transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* Body: rail + pane */}
          <div className="flex-1 min-h-0 flex">
            <div className="w-48 shrink-0 border-r border-subtle overflow-y-auto p-2 space-y-1">
              <RailTile
                active={role === null && query === ''}
                accent="var(--text-secondary)"
                icon={layoutIcon}
                title={t('map:instrumentsCatalog.layoutAndPresets')}
                onClick={() => { setRole(null); setQuery(''); }}
              />
              <div className="my-1 border-t border-subtle" />
              {ROLE_ORDER.map((r) => (
                <RailTile
                  key={r}
                  active={role === r && query === ''}
                  accent={ROLE_COLOR[r]}
                  icon={<RoleIcon role={r} className="w-4 h-4" />}
                  title={t(ROLE_TITLE[r])}
                  trailing={`${countsByRole[r].on}/${countsByRole[r].total}`}
                  onClick={() => { setRole(r); setQuery(''); }}
                />
              ))}
            </div>
            {/* Cards float on the tinted canvas; the rail keeps the solid
                shell colour so the two surfaces read as distinct planes. */}
            <div className="flex-1 min-w-0 overflow-y-auto bg-surface-base">
              {query !== '' ? <SearchPane query={query} /> : role === null ? <LayoutPane onClose={onClose} /> : <GroupPane role={role} />}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
