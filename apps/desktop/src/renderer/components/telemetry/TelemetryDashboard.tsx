import { useTranslation } from 'react-i18next';
import { memo, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardPaste, Copy, Download, FileUp, Pencil, Share2, Trash2, Upload } from 'lucide-react';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi,
  SerializedDockview,
  Orientation,
  themeDark,
  themeLight,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';

import { useTelemetryStore } from '../../stores/telemetry-store';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { FleetStrip } from '../fleet/FleetStrip';
import { DraggableFleetActions } from '../fleet/DraggableFleetActions';
import { useLayoutStore } from '../../stores/layout-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useEditModeStore } from '../../stores/edit-mode-store';
import { useTileCacheAreaStore } from '../../stores/tile-cache-area-store';
import { useTelemetryLayoutStore } from '../../stores/telemetry-layout-store';
import { useWorkspaceDialogStore } from '../../stores/workspace-dialog-store';
import { useResolvedTheme } from '../../hooks/useTheme';
import type { TelemetrySpeed } from '../../../shared/ipc-channels';
import { formatAltitudeFromMeters, formatSpeedFromMetersPerSecond } from '../../../shared/user-units.js';

// Reserved layout name for auto-save (separate from user-named layouts)
const TELEMETRY_AUTOSAVE_NAME = '__telemetry_autosave';
import {
  AttitudePanel,
  JoystickPanel,
  AltitudePanel,
  SpeedPanel,
  BatteryPanel,
  GpsPanel,
  PositionPanel,
  VelocityPanel,
  FlightModePanel,
  FlightControlPanel,
  MapPanel,
  MessagesPanel,
  SafetyMonitorPanel,
  NtripPanel,
  CameraPanel,
  PreflightCheckCard,
  // Mission panels (for monitoring during flight) - MissionMapPanel removed (merged into MapPanel)
  WaypointTablePanel,
  AltitudeProfilePanel,
  // SITL simulation panels
  SitlEnvironmentDockPanel,
  SitlFailureDockPanel,
  PANEL_COMPONENTS,
} from '../panels';
import { useArduPilotSitlStore } from '../../stores/ardupilot-sitl-store';
import { useMapInstrumentsStore, resolveInstrumentVisible } from '../../stores/map-instruments-store';
import {
  BUILTIN_LAYOUTS,
  DEFAULT_LAYOUT,
  applyWorkspaceExtras,
  captureWorkspace,
  dockOf,
  isBuiltinLayout,
  isWorkspaceV2,
  descriptionOf,
  exportFileName,
  exportPayload,
  parseImport,
  uniqueLayoutName,
  withDescription,
  type BuiltinLayoutKey,
} from './workspace-layouts';
import type { IDockviewHeaderActionsProps } from 'dockview-react';

// Panel component wrapper for dockview. Plain — no decoration. The pop-out
// affordance lives in dockview's header action slot (see PanelPopoutAction
// below), where it's actually discoverable.
function PanelWrapper({ component }: { component: React.ComponentType }) {
  const Component = component;
  return <Component />;
}

/**
 * dockview panel id (camelCase, e.g. "flightControl") → detached
 * component-registry id (kebab, e.g. "flight-control").
 */
const PANEL_ID_TO_DETACHED: Record<string, { componentId: string; defaultBounds?: { width: number; height: number } }> = {
  attitude: { componentId: 'attitude' },
  altitude: { componentId: 'altitude' },
  speed: { componentId: 'speed' },
  battery: { componentId: 'battery' },
  gps: { componentId: 'gps' },
  position: { componentId: 'position' },
  velocity: { componentId: 'velocity' },
  flightMode: { componentId: 'flight-mode' },
  flightControl: { componentId: 'flight-control' },
  map: { componentId: 'map', defaultBounds: { width: 960, height: 720 } },
  camera: { componentId: 'camera', defaultBounds: { width: 960, height: 600 } },
  messages: { componentId: 'messages' },
  safetyMonitor: { componentId: 'safety-monitor', defaultBounds: { width: 420, height: 520 } },
  rtk: { componentId: 'rtk', defaultBounds: { width: 420, height: 560 } },
};

/**
 * Right-aligned action slot in every dockview tab header. Spawns a native
 * Electron BrowserWindow for the active panel via our window manager —
 * NOT dockview's `addPopoutGroup`. Dockview popout requires the parent and
 * child windows to share one renderer process so it can DOM-portal between
 * them; Electron's security model gives each child window its own renderer
 * and the popped window ends up unstyled. Native Electron windows with IPC-
 * driven state are the only reliable path here.
 */
/**
 * Panels that have a floating map-instrument counterpart. The attitude panel
 * is deliberately absent: the attitude ball is MapPanel-local useState, not
 * reachable from this header.
 */
const PANEL_ID_TO_INSTRUMENT: Record<string, string> = {
  battery: 'battery',
  gps: 'gps',
  altitude: 'altitude',
  speed: 'speed',
  position: 'flight-data',
  flightMode: 'flight-mode',
  safetyMonitor: 'annunciator',
  flightControl: 'controls',
};

function PanelHeaderActions(props: IDockviewHeaderActionsProps): JSX.Element | null {
  const { t } = useTranslation();
  const active = props.activePanel;
  // Preset panels use the bare id ("map"); panels added via the Add Panel menu
  // get a unique "<id>-<timestamp>". Match either so menu-added panels (e.g.
  // Camera, which is never in a preset) still get a Pop out button.
  const baseId = active
    ? Object.keys(PANEL_ID_TO_DETACHED).find(
        (k) => active.id === k || active.id.startsWith(`${k}-`),
      )
    : undefined;
  const instrumentId = baseId ? PANEL_ID_TO_INSTRUMENT[baseId] : undefined;
  // Hooks stay above the early returns so their order never changes.
  const instrumentVisible = useMapInstrumentsStore((s) =>
    instrumentId ? resolveInstrumentVisible(s.visible, instrumentId) : false,
  );
  const toggleInstrument = useMapInstrumentsStore((s) => s.toggle);
  if (!active) return null;
  const mapping = baseId ? PANEL_ID_TO_DETACHED[baseId] : undefined;
  if (!mapping) return null;
  const title = active.title ?? active.id;

  const handleClick = () => {
    window.electronAPI.openDetachedWindow({
      componentId: mapping.componentId,
      title,
      ...(mapping.defaultBounds !== undefined ? { initialBounds: mapping.defaultBounds } : {}),
    });
  };

  return (
    <>
      {instrumentId && (
        <button
          onClick={() => toggleInstrument(instrumentId)}
          className={`h-7 w-7 mx-0.5 rounded-md inline-flex items-center justify-center transition-colors ${
            instrumentVisible
              ? 'text-blue-500 bg-blue-500/10'
              : 'text-content-secondary hover:text-content hover:bg-surface-raised'
          }`}
          data-tip={instrumentVisible ? t('telemetry:panelHeader.hideInstrument') : t('telemetry:panelHeader.showInstrument')}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 15a8.4 8.4 0 1116.8 0" />
            <path strokeLinecap="round" d="M12 15l3.5-4.5" />
          </svg>
        </button>
      )}
      <button
        onClick={handleClick}
        className="h-7 px-2 mx-0.5 rounded-md inline-flex items-center gap-1.5 text-xs transition-colors text-content-secondary hover:text-content hover:bg-surface-raised"
        title={t('telemetry:panelHeader.popOutTitle', { title })}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M14 3h7m0 0v7m0-7L10 14M5 5h4M5 19h14a0 0 0 010 0v-4" />
        </svg>
        <span>{t('telemetry:panelHeader.popOut')}</span>
      </button>
    </>
  );
}

// Component registry for dockview
const components: Record<string, React.FC<IDockviewPanelProps>> = {
  // Telemetry panels
  AttitudePanel: () => <PanelWrapper component={AttitudePanel} />,
  AltitudePanel: () => <PanelWrapper component={AltitudePanel} />,
  SpeedPanel: () => <PanelWrapper component={SpeedPanel} />,
  BatteryPanel: () => <PanelWrapper component={BatteryPanel} />,
  GpsPanel: () => <PanelWrapper component={GpsPanel} />,
  PositionPanel: () => <PanelWrapper component={PositionPanel} />,
  VelocityPanel: () => <PanelWrapper component={VelocityPanel} />,
  FlightModePanel: () => <PanelWrapper component={FlightModePanel} />,
  FlightControlPanel: () => <PanelWrapper component={FlightControlPanel} />,
  MapPanel: () => <PanelWrapper component={MapPanel} />,
  CameraPanel: () => <PanelWrapper component={CameraPanel} />,
  MessagesPanel: () => <PanelWrapper component={MessagesPanel} />,
  SafetyMonitorPanel: () => <PanelWrapper component={SafetyMonitorPanel} />,
  JoystickPanel: () => <PanelWrapper component={JoystickPanel} />,
  NtripPanel: () => <PanelWrapper component={NtripPanel} />,
  PreflightCheckCard: () => <PanelWrapper component={PreflightCheckCard} />,
  // Mission panels (for monitoring during flight) - readOnly mode
  // Note: MissionMapPanel removed - mission data now integrated into MapPanel
  WaypointTablePanel: () => <WaypointTablePanel readOnly />,
  AltitudeProfilePanel: () => <AltitudeProfilePanel readOnly />,
  // SITL simulation panels
  SitlEnvironmentDockPanel: () => <PanelWrapper component={SitlEnvironmentDockPanel} />,
  SitlFailureDockPanel: () => <PanelWrapper component={SitlFailureDockPanel} />,
};

// Load a built-in layout: the grid plus its cockpit, split and render mode.
function loadBuiltinLayout(api: DockviewApi, key: BuiltinLayoutKey): void {
  const layout = BUILTIN_LAYOUTS[key].data();
  api.fromJSON(layout.dock);
  applyWorkspaceExtras(layout.extras);
}

interface WorkspaceProps {
  onSave: (name: string, description: string) => void;
  onLoad: (name: string) => void;
  onReset: () => void;
  onEdit: (name: string, newName: string, description: string, replaceContents: boolean) => void;
  onDelete: (name: string) => void;
  /** How to share: copy the JSON, save a file, or the macOS share sheet. Resolves to feedback text. */
  onShare: (name: string, how: 'copy' | 'file' | 'native') => Promise<string | null>;
  /** Resolves to an error message, or null when the file was imported. */
  onImport: (raw: string) => Promise<string | null>;
  onAddPanel: (id: string, component: string, title: string) => void;
  layouts: string[];
  layoutDescriptions: Record<string, string>;
  activeLayout: string;
  supportsMissionPlanning: boolean;
  isMavlink: boolean;
  isSitlRunning: boolean;
  hasMapPanel: boolean;
}

// Single launcher that lives in the quick-stats bar and opens the Workspace
// dialog. Replaces the old always-on layout toolbar row: everything it carried
// (panel-layout presets, save/reset, offline-map capture, 2D/3D, Add panel)
// now lives one click away, reclaiming a whole bar of vertical space.
function WorkspaceButton(props: WorkspaceProps): JSX.Element {
  const { t } = useTranslation();
  const open = useWorkspaceDialogStore((s) => s.open);
  const setOpen = useWorkspaceDialogStore((s) => s.setOpen);
  const activeName = isBuiltinLayout(props.activeLayout) ? t(BUILTIN_LAYOUTS[props.activeLayout].labelKey) : props.activeLayout;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-tour="telemetry-layout-select"
        data-tip={t('telemetry:workspace.buttonTip')}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-default bg-surface-raised text-content text-xs hover:bg-surface-solid transition-colors shrink-0"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span className="font-medium">{t('telemetry:workspace.title')}</span>
        <span className="text-content-tertiary max-w-[140px] truncate hidden lg:inline">· {activeName}</span>
      </button>
      {open && <WorkspaceDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

const wsCheck = (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

// One accent per section so the dialog reads in colour blocks like the
// instruments catalog does with its roles. All 600-weight so a white label
// sits legibly on the active fills in both themes.
const WS_ACCENT = { layout: '#2563eb', rate: '#0891b2', view: '#4f46e5', offline: '#059669', panel: '#7c3aed' } as const;

function WsSection({ label, accent, icon, children }: { label: string; accent: string; icon: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="w-[3px] h-3.5 rounded" style={{ background: accent }} />
        <span className="shrink-0" style={{ color: accent }}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>{label}</span>
      </div>
      {children}
    </section>
  );
}

// White elevated card that lifts on hover; accent border + tint + check when
// it is the active choice. Shared by the layout tiles and the add-panel grid.
function WsCard({ accent, active = false, accentIcon = false, icon, label, description, onClick, dataTour }: {
  accent: string;
  active?: boolean;
  accentIcon?: boolean;
  icon: ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  dataTour?: string;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      data-tour={dataTour}
      className={'group flex h-full w-full min-w-0 gap-2 rounded-lg px-3 py-2.5 text-left text-xs bg-surface-solid shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ' + (description ? 'items-start' : 'items-center')}
      style={{
        border: '1px solid',
        borderColor: active ? `color-mix(in srgb, ${accent} 55%, var(--border-default))` : 'var(--border-subtle)',
        background: active ? `color-mix(in srgb, ${accent} 8%, var(--bg-surface-solid))` : undefined,
      }}
    >
      <span className={'shrink-0 ' + (description ? 'mt-px ' : '') + (active || accentIcon ? '' : 'text-content-tertiary')} style={active || accentIcon ? { color: accent } : undefined}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className={'block truncate ' + (active ? 'text-content font-medium' : 'text-content-secondary group-hover:text-content')}>{label}</span>
        {description && (
          <span className="mt-0.5 text-[10px] leading-snug text-content-tertiary line-clamp-2" title={description}>{description}</span>
        )}
      </span>
      {active && <span style={{ color: accent }}>{wsCheck}</span>}
    </button>
  );
}

// Name and description of a layout, for save-as and edit. Sits above the Workspace dialog.
function LayoutDetailsDialog({ title, initialName, initialDescription, taken, originalName, onCancel, onSubmit }: {
  title: string;
  initialName: string;
  initialDescription: string;
  taken: string[];
  /** Layout being edited; null when saving a new one. */
  originalName: string | null;
  onCancel: () => void;
  onSubmit: (name: string, description: string, replaceContents: boolean) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [replaceContents, setReplaceContents] = useState(false);
  const [description, setDescription] = useState(initialDescription);
  const trimmed = name.trim();
  const exists = trimmed !== '' && trimmed !== originalName && (taken.includes(trimmed) || isBuiltinLayout(trimmed));
  // Saving over an existing name replaces it; renaming onto one is refused.
  const replaces = exists && originalName === null && !isBuiltinLayout(trimmed);
  const blocked = !trimmed || (exists && !replaces);
  const submit = () => { if (!blocked) onSubmit(trimmed, description.trim(), replaceContents); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <>
      <div className="fixed inset-0 z-[10000] bg-black/40" onClick={onCancel} />
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-6 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[380px] rounded-xl border border-subtle bg-surface-solid shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="px-4 py-3 border-b border-subtle text-sm font-semibold text-content">{title}</div>
          <div className="space-y-3 p-4">
            <label className="block">
              <span className="mb-1 block text-[11px] text-content-secondary">{t('telemetry:layoutDetails.name')}</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                className="w-full px-2.5 py-1.5 text-xs rounded-md bg-surface-input border border-default text-content focus:outline-none focus:border-blue-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-content-secondary">{t('telemetry:layoutDetails.description')} <span className="text-content-tertiary">{t('telemetry:layoutDetails.optional')}</span></span>
              <textarea
                value={description}
                rows={3}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full resize-none px-2.5 py-1.5 text-xs rounded-md bg-surface-input border border-default text-content focus:outline-none focus:border-blue-500"
              />
            </label>
            {originalName !== null && (
              <label className="flex cursor-pointer items-start gap-2 text-[11px] text-content-secondary">
                <input
                  type="checkbox"
                  checked={replaceContents}
                  onChange={(e) => setReplaceContents(e.target.checked)}
                  className="mt-0.5 accent-blue-500"
                />
                <span>
                  {t('telemetry:layoutDetails.replaceContents')}
                  <span className="block text-[10px] text-content-tertiary">{t('telemetry:layoutDetails.replaceContentsHint')}</span>
                </span>
              </label>
            )}
            {replaces && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
                {t('telemetry:layoutDetails.replacesExisting', { name: trimmed })}
              </div>
            )}
            {exists && !replaces && (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-300">
                {t('telemetry:layoutDetails.nameTaken')}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-subtle px-4 py-3">
            <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-md border border-subtle text-content-secondary hover:text-content transition-colors">{t('common:cancel')}</button>
            <button
              onClick={submit}
              disabled={blocked}
              className={'px-3 py-1.5 text-xs rounded-md text-white disabled:opacity-50 transition-colors ' + (replaces ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500')}
            >
              {replaces ? t('telemetry:layoutDetails.replace') : t('common:save')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const SHARE_ITEM = 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-content-secondary hover:bg-surface-raised hover:text-content';
const LAYOUT_ACTION = 'p-1 rounded text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors';

// A saved layout: loads on click; edit, share and delete on hover.
function SavedLayoutCard({ name, description, active, icon, onLoad, onEdit, onDelete, onShare }: {
  name: string;
  description?: string;
  active: boolean;
  icon: ReactNode;
  onLoad: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShare: (how: 'copy' | 'file' | 'native') => Promise<string | null>;
}): JSX.Element {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const share = async (how: 'copy' | 'file' | 'native') => {
    setShareOpen(false);
    const note = await onShare(how);
    if (note) {
      setFeedback(note);
      window.setTimeout(() => setFeedback(null), 2000);
    }
  };

  return (
    <div className="group/saved relative min-w-0" onMouseLeave={() => setConfirmDelete(false)}>
      <WsCard accent={WS_ACCENT.layout} active={active} icon={icon} label={name} description={description} onClick={onLoad} />
      {feedback && (
        <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-center text-[10px] text-emerald-400">{feedback}</div>
      )}
      {shareOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShareOpen(false)} />
          <div className="absolute right-1.5 top-9 z-20 w-44 rounded-lg border border-default bg-surface-solid p-1 shadow-xl">
            <button onClick={() => void share('copy')} className={SHARE_ITEM}><Copy className="w-3.5 h-3.5" />{t('telemetry:savedLayout.copyToClipboard')}</button>
            <button onClick={() => void share('file')} className={SHARE_ITEM}><Download className="w-3.5 h-3.5" />{t('telemetry:savedLayout.saveAsFile')}</button>
            {window.electronAPI?.canShareNatively && (
              <button onClick={() => void share('native')} className={SHARE_ITEM}><Share2 className="w-3.5 h-3.5" />{t('telemetry:savedLayout.share')}</button>
            )}
          </div>
        </>
      )}
      <div className={'absolute right-1.5 top-1.5 items-center gap-0.5 rounded-md border border-subtle bg-surface-solid px-0.5 py-0.5 shadow-sm ' + (shareOpen ? 'flex' : 'hidden group-hover/saved:flex')}>
        {confirmDelete ? (
          <button onClick={onDelete} className="px-1.5 py-0.5 rounded text-[10px] font-medium text-rose-300 bg-rose-500/15 hover:bg-rose-500/25">{t('telemetry:savedLayout.confirmDelete')}</button>
        ) : (
          <>
            <button onClick={onEdit} className={LAYOUT_ACTION} data-tip={t('telemetry:savedLayout.renameTip')}>
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={() => setShareOpen((v) => !v)} className={LAYOUT_ACTION} data-tip={t('telemetry:savedLayout.shareTip')}>
              <Share2 className="w-3 h-3" />
            </button>
            <button onClick={() => setConfirmDelete(true)} className={LAYOUT_ACTION + ' hover:text-rose-400'} data-tip={t('telemetry:savedLayout.deleteTip')}>
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Segmented control (telemetry rate, map view): pill group with an accent-
// filled active segment.
function WsSegment<T extends string>({ options, value, accent, onChange }: {
  options: { value: T; label: string; tip?: string }[];
  value: T;
  accent: string;
  onChange: (v: T) => void;
}): JSX.Element {
  return (
    <div className="inline-flex rounded-lg border border-default overflow-hidden bg-surface-solid">
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            data-tip={opt.tip}
            className={(i > 0 ? 'border-l border-subtle ' : '') + 'px-4 py-1.5 text-xs font-medium transition-colors ' + (active ? 'text-white' : 'text-content-secondary hover:bg-surface-raised')}
            style={active ? { background: accent } : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const WS_ICONS = {
  layout: (<svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>),
  rate: (<svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2 6 4-14 2 8h6" /></svg>),
  view: (<svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>),
  offline: (<svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>),
  panel: (<svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" /><path strokeLinecap="round" d="M12 8v8M8 12h8" /></svg>),
} as const;

// A distinct glyph per panel so the Add-panel grid is scannable by shape, not
// just text. Keyed by PANEL_COMPONENTS id; unknown ids fall back to a plus.
const svg = (children: ReactNode) => (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const PANEL_ICONS: Record<string, ReactNode> = {
  attitude: svg(<><circle cx="12" cy="12" r="9" /><path d="M4 12h16" /><path d="M8 9.5l4-2 4 2" /></>),
  altitude: svg(<><path d="M12 20V6" /><path d="M7 11l5-5 5 5" /><path d="M5 20h14" /></>),
  speed: svg(<><path d="M4 16a8 8 0 1116 0" /><path d="M12 16l4-4" /></>),
  battery: svg(<><rect x="3" y="8" width="15" height="8" rx="2" /><path d="M21 11v2" /></>),
  gps: svg(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>),
  position: svg(<><path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
  velocity: svg(<><path d="M3 12h11" /><path d="M10 7l5 5-5 5" /><path d="M19 6v12" /></>),
  flightMode: svg(<><path d="M6 21V4" /><path d="M6 4h11l-2 3.5L17 11H6" /></>),
  joystick: svg(<><rect x="2" y="8" width="20" height="10" rx="5" /><path d="M7 11v4M5 13h4" /><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="18.5" cy="14.5" r="1" fill="currentColor" stroke="none" /></>),
  flightControl: svg(<><circle cx="12" cy="8" r="3" /><path d="M12 11v7" /><path d="M8 21h8" /></>),
  map: svg(<><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></>),
  camera: svg(<><rect x="3" y="6" width="12" height="12" rx="2" /><path d="M15 10l6-3v10l-6-3" /></>),
  messages: svg(<><path d="M21 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h13a2 2 0 012 2z" /></>),
  safetyMonitor: svg(<><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>),
  rtk: svg(<><path d="M5 12a7 7 0 017-7" /><path d="M5 16a11 11 0 0111-11" /><circle cx="6" cy="18" r="2" fill="currentColor" stroke="none" /></>),
  preflightCheck: svg(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9z" /><path d="M9 13l2 2 4-4" /></>),
  waypoints: svg(<><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 16.5C10.5 13 13.5 10 16 7.5" /></>),
  altitudeProfile: svg(<><path d="M4 5v14h16" /><path d="M4 15l4-4 4 3 8-8" /></>),
  sitlEnvironment: svg(<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>),
  sitlFailures: svg(<><path d="M10.3 4l-8 14a2 2 0 001.7 3h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>),
};
function panelIcon(id: string): ReactNode {
  return PANEL_ICONS[id] ?? svg(<path d="M12 5v14M5 12h14" />);
}

function WorkspaceDialog(props: WorkspaceProps & { onClose: () => void }): JSX.Element {
  const { t } = useTranslation();
  const { onSave, onLoad, onReset, onEdit, onDelete, onShare, onImport, onAddPanel, layouts, layoutDescriptions, activeLayout, supportsMissionPlanning, isMavlink, isSitlRunning, hasMapPanel, onClose } = props;
  const mapMode = useEditModeStore((s) => s.mapMode);
  const setMapMode = useEditModeStore((s) => s.setMapMode);
  const cacheActive = useTileCacheAreaStore((s) => s.active);
  const setCacheActive = useTileCacheAreaStore((s) => s.setActive);
  const telemetrySpeed = useSettingsStore((s) => s.telemetrySpeed);
  const setTelemetrySpeed = useSettingsStore((s) => s.setTelemetrySpeed);
  // Save-as and edit share one small dialog; null when it is closed.
  const [details, setDetails] = useState<{ mode: 'save' } | { mode: 'edit'; name: string } | null>(null);
  const detailsOpen = useRef(false);
  detailsOpen.current = details !== null;
  const [importError, setImportError] = useState<string | null>(null);
  const [importMenu, setImportMenu] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleSpeedChange = (speed: TelemetrySpeed) => {
    setTelemetrySpeed(speed);
    window.electronAPI?.setTelemetryStreamRate(speed);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !detailsOpen.current) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const availablePresets = Object.entries(BUILTIN_LAYOUTS)
    .filter(([, layout]) => !('needsMissions' in layout && layout.needsMissions) || supportsMissionPlanning)
    .map(([key, layout]) => [key, t(layout.labelKey), t(layout.descriptionKey)] as const);
  const availablePanels = Object.entries(PANEL_COMPONENTS).filter(([id]) => {
    if (MISSION_PANEL_IDS.includes(id) && !supportsMissionPlanning) return false;
    if (MAVLINK_PANEL_IDS.includes(id) && !isMavlink) return false;
    if (SITL_PANEL_IDS.includes(id) && !isSitlRunning) return false;
    return true;
  });


  const bookmarkIcon = (<svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" /></svg>);
  const plusIcon = (<svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>);
  const panelIds = Object.keys(PANEL_COMPONENTS);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 pointer-events-none" data-tour="workspace-dialog">
        <div className="pointer-events-auto w-full max-w-[600px] max-h-[85vh] flex flex-col rounded-xl bg-surface-solid border border-subtle shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-subtle">
            <svg className="w-4 h-4 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            <span className="text-sm font-semibold text-content">{t('telemetry:workspace.title')}</span>
            <button onClick={onClose} data-tip={t('common:close')} className="ml-auto p-1.5 rounded text-content-secondary hover:text-content hover:bg-surface-raised transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="overflow-y-auto p-4 space-y-6 bg-surface-base">
            <WsSection label={t('telemetry:workspaceDialog.panelLayout')} accent={WS_ACCENT.layout} icon={WS_ICONS.layout}>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-content-tertiary">{t('telemetry:workspaceDialog.builtIn')}</div>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
                {availablePresets.map(([key, name, description]) => (
                  <WsCard key={key} accent={WS_ACCENT.layout} active={key === activeLayout} icon={WS_ICONS.layout} label={name} description={description} onClick={() => { onLoad(key); onClose(); }} />
                ))}
              </div>
              {layouts.length > 0 && (
                <>
                  <div className="mb-1.5 mt-4 text-[10px] font-medium uppercase tracking-wide text-content-tertiary">{t('telemetry:workspaceDialog.saved')}</div>
                  <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
                    {layouts.map((name) => (
                      <SavedLayoutCard
                        key={name}
                        name={name}
                        description={layoutDescriptions[name]}
                        active={name === activeLayout}
                        icon={bookmarkIcon}
                        onLoad={() => { onLoad(name); onClose(); }}
                        onEdit={() => setDetails({ mode: 'edit', name })}
                        onDelete={() => onDelete(name)}
                        onShare={(how) => onShare(name, how)}
                      />
                    ))}
                  </div>
                </>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => setDetails({ mode: 'save' })} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-subtle text-xs text-content-secondary hover:text-content hover:border-default transition-colors">
                  {plusIcon}
                  {t('telemetry:workspaceDialog.saveCurrentAs')}
                </button>
                <div className="relative">
                  <button
                    onClick={() => setImportMenu((v) => !v)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-subtle text-xs text-content-secondary hover:text-content hover:border-default transition-colors"
                    data-tip={t('telemetry:workspaceDialog.importTip')}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {t('telemetry:workspaceDialog.import')}
                  </button>
                  {importMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setImportMenu(false)} />
                      <div className="absolute left-0 top-8 z-20 w-48 rounded-lg border border-default bg-surface-solid p-1 shadow-xl">
                        <button onClick={() => { setImportMenu(false); importInputRef.current?.click(); }} className={SHARE_ITEM}>
                          <FileUp className="w-3.5 h-3.5" />{t('telemetry:workspaceDialog.fromFile')}
                        </button>
                        <button
                          onClick={async () => {
                            setImportMenu(false);
                            try {
                              setImportError(await onImport(await navigator.clipboard.readText()));
                            } catch {
                              setImportError(t('telemetry:workspaceDialog.clipboardReadFailed'));
                            }
                          }}
                          className={SHARE_ITEM}
                        >
                          <ClipboardPaste className="w-3.5 h-3.5" />{t('telemetry:workspaceDialog.pasteFromClipboard')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) setImportError(await onImport(await file.text()));
                  }}
                />
                <button onClick={() => { onReset(); }} className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-subtle text-xs text-content-secondary hover:text-content hover:border-default transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 006.34 6.34M4 15a8 8 0 0013.66 2.66" /></svg>
                  {t('telemetry:workspaceDialog.resetToPreset')}
                </button>
              </div>
              {importError && (
                <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">{importError}</div>
              )}
            </WsSection>

            {isMavlink && (
              <WsSection label={t('telemetry:workspaceDialog.telemetryRate')} accent={WS_ACCENT.rate} icon={WS_ICONS.rate}>
                <WsSegment options={SPEED_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey), tip: t(o.tipKey) }))} value={telemetrySpeed} accent={WS_ACCENT.rate} onChange={handleSpeedChange} />
                <p className="mt-1.5 text-[11px] text-content-tertiary">{t('telemetry:workspaceDialog.telemetryRateHint')}</p>
              </WsSection>
            )}

            {import.meta.env.DEV && (
              <WsSection label={t('telemetry:workspaceDialog.mapView')} accent={WS_ACCENT.view} icon={WS_ICONS.view}>
                <WsSegment
                  options={[{ value: '2d', label: t('telemetry:workspaceDialog.map2d') }, { value: '3d', label: t('telemetry:workspaceDialog.map3d') }]}
                  value={mapMode}
                  accent={WS_ACCENT.view}
                  onChange={(v) => setMapMode(v)}
                />
              </WsSection>
            )}

            {hasMapPanel && (
              <WsSection label={t('telemetry:workspaceDialog.offlineMaps')} accent={WS_ACCENT.offline} icon={WS_ICONS.offline}>
                <button
                  onClick={() => { setCacheActive(!cacheActive); onClose(); }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs shadow-sm transition-all hover:shadow-md"
                  style={
                    cacheActive
                      ? { background: WS_ACCENT.offline, color: '#fff', border: '1px solid ' + WS_ACCENT.offline }
                      : { border: '1px solid var(--border-subtle)', background: 'var(--bg-surface-solid)', color: 'var(--text-primary)' }
                  }
                >
                  <span style={{ color: cacheActive ? '#fff' : WS_ACCENT.offline }}>{WS_ICONS.offline}</span>
                  {cacheActive ? t('telemetry:workspaceDialog.selectingArea') : t('telemetry:workspaceDialog.saveOfflineArea')}
                </button>
                <p className="mt-1.5 text-[11px] text-content-tertiary">{t('telemetry:workspaceDialog.offlineHint')}</p>
              </WsSection>
            )}

            <WsSection label={t('telemetry:workspaceDialog.addPanel')} accent={WS_ACCENT.panel} icon={WS_ICONS.panel}>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                {availablePanels.map(([id, { component, titleKey }]) => (
                  <WsCard
                    key={id}
                    accent={WS_ACCENT.panel}
                    accentIcon
                    icon={panelIcon(id)}
                    label={t(titleKey)}
                    onClick={() => onAddPanel(id, component, t(titleKey))}
                    dataTour={id === panelIds[0] ? 'add-panel' : id === 'rtk' ? 'add-panel-rtk' : undefined}
                  />
                ))}
              </div>
            </WsSection>
          </div>
        </div>
      </div>
      {details && (
        <LayoutDetailsDialog
          title={details.mode === 'save' ? t('telemetry:layoutDetails.saveTitle') : t('telemetry:layoutDetails.editTitle')}
          initialName={details.mode === 'edit' ? details.name : ''}
          initialDescription={details.mode === 'edit' ? layoutDescriptions[details.name] ?? '' : ''}
          taken={layouts}
          originalName={details.mode === 'edit' ? details.name : null}
          onCancel={() => setDetails(null)}
          onSubmit={(name, description, replaceContents) => {
            if (details.mode === 'save') {
              // Replacing without a new description keeps the one it had.
              onSave(name, description || (layouts.includes(name) ? layoutDescriptions[name] ?? '' : ''));
            } else {
              onEdit(details.name, name, description, replaceContents);
            }
            setDetails(null);
          }}
        />
      )}
    </>,
    document.body,
  );
}

// Mission-related panel IDs that require mission planning support
// Note: missionMap removed - now integrated into unified MapPanel
const MISSION_PANEL_IDS = ['waypoints', 'altitudeProfile'];

// MAVLink-only panel IDs (STATUSTEXT doesn't exist in MSP)
const MAVLINK_PANEL_IDS = ['messages', 'preflightCheck', 'safetyMonitor', 'rtk', 'joystick'];

// SITL-only panel IDs (only shown when ArduPilot SITL is running)
const SITL_PANEL_IDS = ['sitlEnvironment', 'sitlFailures'];

// Sensor health warning badge - shows unhealthy sensor names
function SensorHealthWarning({ sensors }: { sensors: string[] }) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 border border-red-500/30 rounded"
      title={t('telemetry:sensorHealth.unhealthyTitle', { sensors: sensors.join(', ') })}
    >
      <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
      </svg>
      <span className="font-mono text-xs text-red-400">{sensors.join(' ')}</span>
    </div>
  );
}

// Telemetry speed selector labels
const SPEED_OPTIONS: { value: TelemetrySpeed; labelKey: string; tipKey: string }[] = [
  { value: 'fc', labelKey: 'telemetry:speed.fc', tipKey: 'telemetry:speed.fcTip' },
  { value: 'eco', labelKey: 'telemetry:speed.eco', tipKey: 'telemetry:speed.ecoTip' },
  { value: 'normal', labelKey: 'telemetry:speed.normal', tipKey: 'telemetry:speed.normalTip' },
  { value: 'max', labelKey: 'telemetry:speed.max', tipKey: 'telemetry:speed.maxTip' },
];

// Quick stats bar
function QuickStatsBar({ trailing }: { trailing?: ReactNode }) {
  const { t } = useTranslation();
  const flight = useTelemetryStore((s) => s.flight);
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const battery = useTelemetryStore((s) => s.battery);
  const gps = useTelemetryStore((s) => s.gps);
  const sensorHealth = useTelemetryStore((s) => s.sensorHealth);
  const connectionState = useConnectionStore((s) => s.connectionState);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  // Without a link the store holds zero-defaults; painting those red reads as
  // a failing vehicle instead of "not connected", so show neutral dashes.
  // Fleet/swarm links never set connectionState.isConnected (background
  // transports), so mirror App's "fleet exists = connected" rule; otherwise the
  // bar would dash out live fleet telemetry.
  const fleetVehicleCount = useActiveVehicleStore((s) => Object.keys(s.knownVehicles).length);
  const connected = connectionState.isConnected || fleetVehicleCount > 0;
  const batteryColor = !connected || battery.remaining < 0 ? 'text-content-secondary' : battery.remaining > 30 ? 'text-emerald-400' : battery.remaining > 15 ? 'text-amber-500' : 'text-red-400';

  // GPS satellite color
  const satColor = !connected ? 'text-content-secondary' : gps.fixType >= 3 ? 'text-emerald-400' : gps.fixType >= 2 ? 'text-amber-500' : 'text-red-400';
  const stat = (v: string) => (connected ? v : '--');

  // Unhealthy sensors from SYS_STATUS
  const unhealthySensors: string[] = [];
  if (sensorHealth) {
    const { present, health } = sensorHealth;
    const check = (bit: number, name: string) => {
      if ((present & bit) && !(health & bit)) unhealthySensors.push(name);
    };
    check(0x20, 'GPS');
    check(0x04, 'MAG');
    check(0x08, 'BARO');
    check(0x02, 'ACC');
    check(0x01, 'GYR');
  }

  return (
    <div className={`shrink-0 px-4 py-2 flex items-center justify-between border-b ${
      flight.armed
        ? 'bg-red-500/10 border-red-500/30'
        : 'bg-surface border-subtle'
    }`}>
      <div className="flex items-center gap-3">
        <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide ${
          flight.armed && connected ? 'bg-red-500 text-white' : 'bg-surface-raised text-content-secondary'
        }`}>
          {!connected ? t('telemetry:quickStats.noLink') : flight.armed ? t('telemetry:quickStats.armed') : t('telemetry:quickStats.disarmed')}
        </span>
        <span className={`text-lg font-medium ${connected ? 'text-content' : 'text-content-tertiary'}`}>
          {connected ? flight.mode : t('telemetry:quickStats.notConnected')}
        </span>
      </div>
      <div className="flex items-center gap-6 text-xs">
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">{t('telemetry:quickStats.hdg')}</span>
          <span className="font-mono text-sm text-content">{stat(`${vfrHud.heading.toFixed(0)}°`)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">{t('telemetry:quickStats.alt')}</span>
          <span className="font-mono text-sm text-content">{stat(formatAltitudeFromMeters(vfrHud.alt, altitudeUnit))}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">{t('telemetry:quickStats.spd')}</span>
          <span className="font-mono text-sm text-content">{stat(formatSpeedFromMetersPerSecond(vfrHud.groundspeed, speedUnit))}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">{t('telemetry:quickStats.thr')}</span>
          <span className="font-mono text-sm text-content">{stat(`${vfrHud.throttle}%`)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">{t('telemetry:quickStats.bat')}</span>
          <span className={`font-mono text-sm ${batteryColor}`}>{stat(`${battery.voltage.toFixed(1)}V`)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">{t('telemetry:quickStats.sat')}</span>
          <span className={`font-mono text-sm ${satColor}`}>{stat(String(gps.satellites))}</span>
        </div>
        {unhealthySensors.length > 0 && (
          <SensorHealthWarning sensors={unhealthySensors} />
        )}
        {trailing && (
          <>
            <div className="w-px h-5 bg-subtle ml-1" />
            {trailing}
          </>
        )}
      </div>
    </div>
  );
}

function TelemetryDashboardImpl() {
  const { t } = useTranslation();
  const resolvedTheme = useResolvedTheme();
  const apiRef = useRef<DockviewApi | null>(null);
  const { layouts, activeLayoutName, loadLayouts, saveLayout, deleteLayout, setActiveLayout } = useLayoutStore();
  const connectionState = useConnectionStore((s) => s.connectionState);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [hasMapPanel, setHasMapPanel] = useState(true);

  // Check if mission planning is supported
  // Betaflight (BTFL) and Cleanflight (CLFL) do NOT support missions
  // iNav (INAV) and MAVLink (ArduPilot) DO support missions
  const isMspBetaflight = connectionState.protocol === 'msp' && connectionState.fcVariant === 'BTFL';
  const isMspCleanflight = connectionState.protocol === 'msp' && connectionState.fcVariant === 'CLFL';
  const supportsMissionPlanning = !isMspBetaflight && !isMspCleanflight;

  // Check if ArduPilot SITL is running (for SITL-only panels)
  const isSitlRunning = useArduPilotSitlStore((s) => s.isRunning);

  // Load layouts on mount
  useEffect(() => {
    loadLayouts();
  }, [loadLayouts]);

  // Auto-save layout when it changes
  useEffect(() => {
    if (!apiRef.current || !layoutLoaded) return;

    const handleLayoutChange = () => {
      const api = apiRef.current;
      if (!api) return;
      window.electronAPI?.saveLayout(TELEMETRY_AUTOSAVE_NAME, api.toJSON());
      const mapPresent = api.panels.some((p) => p.id === 'map' || p.id.startsWith('map-'));
      setHasMapPanel(mapPresent);
      // Caching needs the map; close the mode if the panel is gone.
      if (!mapPresent) useTileCacheAreaStore.getState().setActive(false);
    };

    handleLayoutChange();
    // Subscribe to layout changes
    const disposable = apiRef.current.onDidLayoutChange(handleLayoutChange);

    return () => {
      disposable.dispose();
    };
  }, [layoutLoaded]);

  const onReady = useCallback(async (event: DockviewReadyEvent) => {
    apiRef.current = event.api;

    // First, try to load auto-saved layout (most recent state). The cockpit, split and
    // render mode persist in their own stores, so only the grid is restored here.
    try {
      const autoSaved = await window.electronAPI?.getLayout(TELEMETRY_AUTOSAVE_NAME);
      if (autoSaved?.data) {
        event.api.fromJSON(dockOf(autoSaved.data));
        setLayoutLoaded(true);
        return;
      }
    } catch (e) {
      console.warn('Failed to load auto-saved layout:', e);
    }

    // Fall back to named layout from store
    const savedLayout = layouts[activeLayoutName];
    if (savedLayout?.data) {
      try {
        event.api.fromJSON(dockOf(savedLayout.data));
        if (isWorkspaceV2(savedLayout.data) && savedLayout.data.extras) applyWorkspaceExtras(savedLayout.data.extras);
        setLayoutLoaded(true);
        return;
      } catch (e) {
        console.warn('Failed to load saved layout, using default:', e);
      }
    }

    // First launch: the full Pilot workspace, cockpit and split included.
    loadBuiltinLayout(event.api, DEFAULT_LAYOUT);
    void setActiveLayout(DEFAULT_LAYOUT);
    setLayoutLoaded(true);
  }, [layouts, activeLayoutName, setActiveLayout]);

  const handleSaveLayout = useCallback(async (name: string, description = '') => {
    if (!apiRef.current) return;
    await saveLayout(name, captureWorkspace(apiRef.current.toJSON(), description));
    await setActiveLayout(name);
  }, [saveLayout, setActiveLayout]);

  const handleLoadLayout = useCallback(async (name: string) => {
    if (!apiRef.current) return;
    await setActiveLayout(name);

    if (isBuiltinLayout(name)) {
      apiRef.current.clear();
      loadBuiltinLayout(apiRef.current, name);
      return;
    }

    // Saved layouts: v2 also restores its cockpit, split and render mode.
    const layout = layouts[name];
    if (layout?.data) {
      try {
        apiRef.current.fromJSON(dockOf(layout.data));
        if (isWorkspaceV2(layout.data) && layout.data.extras) applyWorkspaceExtras(layout.data.extras);
      } catch (e) {
        console.warn('Failed to load layout:', e);
        apiRef.current.clear();
        loadBuiltinLayout(apiRef.current, DEFAULT_LAYOUT);
      }
    } else {
      apiRef.current.clear();
      loadBuiltinLayout(apiRef.current, DEFAULT_LAYOUT);
    }
  }, [layouts, setActiveLayout]);

  const handleEditLayout = useCallback(async (name: string, newName: string, description: string, replaceContents: boolean) => {
    const layout = layouts[name];
    if (!layout) return;
    const data = replaceContents && apiRef.current
      ? captureWorkspace(apiRef.current.toJSON(), description)
      : withDescription(layout.data, description);
    await saveLayout(newName, data);
    if (newName !== name) {
      const wasActive = activeLayoutName === name;
      await deleteLayout(name);
      if (wasActive) await setActiveLayout(newName);
    }
  }, [layouts, activeLayoutName, saveLayout, deleteLayout, setActiveLayout]);

  const handleShareLayout = useCallback(async (name: string, how: 'copy' | 'file' | 'native'): Promise<string | null> => {
    const layout = layouts[name];
    if (!layout) return null;
    const payload = exportPayload(name, layout.data);
    try {
      if (how === 'copy') {
        await navigator.clipboard.writeText(payload);
        return t('telemetry:share.copied');
      }
      if (how === 'file') return (await window.electronAPI?.exportLayoutFile(exportFileName(name), payload)) ? t('telemetry:share.saved') : null;
      await window.electronAPI?.shareLayout(exportFileName(name), payload);
      return null;
    } catch {
      return t('telemetry:share.failed');
    }
  }, [layouts, t]);

  const handleImportLayout = useCallback(async (raw: string): Promise<string | null> => {
    const result = parseImport(raw);
    if ('error' in result) return result.error;
    const visible = Object.keys(layouts).filter((n) => !n.startsWith('__'));
    await saveLayout(uniqueLayoutName(result.name, visible), result.layout);
    return null;
  }, [layouts, saveLayout]);

  const handleResetLayout = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.clear();
    loadBuiltinLayout(apiRef.current, DEFAULT_LAYOUT);
  }, []);

  const handleAddPanel = useCallback((id: string, component: string, title: string) => {
    if (!apiRef.current) return;

    // Generate unique panel id (in case the panel is already open)
    const uniqueId = `${id}-${Date.now()}`;

    // Add panel to the currently active group or create new one
    apiRef.current.addPanel({
      id: uniqueId,
      component,
      title,
    });
  }, []);

  // Expose a tour-facing bridge so the tour manager can check/provision panels.
  useEffect(() => {
    const setBridge = useTelemetryLayoutStore.getState().setBridge;
    setBridge({
      hasPanel: (panelId) => {
        const api = apiRef.current;
        if (!api) return false;
        // Preset layouts use panelId as the panel id directly.
        // User-added panels use `${panelId}-${timestamp}`.
        return api.panels.some(
          (p) => p.id === panelId || p.id.startsWith(`${panelId}-`),
        );
      },
      addPanel: (panelId) => {
        const api = apiRef.current;
        if (!api) return;
        const entry = PANEL_COMPONENTS[panelId as keyof typeof PANEL_COMPONENTS];
        if (!entry) return;
        const uniqueId = `${panelId}-${Date.now()}`;
        const panel = api.addPanel({
          id: uniqueId,
          component: entry.component,
          title: t(entry.titleKey),
        });
        // Make sure the new panel's tab is the active one in its group,
        // otherwise it renders hidden and selectors won't find it.
        panel?.api.setActive();
      },
      activatePanel: (panelId) => {
        const api = apiRef.current;
        if (!api) return;
        const existing = api.panels.find(
          (p) => p.id === panelId || p.id.startsWith(`${panelId}-`),
        );
        existing?.api.setActive();
      },
      loadPreset: (presetKey) => {
        if (!apiRef.current || !isBuiltinLayout(presetKey)) return;
        apiRef.current.clear();
        loadBuiltinLayout(apiRef.current, presetKey);
      },
    });
    return () => {
      useTelemetryLayoutStore.getState().setBridge(null);
    };
  }, [handleAddPanel, t]);

  return (
    <div className="h-full flex flex-col">
      {/* Quick stats bar, now also home to the single Workspace launcher that
          replaced the old always-on layout toolbar row. */}
      <QuickStatsBar
        trailing={
          <WorkspaceButton
            onSave={handleSaveLayout}
            onLoad={handleLoadLayout}
            onReset={handleResetLayout}
            onEdit={(name, newName, description, replaceContents) => void handleEditLayout(name, newName, description, replaceContents)}
            onDelete={(name) => void deleteLayout(name)}
            onShare={handleShareLayout}
            onImport={handleImportLayout}
            onAddPanel={handleAddPanel}
            layouts={Object.keys(layouts).filter(name => !name.startsWith('__'))}
            layoutDescriptions={Object.fromEntries(
              Object.entries(layouts).flatMap(([n, l]) => {
                const d = descriptionOf(l.data);
                return d ? [[n, d]] : [];
              }),
            )}
            activeLayout={activeLayoutName}
            supportsMissionPlanning={supportsMissionPlanning}
            isMavlink={connectionState.protocol === 'mavlink'}
            isSitlRunning={isSitlRunning}
            hasMapPanel={hasMapPanel}
          />
        }
      />

      {/* Fleet strip (left) + dockview container. The strip renders nothing for
          a single vehicle, so single-vehicle layout is unchanged. */}
      <div className="flex-1 flex flex-row min-h-0">
        <FleetStrip />
        <div className="flex-1 min-w-0">
          <DockviewReact
            components={components}
            onReady={onReady}
            theme={resolvedTheme === 'light' ? themeLight : themeDark}
            rightHeaderActionsComponent={PanelHeaderActions}
            className="h-full"
          />
        </div>
      </div>
      <DraggableFleetActions />
    </div>
  );
}

// Memo boundary: App re-renders for many reasons (connection, params, nav);
// this panel only depends on its own narrowed store selections, so it must not
// reconcile just because the root did. Props are empty, so a plain memo suffices.
export const TelemetryDashboard = memo(TelemetryDashboardImpl);
