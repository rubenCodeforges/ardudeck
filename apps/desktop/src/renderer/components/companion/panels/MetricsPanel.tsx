import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer } from '../../panels/panel-utils';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  const size = sizes[idx];
  if (size === undefined) return `${bytes} B`;
  return `${(bytes / Math.pow(k, idx)).toFixed(1)} ${size}`;
}

function GaugeRing({ value, label, detail, color }: { value: number; label: string; detail?: string; color: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  const colorClasses: Record<string, { stroke: string; text: string; glow: string }> = {
    green: { stroke: 'stroke-emerald-400', text: 'text-emerald-400', glow: 'drop-shadow-[0_0_4px_rgba(16,185,129,0.4)]' },
    blue: { stroke: 'stroke-blue-400', text: 'text-blue-400', glow: 'drop-shadow-[0_0_4px_rgba(59,130,246,0.4)]' },
    purple: { stroke: 'stroke-purple-400', text: 'text-purple-400', glow: 'drop-shadow-[0_0_4px_rgba(168,85,247,0.4)]' },
    amber: { stroke: 'stroke-amber-400', text: 'text-amber-400', glow: 'drop-shadow-[0_0_4px_rgba(245,158,11,0.4)]' },
    red: { stroke: 'stroke-red-400', text: 'text-red-400', glow: 'drop-shadow-[0_0_4px_rgba(239,68,68,0.4)]' },
  };

  // Dynamic color based on value thresholds
  const dynamicColor = clamped > 90 ? 'red' : clamped > 70 ? 'amber' : color;
  const c = colorClasses[dynamicColor] ?? colorClasses['green']!;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="90" height="90" className={c.glow}>
        {/* Background ring */}
        <circle
          cx="45" cy="45" r={radius}
          fill="none" stroke="#1e293b" strokeWidth="6"
        />
        {/* Value ring */}
        <circle
          cx="45" cy="45" r={radius}
          fill="none"
          className={c.stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 45 45)"
          style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
        />
        {/* Center text */}
        <text x="45" y="42" textAnchor="middle" className={`${c.text} text-lg font-bold`} fill="currentColor" fontSize="18" fontWeight="bold" fontFamily="monospace">
          {Math.round(clamped)}
        </text>
        <text x="45" y="56" textAnchor="middle" fill="#6b7280" fontSize="10">
          %
        </text>
      </svg>
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      {detail && <span className="text-[10px] text-gray-600">{detail}</span>}
    </div>
  );
}

function TempDisplay({ temp }: { temp: number }) {
  const color = temp > 80 ? 'text-red-400' : temp > 60 ? 'text-amber-400' : 'text-emerald-400';
  const bgColor = temp > 80 ? 'bg-red-500/10' : temp > 60 ? 'bg-amber-500/10' : 'bg-emerald-500/10';

  if (temp < 0) {
    return (
      <div className="flex items-center justify-center p-3 bg-gray-800/50 rounded-lg">
        <span className="text-xs text-gray-600">Temp sensor unavailable</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between p-3 ${bgColor} rounded-lg`}>
      <span className="text-xs text-gray-400">CPU Temperature</span>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-mono font-bold ${color}`}>{temp.toFixed(0)}</span>
        <span className="text-xs text-gray-500">°C</span>
      </div>
    </div>
  );
}

export function MetricsPanel() {
  const metrics = useCompanionStore((s) => s.metrics);

  if (!metrics) {
    return (
      <PanelContainer className="flex items-center justify-center">
        <div className="text-center text-gray-600 text-xs">
          <div className="text-gray-500 mb-1">No metrics data</div>
          <div>Waiting for agent connection...</div>
        </div>
      </PanelContainer>
    );
  }

  return (
    <PanelContainer>
      <div className="space-y-4">
        {/* Gauge rings row */}
        <div className="flex justify-around items-start">
          <GaugeRing
            value={metrics.cpu}
            label="CPU"
            color="blue"
          />
          <GaugeRing
            value={metrics.ram}
            label="RAM"
            detail={`${formatBytes(metrics.ramUsed)} / ${formatBytes(metrics.ramTotal)}`}
            color="purple"
          />
          <GaugeRing
            value={metrics.disk}
            label="Disk"
            detail={`${formatBytes(metrics.diskUsed)} / ${formatBytes(metrics.diskTotal)}`}
            color="green"
          />
        </div>

        {/* Temperature */}
        <TempDisplay temp={metrics.temp} />
      </div>
    </PanelContainer>
  );
}
