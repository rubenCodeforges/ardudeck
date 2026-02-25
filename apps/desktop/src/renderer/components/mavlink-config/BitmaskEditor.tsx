/**
 * BitmaskEditor
 *
 * Popover editor for bitmask parameters.
 * Shows checkboxes for each bit with labels from parameter metadata.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

interface BitmaskEditorProps {
  paramId: string;
  value: number;
  bitmask: Record<number, string>;
  onSave: (value: number) => void;
  onCancel: () => void;
}

const BitmaskEditor: React.FC<BitmaskEditorProps> = ({ paramId, value, bitmask, onSave, onCancel }) => {
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
      className="absolute left-0 top-full mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl min-w-[320px] max-w-[400px]"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-200">{paramId}</span>
          <span className="text-xs font-mono text-zinc-500">= {currentValue}</span>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={handleSelectAll}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Select all
          </button>
          <button
            onClick={handleSelectNone}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Select none
          </button>
        </div>
      </div>

      {/* Bit checkboxes */}
      <div className="px-4 py-2 max-h-[300px] overflow-y-auto">
        {bitEntries.map(({ bit, label }) => (
          <label
            key={bit}
            className="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-zinc-800/50 rounded px-1 -mx-1 transition-colors"
          >
            <input
              type="checkbox"
              checked={isBitSet(bit)}
              onChange={() => toggleBit(bit)}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/30 focus:ring-offset-0 cursor-pointer"
            />
            <span className="text-xs text-zinc-500 font-mono w-5 shrink-0">{bit}</span>
            <span className="text-sm text-zinc-300">{label}</span>
          </label>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(currentValue)}
          disabled={!hasChanges}
          className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-zinc-800 text-blue-400 disabled:text-zinc-600 rounded-lg text-sm font-medium transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
};

export default BitmaskEditor;
