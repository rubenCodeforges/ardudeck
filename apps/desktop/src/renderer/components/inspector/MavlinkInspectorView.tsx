/**
 * MAVLink Inspector — live tree of every received message with its decoded
 * fields, plus a dockview-managed graph workspace on the right where each
 * "Graph this" action becomes a tab. Tabs can be torn off into their own OS
 * windows, dragged between windows to merge, dragged back to re-dock — the
 * same docking model the telemetry dashboard uses.
 *
 * Layout: header on top, then a horizontal split with the tree on the left
 * and the graph workspace on the right. Tree re-renders at 4Hz (inspector-
 * store tick). Graph panels independently sample on the same tick.
 */

import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type IDockviewHeaderActionsProps,
  themeDark,
  themeLight,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import {
  acquireInspectorFields,
  getInspectorSnapshot,
  getSamples,
  useInspectorStore,
  panelIdForGraph,
  overlayBufferId,
  type GraphSample,
  type MessageStats,
  type GraphSpec,
} from '../../stores/inspector-store';
import { seriesColor } from '../logs/log-chart-stats';
import { useConnectionStore } from '../../stores/connection-store';
import { useActiveVehicleIdentity } from '../../hooks/useFleet';
import { useResolvedTheme } from '../../hooks/useTheme';
import { FieldGraph } from './FieldGraph';

// GraphSpec moved to inspector-store.ts so the store can own the canonical
// list of plotted graphs (survives view switches). Imported above as a type.
// panelIdForGraph also lives in the store for the same reason.

/** dockview component registry — just the one graph component for now. */
const inspectorDockviewComponents: Record<string, React.FC<IDockviewPanelProps>> = {
  FieldGraph: (props) => <FieldGraph {...(props.params as Record<string, unknown>)} />,
};

/**
 * Header-action slot for each graph tab group — spawns a native Electron
 * BrowserWindow containing a fresh inspector view, pre-populated with every
 * graph currently in this group. We can't use dockview's `addPopoutGroup`
 * because it requires the popped window to share a renderer process with the
 * parent (Electron doesn't allow this — child BrowserWindows get their own
 * renderer for isolation, and the popped window ends up unstyled).
 */
function GraphHeaderActions(props: IDockviewHeaderActionsProps): JSX.Element | null {
  const { t } = useTranslation();
  if (!props.activePanel) return null;

  const handleClick = () => {
    // Collect every tab in this group as a GraphSpec so the popped window
    // can recreate the same set of tabs in its own dockview instance.
    const panels = props.group.panels;
    const specs: GraphSpec[] = [];
    for (const p of panels) {
      const params = p.params as Record<string, unknown> | undefined;
      if (!params) continue;
      specs.push({
        sysid: Number(params.sysid),
        compid: Number(params.compid),
        msgid: Number(params.msgid),
        messageName: String(params.messageName ?? `MSG_${params.msgid}`),
        fieldName: String(params.fieldName ?? ''),
      });
    }
    if (specs.length === 0) return;

    // Snapshot each graph's current sample history so the popped window
    // doesn't start from scratch — without this, the popped graph shows a
    // flat-line "warmup" while it accumulates the first ~minute of samples
    // and the user sees their existing graph effectively destroyed.
    const initialSamples: Record<string, GraphSample[]> = {};
    const storeOverlays = useInspectorStore.getState().overlays;
    const initialOverlays: Record<string, string[]> = {};
    for (const spec of specs) {
      const id = panelIdForGraph(spec);
      initialSamples[id] = [...getSamples(id)];
      const fields = storeOverlays[id];
      if (fields && fields.length > 0) {
        initialOverlays[id] = [...fields];
        for (const f of fields) {
          const oid = overlayBufferId(id, f);
          initialSamples[oid] = [...getSamples(oid)];
        }
      }
    }

    // Popout COPIES — we don't remove tabs from the main inspector. That
    // way "Dock back" on the detached window is just `window.close()`: the
    // user never loses graphs they were already looking at. To get rid of
    // tabs in main, the user closes them explicitly via the tab's X.
    window.electronAPI.openDetachedWindow({
      componentId: 'inspector-graphs',
      title: t('inspector:mavlinkInspector.windowTitle', { count: specs.length }),
      initialBounds: { width: 1000, height: 700 },
      props: { initialGraphs: specs, initialSamples, initialOverlays },
    });
  };

  return (
    <button
      data-tour="inspector-popout"
      onClick={handleClick}
      className="h-7 px-2 mx-0.5 rounded-md inline-flex items-center gap-1.5 text-xs transition-colors text-content-secondary hover:text-content hover:bg-surface-raised"
      title={t('inspector:mavlinkInspector.popOutTitle', { count: props.group.panels.length })}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M14 3h7m0 0v7m0-7L10 14M5 5h4M5 19h14a0 0 0 010 0v-4" />
      </svg>
      <span>{t('inspector:mavlinkInspector.popOut')}</span>
    </button>
  );
}

/** Watermark shown when the graph workspace is empty. */
function GraphsWatermark(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="h-full w-full flex items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 12l3-3 3 3 4-4M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="text-sm font-medium text-content mb-1">{t('inspector:mavlinkInspector.watermarkTitle')}</div>
        <div className="text-xs text-content-secondary leading-relaxed">
          {t('inspector:mavlinkInspector.watermarkHint')}
        </div>
      </div>
    </div>
  );
}

export function MavlinkInspectorView(): JSX.Element {
  const { t } = useTranslation();
  // Field decode runs only while a fields-consuming view is mounted.
  useEffect(() => acquireInspectorFields(), []);
  const tick = useInspectorStore((s) => s.tick);
  const paused = useInspectorStore((s) => s.paused);
  const setPaused = useInspectorStore((s) => s.setPaused);
  const filterText = useInspectorStore((s) => s.filterText);
  const setFilterText = useInspectorStore((s) => s.setFilterText);
  const sysidFilter = useInspectorStore((s) => s.sysidFilter);
  const setSysidFilter = useInspectorStore((s) => s.setSysidFilter);
  const compidFilter = useInspectorStore((s) => s.compidFilter);
  const setCompidFilter = useInspectorStore((s) => s.setCompidFilter);
  const reset = useInspectorStore((s) => s.reset);
  // Fleet-aware: the inspector groups packets by sysid:compid and shows the whole
  // fleet, so it is "live" whenever the primary link OR a fleet is up - not just
  // the idle primary connection.
  const isConnected = useActiveVehicleIdentity().connected;
  const resolvedTheme = useResolvedTheme();

  // Store-backed state — these survive component unmount (view switches).
  const graphs = useInspectorStore((s) => s.graphs);
  const removeGraph = useInspectorStore((s) => s.removeGraph);
  const expandedKeys = useInspectorStore((s) => s.expandedTreeKeys);
  const apiRef = useRef<DockviewApi | null>(null);
  const [treeWidth, setTreeWidth] = useState(loadTreeWidth);

  useEffect(() => {
    try { localStorage.setItem(TREE_WIDTH_KEY, String(treeWidth)); } catch { /* ignore */ }
  }, [treeWidth]);

  const onDockviewReady = (event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    // Re-create every persisted graph as a dockview panel. Runs once on
    // initial mount, restoring whatever the user had open last time the
    // inspector was visible.
    for (const g of graphs) {
      const id = panelIdForGraph(g);
      if (event.api.getPanel(id)) continue;
      event.api.addPanel({
        id,
        component: 'FieldGraph',
        title: `${g.messageName}.${g.fieldName}`,
        params: { ...g },
      });
    }
    // Closing a dockview tab (via the X) is the canonical "remove graph"
    // gesture — keep the store in sync so the next mount doesn't resurrect
    // the closed tab.
    event.api.onDidRemovePanel((panel) => {
      removeGraph(panel.id);
    });
  };

  // When the store changes (e.g. user clicked Graph this for a new field),
  // add any missing panels to the live dockview. We only add — removals go
  // through dockview's close button which is wired above.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const wanted = new Set(graphs.map(panelIdForGraph));
    for (const g of graphs) {
      const id = panelIdForGraph(g);
      if (api.getPanel(id)) continue;
      api.addPanel({
        id,
        component: 'FieldGraph',
        title: `${g.messageName}.${g.fieldName}`,
        params: { ...g },
      });
    }
    for (const panel of api.panels) {
      if (!wanted.has(panel.id)) panel.api.close();
    }
  }, [graphs]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snapshot = useMemo(() => getInspectorSnapshot(), [tick]);

  const sysids = useMemo(() => {
    const s = new Set<number>();
    for (const m of snapshot.flat) s.add(m.sysid);
    return [...s].sort((a, b) => a - b);
  }, [snapshot]);
  const compids = useMemo(() => {
    const s = new Set<number>();
    for (const m of snapshot.flat) {
      if (sysidFilter === 0 || m.sysid === sysidFilter) s.add(m.compid);
    }
    return [...s].sort((a, b) => a - b);
  }, [snapshot, sysidFilter]);

  const filteredMessages = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    return snapshot.flat.filter((m) => {
      if (sysidFilter !== 0 && m.sysid !== sysidFilter) return false;
      if (compidFilter !== 0 && m.compid !== compidFilter) return false;
      if (needle && !m.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [snapshot, filterText, sysidFilter, compidFilter]);

  const grouped = useMemo(() => {
    const m = new Map<string, MessageStats[]>();
    for (const msg of filteredMessages) {
      const k = `${msg.sysid}:${msg.compid}`;
      const list = m.get(k);
      if (list) list.push(msg);
      else m.set(k, [msg]);
    }
    return m;
  }, [filteredMessages]);

  const totalMsgs = snapshot.flat.length;
  const totalRate = useMemo(() => {
    let hz = 0, bps = 0;
    for (const m of snapshot.flat) {
      hz += m.hz;
      bps += m.bps;
    }
    return { hz, bps };
  }, [snapshot]);

  const toggleTreeExpanded = useInspectorStore((s) => s.toggleTreeExpanded);
  const expanded = useMemo(() => new Set(expandedKeys), [expandedKeys]);

  return (
    <div className="h-full flex flex-col bg-surface-base text-content">
      {/* Header */}
      <div className="px-4 py-3 border-b border-subtle bg-surface-nav backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div className="flex-1" data-tour="inspector-stats">
            <h2 className="text-base font-semibold text-content">{t('common:mavlinkInspector')}</h2>
            <div className="text-xs text-content-secondary tabular-nums">
              {isConnected ? (
                <>
                  {t('inspector:mavlinkInspector.messageTypes', { count: totalMsgs })}
                  {' · '}
                  {t('inspector:mavlinkInspector.hzTotal', { hz: totalRate.hz.toFixed(1) })}
                  {' · '}
                  {formatBps(totalRate.bps)}
                </>
              ) : (
                t('inspector:mavlinkInspector.waitingNotConnected')
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPaused(!paused)}
              className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors ${
                paused
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 hover:bg-amber-500/25'
                  : 'bg-surface border-subtle text-content-secondary hover:bg-surface-raised hover:text-content'
              }`}
              title={paused ? t('inspector:mavlinkInspector.resumeTitle') : t('inspector:mavlinkInspector.pauseTitle')}
            >
              {paused ? t('inspector:mavlinkInspector.resume') : t('common:pause')}
            </button>
            <button
              onClick={reset}
              className="px-2.5 py-1.5 text-xs rounded-md bg-surface border border-subtle text-content-secondary hover:bg-surface-raised hover:text-content transition-colors"
              title={t('inspector:mavlinkInspector.clearTitle')}
            >
              {t('common:clear')}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2" data-tour="inspector-filters">
          <div className="relative flex-1">
            <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-content-tertiary pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
            </svg>
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={t('inspector:mavlinkInspector.searchPlaceholder')}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-surface-input border border-subtle rounded-md placeholder:text-content-tertiary text-content focus:outline-none focus:border-blue-500/60"
            />
          </div>

          <select
            value={sysidFilter}
            onChange={(e) => setSysidFilter(Number(e.target.value))}
            className="px-2 py-1.5 text-sm bg-surface-input border border-subtle rounded-md text-content focus:outline-none focus:border-blue-500/60"
            title={t('inspector:mavlinkInspector.filterSysidTitle')}
          >
            <option value={0}>{t('inspector:mavlinkInspector.allSysids')}</option>
            {sysids.map((s) => ( // i18n-exempt: MAVLink field name
              <option key={s} value={s}>sysid {s}</option>
            ))}
          </select>

          <select
            value={compidFilter}
            onChange={(e) => setCompidFilter(Number(e.target.value))}
            className="px-2 py-1.5 text-sm bg-surface-input border border-subtle rounded-md text-content focus:outline-none focus:border-blue-500/60"
            title={t('inspector:mavlinkInspector.filterCompidTitle')}
          >
            <option value={0}>{t('inspector:mavlinkInspector.allCompids')}</option>
            {compids.map((c) => ( // i18n-exempt: MAVLink field name
              <option key={c} value={c}>compid {c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Body: tree (left) | graph workspace (right) */}
      <div className="flex-1 min-h-0 flex">
        <div
          style={{ width: treeWidth }}
          className="shrink-0 overflow-auto px-2 py-2"
          data-tour="inspector-tree"
        >
          {filteredMessages.length === 0 ? (
            <EmptyState isConnected={isConnected} hasFilter={!!filterText} />
          ) : (
            [...grouped.entries()].map(([groupKey, msgs]) => {
              const [sysid, compid] = groupKey.split(':');
              return (
                <div key={groupKey} className="mb-4">
                  <div className="text-[10px] uppercase tracking-wider text-content-tertiary font-semibold px-2 py-1">
                    {t('inspector:mavlinkInspector.groupHeader', { sysid, compid })}
                  </div>
                  <div className="rounded-lg overflow-hidden border border-subtle bg-surface">
                    {msgs.map((m) => (
                      <MessageRow
                        key={m.key}
                        stats={m}
                        isExpanded={expanded.has(m.key)}
                        onToggle={() => toggleTreeExpanded(m.key)}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <TreeResizeHandle onDrag={(dx) => setTreeWidth((w) => clampTreeWidth(w + dx))} />

        <div className="flex-1 min-w-0" data-tour="inspector-graph-workspace">
          <DockviewReact
            components={inspectorDockviewComponents}
            onReady={onDockviewReady}
            theme={resolvedTheme === 'light' ? themeLight : themeDark}
            rightHeaderActionsComponent={GraphHeaderActions}
            watermarkComponent={GraphsWatermark}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}

function MessageRow({
  stats,
  isExpanded,
  onToggle,
}: {
  stats: MessageStats;
  isExpanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const fields = stats.fields ? Object.entries(stats.fields) : [];

  return (
    <div className="border-b border-subtle last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-raised transition-colors text-left"
      >
        <svg
          className={`w-3 h-3 text-content-tertiary transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="currentColor" viewBox="0 0 20 20"
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        <span className="font-mono text-sm text-content flex-1 truncate">{stats.name}</span>
        <span className="text-xs text-content-tertiary tabular-nums">#{stats.msgid}</span>
        <span className="text-xs text-blue-400 tabular-nums w-14 text-right">
          {stats.hz.toFixed(1)} Hz{/* i18n-exempt: unit */}
        </span>
        <span className="text-xs text-emerald-500 tabular-nums w-16 text-right">
          {formatBps(stats.bps)}
        </span>
      </button>
      {isExpanded && (
        <div className="bg-surface-inset/40 border-t border-subtle px-3 py-2">
          {fields.length === 0 ? (
            <div className="text-xs text-content-tertiary italic px-2 py-1">
              {t('inspector:mavlinkInspector.noDecoder', { msgid: stats.msgid })}
            </div>
          ) : (
            <table className="w-full text-xs font-mono">
              <tbody>
                {fields.map(([name, value]) => (
                  <FieldRow key={name} stats={stats} fieldName={name} value={value} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

const TREE_MIN = 280;
const TREE_MAX = 900;
const TREE_WIDTH_KEY = 'ardudeck.inspector.treeW';

const clampTreeWidth = (w: number) => Math.max(TREE_MIN, Math.min(TREE_MAX, w));

function loadTreeWidth(): number {
  try {
    const v = localStorage.getItem(TREE_WIDTH_KEY);
    return v ? clampTreeWidth(Number(v)) : 520;
  } catch {
    return 520;
  }
}

function TreeResizeHandle({ onDrag }: { onDrag: (dx: number) => void }): JSX.Element {
  const { t } = useTranslation();
  const last = useRef(0);
  const down = (e: React.PointerEvent) => {
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
      className="w-1.5 shrink-0 touch-none cursor-col-resize border-r border-subtle bg-transparent transition-colors hover:bg-blue-500/40 active:bg-blue-500/60"
      title={t('inspector:mavlinkInspector.resizeTitle')}
    />
  );
}

/**
 * One graph per message: the first field plotted opens the panel, the rest
 * join it as extra traces on the same axes. Clicking the field that opened it
 * closes the panel.
 */
function FieldRow({
  stats,
  fieldName,
  value,
}: {
  stats: MessageStats;
  fieldName: string;
  value: unknown;
}): JSX.Element {
  const { t } = useTranslation();
  const display = formatFieldValue(value);
  const isGraphable = typeof value === 'number' || typeof value === 'bigint';

  const graphs = useInspectorStore((s) => s.graphs);
  const overlays = useInspectorStore((s) => s.overlays);

  const owner = graphs.find(
    (g) => g.sysid === stats.sysid && g.compid === stats.compid && g.msgid === stats.msgid,
  );
  const panelId = owner ? panelIdForGraph(owner) : null;
  const overlayFields = panelId ? overlays[panelId] ?? [] : [];
  const isPrimary = owner?.fieldName === fieldName;
  const overlayIndex = overlayFields.indexOf(fieldName);
  const plotted = isPrimary || overlayIndex >= 0;
  const colour = isPrimary ? seriesColor(0) : overlayIndex >= 0 ? seriesColor(overlayIndex + 1) : null;

  const handleGraph = () => {
    const store = useInspectorStore.getState();
    if (!owner || !panelId) {
      store.addGraph({
        sysid: stats.sysid,
        compid: stats.compid,
        msgid: stats.msgid,
        messageName: stats.name,
        fieldName,
      });
      return;
    }
    if (isPrimary) {
      store.removeGraph(panelId);
      return;
    }
    store.toggleOverlay(panelId, fieldName);
  };

  return (
    <tr className="group">
      <td className="py-0.5 pr-3 text-content-secondary w-1/3 truncate">{fieldName}</td>
      <td className="py-0.5 pr-3 text-content tabular-nums break-all">{display}</td>
      <td className="py-0.5 w-8 text-right">
        {isGraphable && (
          <button
            onClick={handleGraph}
            className={`p-1 rounded transition-opacity hover:bg-blue-500/10 ${
              plotted ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 text-content-tertiary hover:text-blue-400'
            }`}
            style={colour ? { color: colour } : undefined}
            title={
              plotted
                ? isPrimary
                  ? t('inspector:mavlinkInspector.closeGraph', { name: stats.name })
                  : t('inspector:mavlinkInspector.removeTrace')
                : owner
                  ? t('inspector:mavlinkInspector.plotOn', { name: stats.name })
                  : t('inspector:mavlinkInspector.graphField')
            }
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 12l3-3 3 3 4-4M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </button>
        )}
      </td>
    </tr>
  );
}

function EmptyState({
  isConnected,
  hasFilter,
}: {
  isConnected: boolean;
  hasFilter: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  if (hasFilter) {
    return (
      <div className="flex items-center justify-center h-full text-center p-8">
        <div className="text-content-secondary text-sm">{t('inspector:mavlinkInspector.noMatch')}</div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center h-full text-center p-8">
      <div className="max-w-md">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="text-sm font-medium text-content mb-1">
          {isConnected ? t('inspector:mavlinkInspector.waiting') : t('inspector:mavlinkInspector.notConnected')}
        </div>
        <div className="text-xs text-content-secondary">
          {isConnected
            ? t('inspector:mavlinkInspector.waitingHint')
            : t('inspector:mavlinkInspector.connectHint')}
        </div>
      </div>
    </div>
  );
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(4).replace(/\.?0+$/, '');
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Uint8Array) {
    return `[${value.length} bytes]`;
  }
  if (Array.isArray(value)) {
    if (value.length > 8) return `[${value.length}] ${value.slice(0, 8).join(', ')}…`;
    return `[${value.join(', ')}]`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatBps(bps: number): string {
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} kB/s`;
  return `${(bps / 1024 / 1024).toFixed(2)} MB/s`;
}
