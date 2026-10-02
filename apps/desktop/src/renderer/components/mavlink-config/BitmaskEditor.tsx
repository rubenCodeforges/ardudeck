/**
 * BitmaskEditor
 *
 * Popover editor for bitmask parameters.
 * Shows checkboxes for each bit with labels from parameter metadata.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface BitmaskEditorProps {
  paramId: string;
  value: number;
  bitmask: Record<number, string>;
  onSave: (value: number) => void;
  onCancel: () => void;
}

const BitmaskEditor: React.FC<BitmaskEditorProps> = ({ paramId, value, bitmask, onSave, onCancel }) => {
  const { t } = useTranslation();
  const [currentValue, setCurrentValue] = useState(Math.floor(value));
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sort bit entries by bit index
  const bitEntries = Object.entries(bitmask)
    .map(([bit, label]) => ({ bit: parseInt(bit, 10), label }))
    .sort((a, b) => a.bit - b.bit);

  const isBitSet = useCallback((bitIndex: number) => {
    return (currentValue & (1 << bitIndex)) !== 0;
  }, [currentValue]);

  const toggleBit = useCallback((bitIndex: number) => {
    setCurrentValue(prev => prev ^ (1 << bitIndex));
  }, []);

  const handleSelectAll = useCallback(() => {
    let allBits = 0;
    for (const entry of bitEntries) {
      allBits |= (1 << entry.bit);
    }
    setCurrentValue(allBits);
  }, [bitEntries]);

  const handleSelectNone = useCallback(() => {
    setCurrentValue(0);
  }, []);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onCancel]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const hasChanges = currentValue !== Math.floor(value);

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 top-full mt-1 z-50 bg-surface-solid border border-subtle rounded-lg shadow-2xl min-w-[320px] max-w-[400px]"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-subtle">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-content">{paramId}</span>
          <span className="text-xs font-mono text-content-secondary">= {currentValue}</span>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={handleSelectAll}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            {t('common:selectAll')}
          </button>
          <button
            onClick={handleSelectNone}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            {t('mavlink-config:bitmaskEditor.selectNone')}
          </button>
        </div>
      </div>

      {/* Bit checkboxes */}
      <div className="px-4 py-2 max-h-[300px] overflow-y-auto">
        {bitEntries.map(({ bit, label }) => (
          <label
            key={bit}
            className="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-surface-raised rounded px-1 -mx-1 transition-colors"
          >
            <input
              type="checkbox"
              checked={isBitSet(bit)}
              onChange={() => toggleBit(bit)}
              className="w-4 h-4 rounded border bg-surface-raised text-blue-500 focus:ring-blue-500/30 focus:ring-offset-0 cursor-pointer"
            />
            <span className="text-xs text-content-secondary font-mono w-5 shrink-0">{bit}</span>
            <span className="text-sm text-content">{label}</span>
          </label>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-subtle flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-content-secondary hover:text-content transition-colors"
        >
          {t('common:cancel')}
        </button>
        <button
          onClick={() => onSave(currentValue)}
          disabled={!hasChanges}
          className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-surface-raised text-blue-400 disabled:text-white-tertiary rounded-lg text-sm font-medium transition-colors"
        >
          {t('common:apply')}
        </button>
      </div>
    </div>
  );
};

export default BitmaskEditor;
