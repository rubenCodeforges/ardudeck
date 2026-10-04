import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Network, RefreshCw, Save, Power, Upload, Loader2, Cpu, AlertTriangle, Play, Square, SlidersHorizontal, Activity, CheckCircle2, Unplug, HelpCircle, RotateCcw, Search, BookOpen } from 'lucide-react';
import type { DroneCanNodeProfile } from '@ardudeck/module-sdk';
import { useParameterStore } from '../../stores/parameter-store';
import { useDroneCanStore } from '../../stores/dronecan-store';
import { DRONECAN_HEALTH, DRONECAN_MODE, type DroneCanNode, type DroneCanParam, type DroneCanParamValue } from '../../../shared/dronecan-types';
import { droneCanPorts } from '../../lib/dronecan-ports';
import { sampleCanBusHealth } from '../../lib/can-bus-health';
import type { CanBusDiagnosis, CanBusHealth } from '../../../shared/can-bus-stats';
import { requestDroneCanWrite } from '../../lib/dronecan-review';
import { hardwareCatalogRegistry, matchProduct, nodeProfileRegistry, profilesForNode } from '../../modules/module-extension-registries';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { nodeParamDocs, usePeriphMetadata, type NodeParamDoc } from '../../lib/periph-param-metadata';

const HEALTH_STYLE: Record<string, { dot: string; text: string }> = {
  ok: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  error: { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  critical: { dot: 'bg-red-600', text: 'text-red-700 dark:text-red-400' },
};

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function sameValue(a: DroneCanParamValue, b: DroneCanParamValue): boolean {
  return a.type === b.type && ('value' in a ? a.value : null) === ('value' in b ? b.value : null);
}

function displayValue(v: DroneCanParamValue): string {
  if (v.type === 'empty') return '';
  if (v.type === 'boolean') return v.value ? '1' : '0';
  return String(v.value);
}

export default function DroneCanTab() {
  const { t } = useTranslation();
  const parameters = useParameterStore((s) => s.parameters);
  const { state, selectedNodeId, paramsByNode, init, start, stop, acquire, selectNode, startError } = useDroneCanStore();
  const catalogs = hardwareCatalogRegistry.useEntries();
  const profileEntries = nodeProfileRegistry.useEntries();
  const ports = useMemo(() => droneCanPorts(parameters), [parameters]);

  const [bus, setBus] = useState<number | null>(null);
  const activeBus = bus ?? ports[0]?.port ?? null;
  const fcNodeId = ports.find((p) => p.port === activeBus)?.fcNodeId;

  useEffect(() => init(), [init]);

  useEffect(() => {
    if (activeBus === null) return;
    return acquire(activeBus);
  }, [activeBus, acquire]);

  const nodes = state?.bus === activeBus ? state.nodes : [];
  const status = state?.bus === activeBus ? state.status : 'idle';
  const selected = nodes.find((n) => n.nodeId === selectedNodeId) ?? null;
  const selectedProfiles = useMemo(() => profilesForNode(profileEntries, selected?.name), [profileEntries, selected?.name]);
  const selectedProduct = selected?.name ? matchProduct(catalogs, { dronecanNodeName: selected.name }) : undefined;

  if (ports.length === 0) {
    return (
      <div className="p-6">
        <div className="bg-surface rounded-xl border border-subtle p-8 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center mb-3">
            <Network className="w-6 h-6 text-indigo-400" />
          </div>
          <h3 className="font-medium text-content">{t('dronecan:noBus.title')}</h3>
          <p className="text-xs text-content-secondary mt-1 max-w-md">{t('dronecan:noBus.body')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <Network className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="mr-auto">
            <h3 className="font-medium text-content">{t('dronecan:title')}</h3>
            <p className="text-xs text-content-secondary">{t('dronecan:subtitle')}</p>
          </div>
          {ports.length > 1 && (
            <div className="flex gap-1">
              {ports.map((p) => (
                <button
                  key={p.port}
                  onClick={() => setBus(p.port)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${p.port === activeBus ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' : 'border-subtle text-content-secondary hover:text-content'}`}
                >
                  {t('dronecan:port', { port: p.port })}
                </button>
              ))}
            </div>
          )}
          <StatusBadge status={status} />
          <span className="text-xs text-content-secondary tabular-nums" data-tip={t('dronecan:framesTip')}>
            {t('dronecan:frames', { count: state?.framesReceived ?? 0 })}
          </span>
          {status === 'idle' ? (
            <button onClick={() => activeBus !== null && void start(activeBus)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium">
              <Play className="w-3.5 h-3.5" /> {t('dronecan:start')}
            </button>
          ) : (
            <button onClick={() => void stop()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-subtle text-content-secondary hover:text-content text-xs font-medium">
              <Square className="w-3.5 h-3.5" /> {t('dronecan:stop')}
            </button>
          )}
        </div>

        {(startError || status === 'unsupported' || status === 'failed' || status === 'noResponse') && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/20 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-content leading-relaxed">
              {startError ? t('dronecan:error.start', { error: startError }) : t(`dronecan:error.${status}`)}
            </p>
          </div>
        )}

        {nodes.length === 0 ? (
          <div className="p-8 flex items-center justify-center gap-2 text-sm text-content-secondary">
            {status === 'active' || status === 'starting' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {t('dronecan:waitingForNodes')}</>
            ) : (
              t('dronecan:stoppedHint')
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {nodes.map((node) => (
              <NodeCard
                key={node.nodeId}
                node={node}
                product={node.name ? matchProduct(catalogs, { dronecanNodeName: node.name }) : undefined}
                isFc={node.nodeId === fcNodeId}
                selected={node.nodeId === selectedNodeId}
                onSelect={() => selectNode(node.nodeId === selectedNodeId ? null : node.nodeId, node.nodeId !== fcNodeId)}
              />
            ))}
          </div>
        )}
      </div>

      {activeBus !== null && <BusHealthCard port={activeBus} />}

      {selected && (selected.nodeId === fcNodeId ? (
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-sky-500/5 border border-sky-500/20">
          <Cpu className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <p className="text-xs text-content leading-relaxed">{t('dronecan:fcHint')}</p>
        </div>
      ) : (
        <>
          {selectedProfiles.map(({ slug, id, value }) => value.panel && (
            <ErrorBoundary key={`${slug}:${id}`} label={`${slug} ${id}`}>
              <value.panel nodeId={selected.nodeId} />
            </ErrorBoundary>
          ))}
          <NodeParams
            node={selected}
            entry={paramsByNode[selected.nodeId]}
            title={selectedProduct ? `${selectedProduct.vendor} ${selectedProduct.name}` : undefined}
            profiles={selectedProfiles.map((e) => e.value)}
          />
        </>
      ))}
    </div>
  );
}


const DIAGNOSIS_STYLE: Record<CanBusDiagnosis, { box: string; icon: string; Icon: typeof Activity }> = {
  healthy: { box: 'bg-emerald-500/20', icon: 'text-emerald-400', Icon: CheckCircle2 },
  idle: { box: 'bg-slate-500/20', icon: 'text-slate-400', Icon: Activity },
  'no-ack': { box: 'bg-red-500/20', icon: 'text-red-400', Icon: Unplug },
  'bus-off': { box: 'bg-red-500/20', icon: 'text-red-400', Icon: AlertTriangle },
  'rx-errors': { box: 'bg-amber-500/20', icon: 'text-amber-400', Icon: AlertTriangle },
};

function BusHealthCard({ port }: { port: number }) {
  const { t } = useTranslation();
  const [health, setHealth] = useState<CanBusHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const h = await sampleCanBusHealth(port - 1);
    setLoading(false);
    setUnavailable(h === null);
    if (h) setHealth(h);
  }, [port]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const style = health ? DIAGNOSIS_STYLE[health.diagnosis] : DIAGNOSIS_STYLE.idle;
  const perSec = (k: string) => (health ? Math.round(((health.deltas[k] ?? 0) * 1000) / Math.max(health.intervalMs, 1)) : 0);
  const tiles: Array<[string, string]> = health ? [
    [t('dronecan:busHealth.bitrate'), health.bitrate ? `${health.bitrate / 1000} kbit/s` : '-'],
    [t('dronecan:busHealth.sent'), `${perSec('tx_success')}/s`],
    [t('dronecan:busHealth.timeouts'), `${perSec('tx_timedout') + perSec('tx_abort')}/s`],
    [t('dronecan:busHealth.received'), `${perSec('rx_received')}/s`],
    [t('dronecan:busHealth.busOff'), String(health.deltas.num_busoff_err ?? 0)],
  ] : [];

  return (
    <div className="bg-surface rounded-xl border border-subtle p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-10 h-10 rounded-lg ${style.box} flex items-center justify-center`}>
          <style.Icon className={`w-5 h-5 ${style.icon}`} />
        </div>
        <div className="mr-auto min-w-0">
          <h3 className="font-medium text-content">
            {health ? t(`dronecan:busHealth.diagnosis.${health.diagnosis}.title`) : t('dronecan:busHealth.title')}
          </h3>
          <p className="text-xs text-content-secondary">{t('dronecan:busHealth.subtitle', { port })}</p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-subtle text-content-secondary hover:text-content text-xs font-medium"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {t('dronecan:reload')}
        </button>
      </div>

      {unavailable && !health ? (
        <div className="p-6 text-center text-sm text-content-secondary">{t('dronecan:busHealth.unavailable')}</div>
      ) : !health ? (
        <div className="p-6 flex items-center justify-center gap-2 text-sm text-content-secondary">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('dronecan:busHealth.measuring')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {tiles.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-subtle bg-surface-raised px-4 py-3">
                <div className="text-[11px] text-content-secondary">{label}</div>
                <div className="mt-0.5 text-sm font-semibold text-content tabular-nums">{value}</div>
              </div>
            ))}
          </div>
          {health.diagnosis !== 'healthy' && (
            <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl mt-4 ${health.diagnosis === 'idle' ? 'bg-sky-500/5 border border-sky-500/20' : 'bg-amber-500/5 border border-amber-500/20'}`}>
              <HelpCircle className={`w-4 h-4 shrink-0 mt-0.5 ${health.diagnosis === 'idle' ? 'text-sky-400' : 'text-amber-500'}`} />
              <p className="text-xs text-content leading-relaxed">{t(`dronecan:busHealth.diagnosis.${health.diagnosis}.hint`)}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const style = status === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : status === 'starting' ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
      : status === 'idle' ? 'bg-surface-inset text-content-secondary'
        : 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  return <span className={`px-2 py-0.5 rounded-full font-medium ${style}`}>{t(`dronecan:status.${status}`)}</span>;
}

function NodeCard({ node, product, isFc, selected, onSelect }: { node: DroneCanNode; product?: { vendor: string; name: string; kit?: string }; isFc: boolean; selected: boolean; onSelect(): void }) {
  const { t } = useTranslation();
  const health = DRONECAN_HEALTH[node.health] ?? 'ok';
  const style = HEALTH_STYLE[health]!;
  const mode = DRONECAN_MODE[node.mode];
  return (
    <button
      onClick={onSelect}
      className={`h-full flex flex-col rounded-xl border bg-surface-raised p-4 text-left transition-colors ${selected ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-subtle hover:border-indigo-500/50'} ${node.online ? '' : 'opacity-50'}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-300 shrink-0">{node.nodeId}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-content truncate">
            {product ? `${product.vendor} ${product.name}` : node.name || t('dronecan:nodeFallbackName', { id: node.nodeId })}
          </div>
          {product && <div className="text-[11px] text-content-secondary font-mono truncate">{node.name}{product.kit ? ` · ${product.kit}` : ''}</div>}
          <div className="flex items-center gap-2 mt-0.5 text-xs">
            <span className={`w-2 h-2 rounded-full ${node.online ? style.dot : 'bg-content-tertiary'}`} />
            <span className={node.online ? style.text : 'text-content-secondary'}>
              {node.online ? t(`dronecan:health.${health}`) : t('dronecan:offline')}
            </span>
            {mode && mode !== 'operational' && <span className="text-content-secondary">· {t(`dronecan:mode.${mode}`)}</span>}
          </div>
        </div>
        {isFc && (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400">
            <Cpu className="w-3 h-3" aria-hidden="true" /> {t('dronecan:thisFc')}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 mt-3 text-xs flex-1 content-start">
        <dt className="text-content-secondary">{t('dronecan:uptime')}</dt>
        <dd className="text-content font-mono">{formatUptime(node.uptimeSec)}</dd>
        {node.softwareVersion && <><dt className="text-content-secondary">{t('dronecan:software')}</dt><dd className="text-content font-mono truncate">{node.softwareVersion}</dd></>}
        {node.hardwareVersion && <><dt className="text-content-secondary">{t('dronecan:hardware')}</dt><dd className="text-content font-mono">{node.hardwareVersion}</dd></>}
        {node.uniqueId && <><dt className="text-content-secondary">{t('dronecan:uniqueId')}</dt><dd className="text-content font-mono truncate" data-tip={node.uniqueId}>{node.uniqueId.slice(0, 12)}…</dd></>}
      </dl>
    </button>
  );
}

function NodeParams({ node, entry, title, profiles }: {
  node: DroneCanNode;
  entry?: { params: DroneCanParam[]; loading: boolean; progress: number; error: string | null };
  title?: string;
  profiles: DroneCanNodeProfile[];
}) {
  const { t } = useTranslation();
  const { loadParams, applyWritten, saveParams, restartNode } = useDroneCanStore();
  const periph = usePeriphMetadata();
  const [edits, setEdits] = useState<Record<string, DroneCanParamValue>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => { setEdits({}); setMessage(null); setConfirmRestart(false); }, [node.nodeId]);

  const params = entry?.params ?? [];
  const docs = useMemo(() => nodeParamDocs(params.map((p) => p.name), periph, profiles), [params, periph, profiles]);
  const documented = params.some((p) => docs[p.name]?.description);
  const q = filter.trim().toLowerCase();
  const visible = q
    ? params.filter((p) => {
        const d = docs[p.name];
        return p.name.toLowerCase().includes(q) || d?.displayName?.toLowerCase().includes(q) || d?.description?.toLowerCase().includes(q);
      })
    : params;
  const changed = params.filter((p) => edits[p.name] && !sameValue(edits[p.name]!, p.value));
  const needsRestart = changed.some((p) => docs[p.name]?.rebootRequired);

  const run = async (key: string, fn: () => Promise<string | null>, okText: string) => {
    setBusy(key);
    setMessage(null);
    const err = await fn();
    setBusy(null);
    setMessage(err ? { ok: false, text: t('dronecan:error.request', { error: t(`dronecan:requestError.${err}`, { defaultValue: err }) }) } : { ok: true, text: okText });
  };

  const writeChanges = async () => {
    setMessage(null);
    const result = await requestDroneCanWrite({
      from: null,
      nodeId: node.nodeId,
      nodeName: node.name,
      changes: changed.map((p) => ({ name: p.name, value: edits[p.name]!, current: p.value })),
    });
    if (!result.accepted) return;
    applyWritten(node.nodeId, result.written);
    setEdits((e) => Object.fromEntries(Object.entries(e).filter(([name]) => result.failed.some((f) => f.name === name))));
    setMessage(result.failed.length > 0
      ? { ok: false, text: t('dronecan:writeFailed', { names: result.failed.map((f) => f.name).join(', ') }) }
      : { ok: true, text: result.saved ? t('dronecan:writtenAndSaved', { count: result.written.length }) : t('dronecan:written', { count: result.written.length }) });
  };

  return (
    <div className="bg-surface rounded-xl border border-subtle p-5">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
          <SlidersHorizontal className="w-5 h-5 text-violet-400" />
        </div>
        <div className="mr-auto min-w-0">
          <h3 className="font-medium text-content truncate">
            {title ?? (node.name || t('dronecan:nodeFallbackName', { id: node.nodeId }))}
          </h3>
          <p className="text-xs text-content-secondary truncate">
            {t('dronecan:paramsSubtitle', { id: node.nodeId, count: params.length })}
            {title && node.name && <span className="font-mono"> · {node.name}</span>}
          </p>
        </div>
        <ActionButton icon={RefreshCw} label={t('dronecan:reload')} busy={entry?.loading} onClick={() => { loadParams(node.nodeId).catch(() => undefined); }} />
        <ActionButton
          icon={Save}
          label={t('dronecan:saveToNode')}
          tip={t('dronecan:saveToNodeTip')}
          busy={busy === 'save'}
          onClick={() => void run('save', () => saveParams(node.nodeId), t('dronecan:saved'))}
        />
        {confirmRestart ? (
          <ActionButton
            icon={Power}
            label={t('dronecan:confirmRestart')}
            busy={busy === 'restart'}
            danger
            onClick={() => { setConfirmRestart(false); void run('restart', () => restartNode(node.nodeId), t('dronecan:restarted')); }}
          />
        ) : (
          <ActionButton icon={Power} label={t('dronecan:restart')} onClick={() => setConfirmRestart(true)} />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-content-secondary absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('dronecan:filterPlaceholder')}
            className="bg-surface-input border border-border rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-content w-64"
          />
        </div>
        {documented && (
          <span className="flex items-center gap-1.5 text-[11px] text-content-secondary">
            <BookOpen className="w-3.5 h-3.5" aria-hidden="true" /> {t('dronecan:docsSource')}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {message && (
            <span className={`text-xs ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</span>
          )}
          {changed.length > 0 && (
            <button onClick={() => setEdits({})} className="text-xs text-content-secondary hover:text-content">{t('dronecan:discard')}</button>
          )}
          <ActionButton
            icon={Upload}
            label={t('dronecan:writeChanges', { count: changed.length })}
            busy={false}
            disabled={changed.length === 0}
            primary
            onClick={() => void writeChanges()}
          />
        </div>
      </div>

      {entry?.error && (
        <div className="text-xs mb-3 text-red-600 dark:text-red-400">
          {t('dronecan:error.request', { error: t(`dronecan:requestError.${entry.error}`, { defaultValue: entry.error }) })}
        </div>
      )}

      {entry?.loading && params.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-content-secondary py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {t('dronecan:loadingParams', { count: entry.progress })}
        </div>
      ) : params.length === 0 && !entry?.loading ? (
        <div className="text-xs text-content-secondary py-6 text-center">{t('dronecan:noParams')}</div>
      ) : (
        <div className="rounded-lg border border-subtle overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left bg-surface-raised text-content-secondary border-b border-subtle">
                <th className="px-3 py-2.5 font-medium">{t('dronecan:col.name')}</th>
                <th className="px-3 py-2.5 font-medium w-56">{t('dronecan:col.value')}</th>
                <th className="px-3 py-2.5 font-medium w-28">{t('dronecan:col.default')}</th>
                <th className="px-3 py-2.5 font-medium w-32">{t('dronecan:col.range')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const doc = docs[p.name] ?? {};
                const edit = edits[p.name];
                const dirty = edit !== undefined && !sameValue(edit, p.value);
                const min = doc.min ?? p.min;
                const max = doc.max ?? p.max;
                return (
                  <tr key={p.name} className={`border-b border-subtle last:border-0 align-top ${dirty ? 'bg-amber-500/10' : 'hover:bg-surface-overlay-subtle'}`}>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-content font-medium">{doc.displayName ?? p.name}</span>
                        {doc.rebootRequired && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 text-[10px] font-medium" data-tip={t('dronecan:rebootTip')}>
                            <RotateCcw className="w-3 h-3" aria-hidden="true" /> {t('dronecan:reboot')}
                          </span>
                        )}
                        {doc.danger && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400 text-[10px] font-medium" data-tip={t('dronecan:dangerTip')}>
                            <AlertTriangle className="w-3 h-3" aria-hidden="true" /> {t('dronecan:danger')}
                          </span>
                        )}
                      </div>
                      {doc.displayName && <div className="font-mono text-[11px] text-content-secondary mt-0.5">{p.name}</div>}
                      {doc.description && (
                        <p className="text-[11px] text-content-secondary leading-relaxed mt-1 line-clamp-2 max-w-2xl" data-tip={doc.description.length > 140 ? doc.description : undefined}>
                          {doc.description}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <ValueEditor param={p} doc={doc} value={edit ?? p.value} onChange={(v) => setEdits((e) => ({ ...e, [p.name]: v }))} />
                    </td>
                    <td className="px-3 py-2.5 text-content-secondary">{describeValue(p.defaultValue, doc)}</td>
                    <td className="px-3 py-2.5 font-mono text-content-secondary">
                      {doc.values ? '' : min !== undefined || max !== undefined ? `${min ?? ''} … ${max ?? ''}${doc.units ? ` ${doc.units}` : ''}` : doc.units ?? ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-content-secondary mt-3">
        {needsRestart ? t('dronecan:applyHintRestart') : t('dronecan:applyHint')}
      </p>
    </div>
  );
}

function describeValue(v: DroneCanParamValue, doc: NodeParamDoc): string {
  if ((v.type === 'integer' || v.type === 'real') && doc.values?.[v.value] !== undefined) return doc.values[v.value]!;
  return displayValue(v);
}

function setBits(value: number, bitmask: Record<number, string>): string[] {
  return Object.entries(bitmask).filter(([bit]) => (value >>> Number(bit)) & 1).map(([, label]) => label);
}

function ValueEditor({ param, doc, value, onChange }: { param: DroneCanParam; doc: NodeParamDoc; value: DroneCanParamValue; onChange(v: DroneCanParamValue): void }) {
  const { t } = useTranslation();
  const cls = 'bg-surface-input border border-border rounded-lg px-2 py-1 text-xs text-content w-full';
  switch (value.type) {
    case 'boolean':
      return (
        <button
          onClick={() => onChange({ type: 'boolean', value: !value.value })}
          className={`w-9 h-5 rounded-full relative transition-colors ${value.value ? 'bg-indigo-600' : 'bg-surface-inset'}`}
          aria-pressed={value.value}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white border border-strong shadow-sm transition-all ${value.value ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      );
    case 'string':
      return <input className={`${cls} font-mono`} value={value.value} maxLength={128} onChange={(e) => onChange({ type: 'string', value: e.target.value })} />;
    case 'integer':
    case 'real': {
      if (doc.values) {
        const listed = doc.values[value.value] !== undefined;
        return (
          <select className={cls} value={value.value} onChange={(e) => onChange({ type: value.type, value: Number(e.target.value) })}>
            {!listed && <option value={value.value}>{t('dronecan:valueNotListed', { value: value.value })}</option>}
            {Object.entries(doc.values).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
        );
      }
      const bits = doc.bitmask && value.type === 'integer' ? setBits(value.value, doc.bitmask) : null;
      return (
        <div>
          <div className="relative">
            <input
              type="number"
              className={`${cls} font-mono ${doc.units ? 'pr-12' : ''}`}
              value={value.value}
              step={value.type === 'integer' ? 1 : 'any'}
              min={doc.min ?? param.min}
              max={doc.max ?? param.max}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) onChange({ type: value.type, value: value.type === 'integer' ? Math.trunc(n) : n });
              }}
            />
            {doc.units && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-content-secondary pointer-events-none">{doc.units}</span>}
          </div>
          {bits && (
            <div className="text-[10px] text-content-secondary mt-1 leading-snug">
              {bits.length > 0 ? bits.join(', ') : t('dronecan:noBitsSet')}
            </div>
          )}
        </div>
      );
    }
    default:
      return <span className="text-content-secondary">-</span>;
  }
}

function ActionButton({ icon: Icon, label, onClick, busy, disabled, primary, danger, tip }: {
  icon: typeof Save; label: string; onClick(): void; busy?: boolean; disabled?: boolean; primary?: boolean; danger?: boolean; tip?: string;
}) {
  const style = danger ? 'bg-red-600 text-white' : primary ? 'bg-indigo-600 text-white disabled:bg-surface-inset disabled:text-content-secondary' : 'border border-subtle text-content-secondary hover:text-content';
  return (
    <button onClick={onClick} disabled={disabled || busy} data-tip={tip} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${style}`}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
      {label}
    </button>
  );
}
