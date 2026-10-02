import { useTranslation } from 'react-i18next';
import { Battery, BatteryLow, BatteryWarning, Zap } from 'lucide-react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { PanelContainer, formatNumber } from './panel-utils';

interface LevelTone {
  text: string;
  fill: string;
  border: string;
  accent: string;
}

function toneForLevel(level: number, unknown: boolean): LevelTone {
  if (unknown) {
    return {
      text: 'text-content-secondary',
      fill: 'rgb(107 114 128)',
      border: 'rgb(107 114 128 / 0.35)',
      accent: 'rgb(107 114 128 / 0.15)',
    };
  }
  if (level > 30) {
    return {
      text: 'text-emerald-400',
      fill: 'rgb(16 185 129)',
      border: 'rgb(16 185 129 / 0.35)',
      accent: 'rgb(16 185 129 / 0.12)',
    };
  }
  if (level > 15) {
    return {
      text: 'text-amber-400',
      fill: 'rgb(245 158 11)',
      border: 'rgb(245 158 11 / 0.4)',
      accent: 'rgb(245 158 11 / 0.14)',
    };
  }
  return {
    text: 'text-red-400',
    fill: 'rgb(239 68 68)',
    border: 'rgb(239 68 68 / 0.45)',
    accent: 'rgb(239 68 68 / 0.16)',
  };
}

function LevelIcon({ level, unknown }: { level: number; unknown: boolean }) {
  const Icon = unknown || level > 30 ? Battery : level > 15 ? BatteryLow : BatteryWarning;
  return <Icon className="w-4 h-4" />;
}

/**
 * One row per battery monitor (#126). Clicking a row makes that monitor the
 * primary battery every other display follows.
 */
function BatteryInstanceRow({ inst, selected, stale, onSelect }: {
  inst: { id: number; voltage: number; current: number; remaining: number; mahDrawn?: number };
  selected: boolean;
  stale: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const unknown = inst.remaining < 0;
  const level = unknown ? 0 : Math.max(0, Math.min(100, inst.remaining));
  const tone = toneForLevel(level, unknown || stale);

  return (
    <button
      onClick={onSelect}
      data-tip={selected ? t('panels:batteryPanel.primaryTip') : t('panels:batteryPanel.selectTip')}
      className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors border ${
        selected
          ? 'border-[color:var(--border-strong,rgba(148,163,184,0.4))]'
          : 'border-transparent hover:bg-[var(--bg-inset)]'
      } ${stale ? 'opacity-50' : ''}`}
      style={selected ? { background: tone.accent } : undefined}
    >
      <span className={`font-medium ${selected ? tone.text : 'text-content-secondary'}`}>
        {t('panels:batteryPanel.instanceShort', { n: inst.id + 1 })}
      </span>
      <span className="font-mono text-content">{formatNumber(inst.voltage, 1)}V</span>
      <span className={`font-mono ${tone.text}`}>{unknown ? '-' : `${level}%`}</span>
      <span className="font-mono text-content-secondary ml-auto">
        {formatNumber(Math.abs(inst.current), 1)}A
      </span>
      {inst.mahDrawn !== undefined && (
        <span className="font-mono text-content-tertiary">{Math.round(inst.mahDrawn)}mAh</span>
      )}
    </button>
  );
}

export function BatteryPanel() {
  const { t } = useTranslation();
  const battery = useTelemetryStore((s) => s.battery);
  const batteries = useTelemetryStore((s) => s.batteries);
  const primaryBatteryId = useTelemetryStore((s) => s.primaryBatteryId);
  const setPrimaryBattery = useTelemetryStore((s) => s.setPrimaryBattery);
  const unknown = battery.remaining < 0;
  const level = unknown ? 0 : Math.max(0, Math.min(100, battery.remaining));
  const tone = toneForLevel(level, unknown);

  const instances = Object.values(batteries).sort((a, b) => a.id - b.id);
  const showInstances = instances.length > 1;
  // With no explicit selection the primary slot is SYS_STATUS = battery 1 (id 0).
  const effectivePrimaryId = primaryBatteryId ?? 0;
  const now = Date.now();

  return (
    <PanelContainer className="flex flex-col gap-3 justify-center">
      {/* Voltage (primary) + remaining (secondary) */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold font-mono ${tone.text} leading-none`}>
            {formatNumber(battery.voltage, 1)}
          </span>
          <span className="text-content-secondary text-sm font-medium">V</span>
        </div>
        <div className={`inline-flex items-center gap-1.5 ${tone.text}`}>
          <LevelIcon level={level} unknown={unknown} />
          <span className="font-mono text-sm font-semibold">
            {unknown ? '-' : `${level}%`}
          </span>
        </div>
      </div>

      {/* Level bar */}
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--bg-inset)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: unknown ? '0%' : `${level}%`,
            background: tone.fill,
            boxShadow: unknown ? 'none' : `0 0 8px ${tone.border}`,
          }}
        />
      </div>

      {/* Current draw (tertiary) */}
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 text-content-secondary">
          <Zap className="w-3 h-3" />
          {t('common:current')}
        </span>
        <span className="font-mono text-content">
          {formatNumber(Math.abs(battery.current), 1)}
          <span className="text-content-tertiary text-[10px] ml-0.5">A</span>
        </span>
      </div>

      {/* All battery monitors (#126), only when the vehicle has more than one */}
      {showInstances && (
        <div className="flex flex-col gap-1 pt-1 border-t border-subtle">
          {instances.map((inst) => (
            <BatteryInstanceRow
              key={inst.id}
              inst={inst}
              selected={inst.id === effectivePrimaryId}
              stale={now - inst.updatedAt > 5000}
              onSelect={() => setPrimaryBattery(inst.id)}
            />
          ))}
        </div>
      )}
    </PanelContainer>
  );
}
