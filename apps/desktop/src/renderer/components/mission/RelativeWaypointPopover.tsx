import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { computeOffsetPosition } from '../../utils/geo-offset';
import { useSettingsStore } from '../../stores/settings-store';
import {
  distanceValueFromMeters,
  toMetersFromDistanceUnit,
  UNIT_LABELS,
} from '../../../shared/user-units.js';

export type InsertWhere = 'before' | 'after' | 'end';

interface RelativeWaypointPopoverProps {
  refSeq: number;
  refLat: number;
  refLon: number;
  totalWaypoints: number;
  screenX: number;
  screenY: number;
  onPreview: (preview: { lat: number; lon: number } | null) => void;
  onConfirm: (insertAfterSeq: number, lat: number, lon: number) => void;
  onCancel: () => void;
}

const POPOVER_WIDTH = 280;
const POPOVER_HEIGHT_ESTIMATE = 320;

function clampNumber(value: number, min: number): number {
  return Math.max(min, value);
}

export function RelativeWaypointPopover({
  refSeq,
  refLat,
  refLon,
  totalWaypoints,
  screenX,
  screenY,
  onPreview,
  onConfirm,
  onCancel,
}: RelativeWaypointPopoverProps) {
  const [bearing, setBearing] = useState(0);
  const [distance, setDistance] = useState(50);
  const [where, setWhere] = useState<InsertWhere>('after');
  const bearingInputRef = useRef<HTMLInputElement>(null);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);
  const displayDistance = distanceValueFromMeters(distance, distanceUnit);
  const minDisplayDistance = distanceValueFromMeters(1, distanceUnit);
  const distanceStep = distanceUnit === 'm' || distanceUnit === 'ft' ? 10 : 0.01;
  const [distanceDraft, setDistanceDraft] = useState(() => String(displayDistance));
  const [distanceFocused, setDistanceFocused] = useState(false);
  const skipDistanceBlurCommitRef = useRef(false);

  // Auto-clamped initial position derived from anchor coords
  const initialPosition = useMemo(() => {
    const padding = 12;
    const maxX = window.innerWidth - POPOVER_WIDTH - padding;
    const maxY = window.innerHeight - POPOVER_HEIGHT_ESTIMATE - padding;
    return {
      left: Math.max(padding, Math.min(screenX + 16, maxX)),
      top: Math.max(padding, Math.min(screenY - 40, maxY)),
    };
  }, [screenX, screenY]);

  // Drag state - once user drags, this overrides initialPosition
  const [draggedPos, setDraggedPos] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origLeft: number; origTop: number } | null>(null);
  const position = draggedPos ?? initialPosition;

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: position.left,
      origTop: position.top,
    };
    e.preventDefault();
  }, [position.left, position.top]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      // Clamp so the popover stays at least partly on-screen
      const padding = 12;
      const maxX = window.innerWidth - POPOVER_WIDTH - padding;
      const maxY = window.innerHeight - 40;
      setDraggedPos({
        left: Math.max(padding, Math.min(dragRef.current.origLeft + dx, maxX)),
        top: Math.max(padding, Math.min(dragRef.current.origTop + dy, maxY)),
      });
    };
    const handleUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  // Compute preview position whenever inputs change
  const previewPos = useMemo(
    () => computeOffsetPosition(refLat, refLon, bearing, distance),
    [refLat, refLon, bearing, distance],
  );

  // Emit preview to parent (debounce-free; computation is cheap)
  useEffect(() => {
    onPreview(previewPos);
    return () => onPreview(null);
  }, [previewPos, onPreview]);

  // Focus distance input on mount (most users want to tweak distance, bearing default 0=North)
  useEffect(() => {
    bearingInputRef.current?.focus();
    bearingInputRef.current?.select();
  }, []);

  const insertAfterSeq = useMemo(() => {
    if (where === 'after') return refSeq;
    if (where === 'before') return refSeq - 1;
    return totalWaypoints - 1;
  }, [where, refSeq, totalWaypoints]);

  const handleConfirm = () => {
    onConfirm(insertAfterSeq, previewPos.lat, previewPos.lon);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const stepBearing = (delta: number) => {
    setBearing(prev => ((prev + delta) % 360 + 360) % 360);
  };

  const stepDistance = (delta: number) => {
    setDistance(prev => {
      const nextDisplay = Math.max(minDisplayDistance, distanceValueFromMeters(prev, distanceUnit) + delta);
      return toMetersFromDistanceUnit(nextDisplay, distanceUnit);
    });
  };

  useEffect(() => {
    if (!distanceFocused) setDistanceDraft(String(displayDistance));
  }, [displayDistance, distanceFocused]);

  const resetDistanceDraft = useCallback(() => {
    setDistanceDraft(String(distanceValueFromMeters(distance, distanceUnit)));
  }, [distance, distanceUnit]);

  const commitDisplayDistance = useCallback((display: number) => {
    const clamped = clampNumber(display, minDisplayDistance);
    setDistance(toMetersFromDistanceUnit(clamped, distanceUnit));
    setDistanceDraft(String(clamped));
  }, [distanceUnit, minDisplayDistance]);

  return createPortal(
    <>
      {/* Backdrop catches clicks outside the popover to cancel */}
      <div
        className="fixed inset-0 z-[2000]"
        onClick={onCancel}
        onContextMenu={(e) => { e.preventDefault(); onCancel(); }}
      />

      <div
        className="fixed z-[2001] bg-surface border border-default rounded-xl shadow-2xl"
        style={{ left: position.left, top: position.top, width: POPOVER_WIDTH }}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-4 py-3 border-b border-subtle flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleDragStart}
        >
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="9" cy="6" r="1.2" />
              <circle cx="15" cy="6" r="1.2" />
              <circle cx="9" cy="12" r="1.2" />
              <circle cx="15" cy="12" r="1.2" />
              <circle cx="9" cy="18" r="1.2" />
              <circle cx="15" cy="18" r="1.2" />
            </svg>
            <div>
              <div className="text-sm font-medium text-content">Relative waypoint</div>
              <div className="text-[11px] text-content-secondary">
                From WP {refSeq + 1}
              </div>
            </div>
          </div>
          <button
            onClick={onCancel}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 rounded hover:bg-surface-raised text-content-secondary"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* Bearing row: compass icon + number input + steppers */}
          <div>
            <label className="block text-[11px] text-content-secondary mb-1">Bearing</label>
            <div className="flex items-center gap-2">
              <CompassDial bearing={bearing} />
              <div className="flex-1 flex items-center bg-surface-raised border border-subtle rounded-lg overflow-hidden">
                <input
                  ref={bearingInputRef}
                  type="number"
                  min={0}
                  max={359}
                  value={bearing}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setBearing(((v % 360) + 360) % 360);
                  }}
                  className="flex-1 bg-transparent px-2 py-1.5 text-sm text-content outline-none"
                />
                <span className="px-2 text-xs text-content-secondary">°</span>
                <div className="flex flex-col border-l border-subtle">
                  <button
                    onClick={() => stepBearing(15)}
                    className="px-2 text-[10px] text-content-secondary hover:bg-surface hover:text-content"
                  >+15</button>
                  <button
                    onClick={() => stepBearing(-15)}
                    className="px-2 text-[10px] text-content-secondary hover:bg-surface hover:text-content border-t border-subtle"
                  >-15</button>
                </div>
              </div>
            </div>
            <div className="mt-1 flex gap-1">
              {([
                ['N', 0], ['NE', 45], ['E', 90], ['SE', 135],
                ['S', 180], ['SW', 225], ['W', 270], ['NW', 315],
              ] as const).map(([label, val]) => (
                <button
                  key={label}
                  onClick={() => setBearing(val)}
                  className={`flex-1 text-[10px] py-0.5 rounded transition-colors ${
                    bearing === val
                      ? 'bg-blue-600 text-white'
                      : 'text-content-secondary hover:bg-surface-raised'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Distance row */}
          <div>
            <label className="block text-[11px] text-content-secondary mb-1">Distance</label>
            <div className="flex items-center bg-surface-raised border border-subtle rounded-lg overflow-hidden">
              <button
                onClick={() => stepDistance(-distanceStep)}
                className="px-2 py-1.5 text-content-secondary hover:bg-surface hover:text-content border-r border-subtle"
              >-</button>
              <input
                type="number"
                min={minDisplayDistance}
                step={distanceStep}
                value={distanceDraft}
                onFocus={() => setDistanceFocused(true)}
                onChange={(e) => {
                  const nextDraft = e.target.value;
                  setDistanceDraft(nextDraft);
                  if (nextDraft.trim() === '') return;
                  const v = Number(nextDraft);
                  if (Number.isFinite(v) && v >= minDisplayDistance) {
                    setDistance(toMetersFromDistanceUnit(v, distanceUnit));
                  }
                }}
                onBlur={() => {
                  setDistanceFocused(false);
                  if (skipDistanceBlurCommitRef.current) {
                    skipDistanceBlurCommitRef.current = false;
                    return;
                  }
                  const parsed = Number(distanceDraft);
                  if (distanceDraft.trim() === '' || !Number.isFinite(parsed)) {
                    resetDistanceDraft();
                    return;
                  }
                  commitDisplayDistance(parsed);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  } else if (e.key === 'Escape') {
                    skipDistanceBlurCommitRef.current = true;
                    resetDistanceDraft();
                    e.currentTarget.blur();
                  }
                }}
                className="flex-1 bg-transparent px-2 py-1.5 text-sm text-content outline-none text-center"
              />
              <span className="px-1 text-xs text-content-secondary">{UNIT_LABELS.distance[distanceUnit]}</span>
              <button
                onClick={() => stepDistance(distanceStep)}
                className="px-2 py-1.5 text-content-secondary hover:bg-surface hover:text-content border-l border-subtle"
              >+</button>
            </div>
          </div>

          {/* Insert position */}
          <div>
            <label className="block text-[11px] text-content-secondary mb-1">Insert</label>
            <div className="flex items-center rounded-lg overflow-hidden border border-subtle">
              <InsertButton
                active={where === 'before'}
                disabled={refSeq === 0}
                onClick={() => setWhere('before')}
              >
                Before
              </InsertButton>
              <div className="w-px h-5 bg-subtle" />
              <InsertButton
                active={where === 'after'}
                onClick={() => setWhere('after')}
              >
                After
              </InsertButton>
              <div className="w-px h-5 bg-subtle" />
              <InsertButton
                active={where === 'end'}
                onClick={() => setWhere('end')}
              >
                At end
              </InsertButton>
            </div>
          </div>

          {/* Result preview row */}
          <div className="text-[10px] text-content-secondary font-mono px-1">
            {previewPos.lat.toFixed(7)}, {previewPos.lon.toFixed(7)}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-subtle flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-content-secondary hover:text-content"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
          >
            Add waypoint
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

function CompassDial({ bearing }: { bearing: number }) {
  return (
    <div className="relative w-12 h-12 rounded-full border border-subtle bg-surface-raised flex items-center justify-center shrink-0">
      <span className="absolute top-0.5 text-[8px] text-content-secondary leading-none">N</span>
      <span className="absolute bottom-0.5 text-[8px] text-content-secondary leading-none">S</span>
      <span className="absolute left-0.5 text-[8px] text-content-secondary leading-none">W</span>
      <span className="absolute right-0.5 text-[8px] text-content-secondary leading-none">E</span>
      <div
        className="w-0.5 h-5 bg-blue-500 origin-bottom"
        style={{ transform: `rotate(${bearing}deg)`, transformOrigin: '50% 100%' }}
      />
    </div>
  );
}

function InsertButton({
  active,
  disabled = false,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`flex-1 px-2 py-1.5 text-[11px] transition-colors ${
        disabled
          ? 'text-content-tertiary cursor-not-allowed'
          : active
            ? 'bg-blue-600 text-white'
            : 'text-content-secondary hover:bg-surface-raised'
      }`}
    >
      {children}
    </button>
  );
}
