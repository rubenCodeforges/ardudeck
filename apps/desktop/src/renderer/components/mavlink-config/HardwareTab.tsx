import { useEffect, useMemo, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Battery, Boxes, Box, Cpu, ExternalLink, Fan, HelpCircle, Lightbulb, Navigation, Network, Radio, Satellite, Wifi,
} from 'lucide-react';
import type { DetectedHardware, HardwareCategory } from '@ardudeck/module-sdk';
import { useConnectionStore } from '../../stores/connection-store';
import { useParameterStore } from '../../stores/parameter-store';
import { useDroneCanStore } from '../../stores/dronecan-store';
import { droneCanPorts } from '../../lib/dronecan-ports';
import { detectHardware, hardwareCatalogRegistry } from '../../modules/module-extension-registries';
import { ModuleConfigCards } from '../../modules/ModuleConfigCards';

const CATEGORY_STYLE: Record<HardwareCategory | 'unknown', { Icon: ComponentType<{ className?: string }>; box: string; icon: string }> = {
  autopilot: { Icon: Cpu, box: 'bg-sky-500/20', icon: 'text-sky-400' },
  gnss: { Icon: Satellite, box: 'bg-emerald-500/20', icon: 'text-emerald-400' },
  compass: { Icon: Navigation, box: 'bg-cyan-500/20', icon: 'text-cyan-400' },
  lighting: { Icon: Lightbulb, box: 'bg-amber-500/20', icon: 'text-amber-400' },
  esc: { Icon: Fan, box: 'bg-rose-500/20', icon: 'text-rose-400' },
  receiver: { Icon: Radio, box: 'bg-teal-500/20', icon: 'text-teal-400' },
  datalink: { Icon: Wifi, box: 'bg-indigo-500/20', icon: 'text-indigo-400' },
  power: { Icon: Battery, box: 'bg-orange-500/20', icon: 'text-orange-400' },
  other: { Icon: Box, box: 'bg-slate-500/20', icon: 'text-slate-400' },
  unknown: { Icon: Network, box: 'bg-indigo-500/20', icon: 'text-indigo-400' },
};

export default function HardwareTab() {
  const { t } = useTranslation();
  const connection = useConnectionStore((s) => s.connectionState);
  const parameters = useParameterStore((s) => s.parameters);
  const nodes = useDroneCanStore((s) => s.state?.nodes);
  const init = useDroneCanStore((s) => s.init);
  const acquire = useDroneCanStore((s) => s.acquire);
  const catalogs = hardwareCatalogRegistry.useEntries();
  const port = useMemo(() => droneCanPorts(parameters)[0], [parameters]);

  useEffect(() => init(), [init]);
  useEffect(() => (port ? acquire(port.port) : undefined), [port, acquire]);

  const parts = useMemo(
    () => detectHardware(
      catalogs,
      connection.isConnected ? { name: connection.boardId, boardVersion: connection.boardVersion } : null,
      nodes ?? [],
    ).filter((d) => !(d.source === 'dronecan' && d.nodeId === port?.fcNodeId)),
    [catalogs, connection.isConnected, connection.boardId, connection.boardVersion, nodes, port?.fcNodeId],
  );

  return (
    <div className="p-6 space-y-6">
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center">
            <Boxes className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h3 className="font-medium text-content">{t('mavlink-config:hardwareTab.title')}</h3>
            <p className="text-xs text-content-secondary">{t('mavlink-config:hardwareTab.subtitle')}</p>
          </div>
        </div>

        {parts.length === 0 ? (
          <div className="p-8 text-center text-sm text-content-secondary">{t('mavlink-config:hardwareTab.notConnected')}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {parts.map((part) => (
              <PartCard
                key={`${part.source}:${part.nodeId ?? 'fc'}`}
                part={part}
                fcLabel={connection.isSitl ? t('mavlink-config:hardwareTab.sitl') : connection.autopilot}
                vehicleType={connection.vehicleType}
              />
            ))}
          </div>
        )}

        {connection.isConnected && (!port || catalogs.length === 0) && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-sky-500/5 border border-sky-500/20 mt-4">
            <HelpCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <p className="text-xs text-content leading-relaxed">
              {!port ? t('mavlink-config:hardwareTab.noDroneCan') : t('mavlink-config:hardwareTab.noCatalog')}
            </p>
          </div>
        )}
      </div>

      <ModuleConfigCards slot="hardware" />
    </div>
  );
}

function PartCard({ part, fcLabel, vehicleType }: { part: DetectedHardware; fcLabel?: string; vehicleType?: string }) {
  const { t } = useTranslation();
  const p = part.product;
  const isFc = part.source === 'flight-controller';
  const style = CATEGORY_STYLE[p?.category ?? (isFc ? 'autopilot' : 'unknown')];
  const title = p?.name ?? (part.reportedName || (isFc ? fcLabel : undefined) || t('mavlink-config:hardwareTab.unknownPart'));

  const rows: Array<[string, string]> = [];
  if (isFc) {
    rows.push([t('mavlink-config:hardwareTab.role'), t('mavlink-config:hardwareTab.flightController')]);
    if (vehicleType) rows.push([t('mavlink-config:hardwareTab.vehicle'), vehicleType]);
    if (part.boardId !== undefined) rows.push([t('mavlink-config:hardwareTab.boardId'), String(part.boardId)]);
  } else {
    rows.push([t('mavlink-config:hardwareTab.role'), t('mavlink-config:hardwareTab.canNode', { id: part.nodeId })]);
    if (p && part.reportedName) rows.push([t('mavlink-config:hardwareTab.reportedAs'), part.reportedName]);
  }
  if (p?.kit) rows.push([t('mavlink-config:hardwareTab.kit'), p.kit]);

  return (
    <div className="h-full rounded-xl border border-subtle bg-surface-raised p-4 flex flex-col">
      <div className="flex items-start gap-3">
        {p?.imageUrl ? (
          <img src={p.imageUrl} alt="" className="w-10 h-10 rounded-lg object-contain bg-white shrink-0" />
        ) : (
          <div className={`w-10 h-10 rounded-lg ${style.box} flex items-center justify-center shrink-0`}>
            <style.Icon className={`w-5 h-5 ${style.icon}`} />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-content truncate">{title}</div>
          <div className="text-xs text-content-secondary truncate">{p ? p.vendor : t('mavlink-config:hardwareTab.notIdentified')}</div>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs flex-1 content-start">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-content-secondary">{k}</dt>
            <dd className="text-content truncate">{v}</dd>
          </div>
        ))}
      </dl>
      {p?.docsUrl && (
        <a
          href={p.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 self-start text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" /> {t('mavlink-config:hardwareTab.docs')}
        </a>
      )}
    </div>
  );
}
