/**
 * InspectorGraphsView — the *graphs-only* face of the inspector, rendered
 * inside a detached Electron BrowserWindow when the user pops out their
 * graph workspace. Just the dockview with FieldGraph tabs — no tree, no
 * header chrome, no message list. The detached window's own chrome bar
 * (DetachedRoot) provides Dock back / pin.
 *
 * State seeding: the parent inspector passes a list of GraphSpec via the
 * URL props; this view recreates a dockview tab for each one on mount.
 * Adding/removing tabs in this window after that is independent of the
 * parent inspector — it has its own dockview instance.
 */

import { useTranslation } from 'react-i18next';
import { useRef } from 'react';
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  themeDark,
  themeLight,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { useResolvedTheme } from '../../hooks/useTheme';
import { FieldGraph } from './FieldGraph';
import { useConnectionStore } from '../../stores/connection-store';
import {
  overlayBufferId,
  panelIdForGraph,
  seedSamples,
  useInspectorStore,
  type GraphSample,
  type GraphSpec,
} from '../../stores/inspector-store';


const components: Record<string, React.FC<IDockviewPanelProps>> = {
  FieldGraph: (props) => <FieldGraph {...(props.params as Record<string, unknown>)} />,
};

function EmptyWatermark(): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="h-full w-full flex items-center justify-center p-6 text-center">
      <div className="max-w-sm">
        <div className="text-sm font-medium text-content mb-1">{t('inspector:inspectorGraphsView.noGraphs')}</div>
        <div className="text-xs text-content-secondary">
          {t('inspector:inspectorGraphsView.noGraphsHint')}
        </div>
      </div>
    </div>
  );
}

export function InspectorGraphsView(propsIn: Record<string, unknown>): JSX.Element {
  const { t } = useTranslation();
  const initialGraphs = (propsIn.initialGraphs as GraphSpec[] | undefined) ?? [];
  const initialSamples = (propsIn.initialSamples as Record<string, GraphSample[]> | undefined) ?? {};
  const initialOverlays = (propsIn.initialOverlays as Record<string, string[]> | undefined) ?? {};
  const apiRef = useRef<DockviewApi | null>(null);
  const resolvedTheme = useResolvedTheme();
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const tick = useInspectorStore((s) => s.tick);
  const paused = useInspectorStore((s) => s.paused);
  const setPaused = useInspectorStore((s) => s.setPaused);
  const resetStats = useInspectorStore((s) => s.reset);

  // Read tick so the header re-renders with packet flow. Graph tabs already
  // subscribe to tick themselves; this just keeps the indicator live.
  void tick;

  const onReady = (event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    // Seed sample buffers FIRST, then add the dockview panels. FieldGraph's
    // first render reads from sampleBuffers, so seeding before the panel
    // mounts means the popped graph appears with full history immediately.
    if (Object.keys(initialOverlays).length > 0) {
      useInspectorStore.setState({ overlays: initialOverlays });
    }
    for (const g of initialGraphs) {
      const id = panelIdForGraph(g);
      const samples = initialSamples[id];
      if (samples && samples.length > 0) {
        seedSamples(id, samples);
      }
      for (const f of initialOverlays[id] ?? []) {
        const oid = overlayBufferId(id, f);
        const ov = initialSamples[oid];
        if (ov && ov.length > 0) seedSamples(oid, ov);
      }
      if (event.api.getPanel(id)) continue;
      event.api.addPanel({
        id,
        component: 'FieldGraph',
        title: `${g.messageName}.${g.fieldName}`,
        params: { ...g },
      });
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-surface-base text-content">
      {/* Minimal header — connection indicator + pause/clear */}
      <div className="h-9 flex-shrink-0 px-4 flex items-center gap-3 border-b border-subtle bg-surface-nav">
        <div className={`w-2 h-2 rounded-full ${
          paused ? 'bg-amber-500' : isConnected ? 'bg-emerald-500' : 'bg-content-tertiary'
        }`} />
        <div className="text-xs text-content-secondary flex-1">
          {paused ? t('inspector:inspectorGraphsView.paused') : isConnected ? t('inspector:inspectorGraphsView.live') : t('inspector:inspectorGraphsView.notConnected')}
        </div>
        <button
          onClick={() => setPaused(!paused)}
          className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
            paused
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 hover:bg-amber-500/25'
              : 'bg-surface border-subtle text-content-secondary hover:bg-surface-raised hover:text-content'
          }`}
          title={paused ? t('inspector:inspectorGraphsView.resumeTitle') : t('inspector:inspectorGraphsView.pauseTitle')}
        >
          {paused ? t('inspector:mavlinkInspector.resume') : t('common:pause')}
        </button>
        <button
          onClick={resetStats}
          className="px-2.5 py-1 text-xs rounded-md bg-surface border border-subtle text-content-secondary hover:bg-surface-raised hover:text-content transition-colors"
          title={t('inspector:inspectorGraphsView.clearTitle')}
        >
          {t('common:clear')}
        </button>
      </div>

      {/* Dockview workspace */}
      <div className="flex-1 min-h-0">
        <DockviewReact
          components={components}
          onReady={onReady}
          theme={resolvedTheme === 'light' ? themeLight : themeDark}
          watermarkComponent={EmptyWatermark}
          className="h-full"
        />
      </div>
    </div>
  );
}
