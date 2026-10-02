import type { ReactNode } from 'react';
import { Lock, Undo2 } from 'lucide-react';
import { DraggableSlider } from '../../ui/DraggableSlider';
import { useTranslation } from 'react-i18next';

export function Section({ icon, title, note, action, children }: {
  icon: ReactNode;
  title: string;
  note?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-subtle px-3 py-3">
      <header className="mb-2.5">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-content-secondary">
          {icon}
          <span className="flex-1">{title}</span>
          {action}
        </div>
        {note && <p className="mt-1 text-[10px] leading-snug text-content-tertiary">{note}</p>}
      </header>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

export function FieldRow({ label, value, tag, modified, onRevert, hint, locked, children }: {
  label: string;
  value?: ReactNode;
  tag?: ReactNode;
  modified?: boolean;
  onRevert?: () => void;
  hint?: ReactNode;
  /** Why the field cannot change on this unit; replaces the hint. */
  locked?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className={locked ? 'opacity-60' : ''}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[11px] text-content">{label}</span>
        {tag}
        <span className="flex-1" />
        {value !== undefined && (
          <span className={`text-[11px] tabular-nums ${modified ? 'text-blue-300' : 'text-content-secondary'}`}>{value}</span>
        )}
        {modified && onRevert && (
          <button
            onClick={onRevert}
            className="flex h-4 w-4 items-center justify-center rounded text-content-tertiary hover:bg-surface-raised hover:text-content"
            data-tip={t('camera:settings.revertTip')}
          >
            <Undo2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {/* The slider is a pointer-driven div, which a disabled fieldset does not stop. */}
      <fieldset disabled={!!locked} className={`min-w-0 ${locked ? 'pointer-events-none' : ''}`}>{children}</fieldset>
      {locked ? (
        <p className="mt-1.5 flex items-start gap-1 text-[10px] leading-snug text-content-tertiary">
          <Lock className="mt-px h-2.5 w-2.5 shrink-0" />
          {locked}
        </p>
      ) : hint ? (
        <div className="mt-1.5 text-[10px] leading-snug text-content-tertiary">{hint}</div>
      ) : null}
    </div>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange, fill = true }: {
  options: readonly { value: T; label: ReactNode; tip?: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
  fill?: boolean;
}) {
  return (
    <div className={`flex overflow-hidden rounded-md border border-subtle ${fill ? '' : 'w-fit'}`}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          data-tip={o.tip}
          className={`${fill ? 'flex-1' : ''} px-2 py-1 text-[11px] tabular-nums transition-colors disabled:cursor-not-allowed ${
            value === o.value ? 'bg-surface-raised text-content' : 'text-content-secondary hover:bg-surface-raised'
          }`}
        >{o.label}</button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed ${
        checked ? 'bg-emerald-500' : 'border border-subtle bg-surface-inset'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full border border-strong bg-white shadow-sm transition-all ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

/** A slider over a fixed list of allowed values, so it can only land on one of them. */
export function StepSlider<T>({ steps, value, onChange, color, ends }: {
  steps: readonly T[];
  value: T | undefined;
  onChange: (v: T) => void;
  color?: string;
  ends?: [ReactNode, ReactNode];
}) {
  const index = Math.max(0, steps.findIndex((s) => s === value));
  return (
    <div>
      <DraggableSlider
        value={index}
        onChange={(i) => onChange(steps[Math.round(i)]!)}
        min={0}
        max={steps.length - 1}
        step={1}
        showControls={false}
        height={6}
        color={color}
      />
      {ends && (
        <div className="mt-1 flex justify-between text-[9px] tabular-nums text-content-tertiary">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  );
}

export function Tag({ tone, children }: { tone: 'live' | 'caution'; children: ReactNode }) {
  const cls = tone === 'live' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400';
  return <span className={`rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide ${cls}`}>{children}</span>;
}
