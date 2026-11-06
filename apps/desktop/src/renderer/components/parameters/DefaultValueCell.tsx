import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatParamValue } from '../../../shared/parameter-types';

/** The firmware default next to a parameter, with a one-click reset when the value differs. */
export function DefaultValueCell({ value, defaultValue, readOnly, onReset }: {
  value: number;
  defaultValue: number | undefined;
  readOnly?: boolean;
  onReset: (value: number) => void;
}): JSX.Element {
  const { t } = useTranslation();
  if (defaultValue === undefined) return <span className="text-xs text-content-tertiary" />;
  const differs = Math.fround(value) !== Math.fround(defaultValue);
  const shown = formatParamValue(defaultValue);
  return (
    <div className="flex items-center gap-1 min-w-0">
      <span className="font-mono text-xs text-content-secondary tabular-nums truncate">{shown}</span>
      {differs && !readOnly && (
        <button
          type="button"
          onClick={() => onReset(defaultValue)}
          className="shrink-0 p-0.5 rounded text-content-tertiary hover:text-blue-400 hover:bg-surface-input transition-colors"
          data-tip={t('parameters:defaultColumn.reset', { value: shown })}
          aria-label={t('parameters:defaultColumn.reset', { value: shown })}
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
