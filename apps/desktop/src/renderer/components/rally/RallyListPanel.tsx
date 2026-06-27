/**
 * RallyListPanel - List and manage rally points
 *
 * Displays:
 * - List of rally points with coordinates and altitude
 * - Details panel for editing selected point
 *
 * Note: Download/Upload/Clear buttons are now in MissionToolbar (mode-aware)
 * Note: Add Rally Point button is now a floating button on the map (MissionMapPanel)
 */

import { useState, useEffect } from 'react';
import { useRallyStore } from '../../stores/rally-store';
import { useSettingsStore } from '../../stores/settings-store';
import { RALLY_FLAGS, getRallyFlagsDescription } from '../../../shared/rally-types';
import {
  altitudeValueFromMeters,
  formatAltitudeFromMeters,
  toMetersFromAltitudeUnit,
  UNIT_LABELS,
  type AltitudeUnit,
} from '../../../shared/user-units.js';

interface RallyListPanelProps {
  readOnly?: boolean;
}

export function RallyListPanel({
  readOnly = false,
}: RallyListPanelProps) {
  const {
    rallyPoints,
    selectedSeq,
    isLoading,
    progress,
    error,
    isDirty,
    lastSuccessMessage,
    setSelectedSeq,
    updateRallyPoint,
    removeRallyPoint,
    clearLastSuccessMessage,
  } = useRallyStore();
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);

  // Auto-dismiss success messages
  useEffect(() => {
    if (lastSuccessMessage) {
      const timer = setTimeout(() => {
        clearLastSuccessMessage();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [lastSuccessMessage, clearLastSuccessMessage]);

  const selectedPoint = rallyPoints.find((p) => p.seq === selectedSeq);

  return (
    <div className="h-full flex flex-col bg-surface text-content">
      {/* Header */}
      <div className="p-3 border-b border-subtle">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Rally Points</h3>
          {isDirty && (
            <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded">
              Modified
            </span>
          )}
        </div>
        <p className="text-xs text-content-secondary mt-1">Emergency landing locations</p>
      </div>

      {/* Success message */}
      {lastSuccessMessage && (
        <div className="m-2 p-2 bg-green-500/20 border border-green-500/50 rounded text-green-400 text-xs flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{lastSuccessMessage}</span>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="m-2 p-2 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Progress bar */}
      {progress && (
        <div className="m-2 p-2 bg-surface-raised rounded">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-content-secondary">
              {progress.operation === 'download' ? 'Downloading' : 'Uploading'}...
            </span>
            <span className="text-content">
              {progress.transferred}/{progress.total}
            </span>
          </div>
          <div className="h-1 bg-surface-raised rounded overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-200"
              style={{
                width: progress.total > 0 ? `${(progress.transferred / progress.total) * 100}%` : '0%',
              }}
            />
          </div>
        </div>
      )}

      {/* Rally Points List */}
      <div className="flex-1 overflow-y-auto">
        {rallyPoints.length === 0 ? (
          <div className="p-4 text-center text-content-secondary text-xs">
            <svg className="w-8 h-8 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <p>No rally points</p>
            <p className="mt-1 text-content-tertiary">Click "Add Rally Point" to create one</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {rallyPoints.map((point) => (
              <RallyListItem
                key={point.seq}
                point={point}
                isSelected={selectedSeq === point.seq}
                readOnly={readOnly}
                altitudeUnit={altitudeUnit}
                onSelect={() => setSelectedSeq(selectedSeq === point.seq ? null : point.seq)}
                onRemove={() => removeRallyPoint(point.seq)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Details Panel for Selected Point */}
      {selectedPoint && !readOnly && (
        <RallyDetailsPanel
          point={selectedPoint}
          altitudeUnit={altitudeUnit}
          onUpdate={(updates) => updateRallyPoint(selectedPoint.seq, updates)}
        />
      )}

      {/* Status Bar */}
      <div className="p-2 border-t border-subtle text-xs text-content-secondary flex items-center justify-between">
        <span>
          {rallyPoints.length} point{rallyPoints.length !== 1 ? 's' : ''}
        </span>
        {isLoading && (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Loading...
          </span>
        )}
      </div>
    </div>
  );
}

// Individual rally point list item
interface RallyListItemProps {
  point: {
    seq: number;
    latitude: number;
    longitude: number;
    altitude: number;
  };
  isSelected: boolean;
  readOnly: boolean;
  altitudeUnit: AltitudeUnit;
  onSelect: () => void;
  onRemove: () => void;
}

function RallyListItem({ point, isSelected, readOnly, altitudeUnit, onSelect, onRemove }: RallyListItemProps) {
  return (
    <div
      className={`flex items-center justify-between p-2 rounded cursor-pointer ${
        isSelected
          ? 'bg-orange-500/20 ring-1 ring-orange-500'
          : 'bg-surface hover:bg-surface-raised'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <div
          className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${
            isSelected
              ? 'bg-white text-orange-500 border-2 border-orange-500'
              : 'bg-orange-500 text-white'
          }`}
        >
          R{point.seq + 1}
        </div>
        <div className="text-xs">
          <div className="text-content">
            {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
          </div>
          <div className="text-content-secondary">Alt: {formatAltitudeFromMeters(point.altitude, altitudeUnit)}</div>
        </div>
      </div>
      {!readOnly && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="p-1 text-content-secondary hover:text-red-400"
          title="Remove"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// Details panel for editing selected rally point
interface RallyDetailsPanelProps {
  point: {
    seq: number;
    latitude: number;
    longitude: number;
    altitude: number;
    breakAltitude: number;
    landDirection: number;
    flags: number;
  };
  altitudeUnit: AltitudeUnit;
  onUpdate: (updates: Partial<RallyDetailsPanelProps['point']>) => void;
}

function altitudeInputValue(meters: number, unit: AltitudeUnit): string {
  const precision = unit === 'km' ? 3 : unit === 'm' ? 0 : 1;
  return String(Number(altitudeValueFromMeters(meters, unit).toFixed(precision)));
}

function parseNumberDraft(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?$/i.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function RallyDetailsPanel({ point, altitudeUnit, onUpdate }: RallyDetailsPanelProps) {
  const [localAlt, setLocalAlt] = useState(() => altitudeInputValue(point.altitude, altitudeUnit));
  const [localBreakAlt, setLocalBreakAlt] = useState(() => altitudeInputValue(point.breakAltitude, altitudeUnit));
  const [localDirection, setLocalDirection] = useState(String(point.landDirection));
  const altitudeLabel = UNIT_LABELS.altitude[altitudeUnit];

  // Sync local state when point changes
  useEffect(() => {
    setLocalAlt(altitudeInputValue(point.altitude, altitudeUnit));
    setLocalBreakAlt(altitudeInputValue(point.breakAltitude, altitudeUnit));
    setLocalDirection(String(point.landDirection));
  }, [altitudeUnit, point.seq, point.altitude, point.breakAltitude, point.landDirection]);

  const handleAltBlur = () => {
    const val = parseNumberDraft(localAlt);
    if (val === null) {
      setLocalAlt(altitudeInputValue(point.altitude, altitudeUnit));
      return;
    }
    if (localAlt === altitudeInputValue(point.altitude, altitudeUnit)) return;
    const meters = toMetersFromAltitudeUnit(val, altitudeUnit);
    if (meters !== point.altitude) {
      onUpdate({ altitude: meters });
    }
  };

  const handleBreakAltBlur = () => {
    const val = parseNumberDraft(localBreakAlt);
    if (val === null) {
      setLocalBreakAlt(altitudeInputValue(point.breakAltitude, altitudeUnit));
      return;
    }
    if (localBreakAlt === altitudeInputValue(point.breakAltitude, altitudeUnit)) return;
    const meters = toMetersFromAltitudeUnit(val, altitudeUnit);
    if (meters !== point.breakAltitude) {
      onUpdate({ breakAltitude: meters });
    }
  };

  const handleDirectionBlur = () => {
    const val = parseFloat(localDirection);
    if (!isNaN(val) && val !== point.landDirection) {
      onUpdate({ landDirection: val });
    }
  };

  const toggleFlag = (flag: number) => {
    const newFlags = point.flags ^ flag;
    onUpdate({ flags: newFlags });
  };

  return (
    <div className="p-3 border-t border-subtle bg-surface">
      <div className="text-xs font-medium text-orange-400 mb-2">
        Rally Point R{point.seq + 1}
      </div>

      <div className="space-y-2">
        {/* Position (read-only, drag on map to change) */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-content-secondary">Position</label>
          <span className="text-xs text-content">
            {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
          </span>
        </div>

        {/* Altitude */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-content-secondary">Altitude</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={localAlt}
              onChange={(e) => setLocalAlt(e.target.value)}
              onBlur={handleAltBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleAltBlur()}
              className="w-20 px-2 py-1 text-xs bg-surface-raised border border rounded text-right"
            />
            <span className="w-6 text-[10px] text-content-tertiary">{altitudeLabel}</span>
          </div>
        </div>

        {/* Break Altitude */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-content-secondary">
            Break Alt
            <span className="ml-1 text-content-tertiary" title="Altitude to exit loiter and begin landing">
              ?
            </span>
          </label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={localBreakAlt}
              onChange={(e) => setLocalBreakAlt(e.target.value)}
              onBlur={handleBreakAltBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleBreakAltBlur()}
              className="w-20 px-2 py-1 text-xs bg-surface-raised border border rounded text-right"
            />
            <span className="w-6 text-[10px] text-content-tertiary">{altitudeLabel}</span>
          </div>
        </div>

        {/* Land Direction */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-content-secondary">
            Land Heading (°)
            <span className="ml-1 text-content-tertiary" title="0 = any direction">
              ?
            </span>
          </label>
          <input
            type="number"
            min={0}
            max={360}
            value={localDirection}
            onChange={(e) => setLocalDirection(e.target.value)}
            onBlur={handleDirectionBlur}
            onKeyDown={(e) => e.key === 'Enter' && handleDirectionBlur()}
            className="w-20 px-2 py-1 text-xs bg-surface-raised border border rounded text-right"
          />
        </div>

        {/* Flags */}
        <div>
          <label className="text-xs text-content-secondary block mb-1">Flags</label>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={(point.flags & RALLY_FLAGS.FAVORABLE_WIND) !== 0}
                onChange={() => toggleFlag(RALLY_FLAGS.FAVORABLE_WIND)}
                className="rounded bg-surface-raised border"
              />
              <span className="text-content">Land into wind</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={(point.flags & RALLY_FLAGS.LAND_IMMEDIATELY) !== 0}
                onChange={() => toggleFlag(RALLY_FLAGS.LAND_IMMEDIATELY)}
                className="rounded bg-surface-raised border"
              />
              <span className="text-content">Land immediately (no loiter)</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
