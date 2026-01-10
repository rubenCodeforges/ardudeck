import type { ReactNode } from 'react';

export function formatNumber(value: number, decimals = 1): string {
  return value.toFixed(decimals);
}

export function PanelContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`h-full bg-gray-900/50 p-3 overflow-auto ${className}`}>
      {children}
    </div>
  );
}

export function StatRow({ label, value, unit, highlight = false }: { label: string; value: string | number; unit?: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-baseline py-0.5">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className={`font-mono text-sm ${highlight ? 'text-white' : 'text-gray-200'}`}>
        {value}
        {unit && <span className="text-gray-600 text-[10px] ml-0.5">{unit}</span>}
      </span>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-2">{children}</h3>
  );
}
