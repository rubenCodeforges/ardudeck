/**
 * MotorMixerTab
 *
 * Motor mixer configuration for modern iNav boards.
 * Uses MSP2_COMMON_MOTOR_MIXER for modern boards, CLI fallback for legacy.
 * Includes background reconnect handling similar to platform change.
 */

import { useState, useEffect, useCallback } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { pendingDraft, usePendingWritesStore } from '../../stores/msp-pending-writes-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useSettingsStore } from '../../stores/settings-store';
import { CompactSlider } from '../ui/DraggableSlider';
import {
  Cog, Plus, Trash2, RotateCcw, RotateCw, RefreshCw,
  Lightbulb, HelpCircle, ChevronDown, ChevronUp, Sparkles, Plane
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface MotorMix {
  index: number;
  throttle: number;
  roll: number;
  pitch: number;
  yaw: number;
}

// Motor position in the visual diagram (relative coordinates 0-100)
interface MotorPosition {
  x: number;
  y: number;
  rotation: 'cw' | 'ccw'; // Clockwise or counter-clockwise
}

// Platform types for filtering presets
type PlatformCategory = 'multirotor' | 'airplane';

// Common motor mixer presets with visual positions
const MOTOR_PRESETS: Record<string, {
  nameKey: string;
  descriptionKey: string;
  beginnerKey: string;
  icon: LucideIcon;
  recommended?: boolean;
  platform: PlatformCategory;
  positions: MotorPosition[];
  motors: Omit<MotorMix, 'index'>[];
}> = {
  // === MULTIROTOR PRESETS ===
  quadX: {
    nameKey: 'parameters:motorMixerTab.preset.quadXName',
    descriptionKey: 'parameters:motorMixerTab.preset.quadXDesc',
    beginnerKey: 'parameters:motorMixerTab.preset.quadXBeginner',
    icon: Sparkles,
    recommended: true,
    platform: 'multirotor',
    positions: [
      { x: 25, y: 35, rotation: 'ccw' },  // Front-left (M0)
      { x: 75, y: 75, rotation: 'ccw' },  // Rear-right (M1)
      { x: 75, y: 35, rotation: 'cw' },   // Front-right (M2)
      { x: 25, y: 75, rotation: 'cw' },   // Rear-left (M3)
    ],
    motors: [
      { throttle: 1.0, roll: -1.0, pitch: 1.0, yaw: -1.0 },
      { throttle: 1.0, roll: -1.0, pitch: -1.0, yaw: 1.0 },
      { throttle: 1.0, roll: 1.0, pitch: 1.0, yaw: 1.0 },
      { throttle: 1.0, roll: 1.0, pitch: -1.0, yaw: -1.0 },
    ],
  },
  quadPlus: {
    nameKey: 'parameters:motorMixerTab.preset.quadPlusName',
    descriptionKey: 'parameters:motorMixerTab.preset.quadPlusDesc',
    beginnerKey: 'parameters:motorMixerTab.preset.quadPlusBeginner',
    icon: Plus,
    platform: 'multirotor',
    positions: [
      { x: 50, y: 32, rotation: 'ccw' },  // Front (M0)
      { x: 15, y: 55, rotation: 'cw' },   // Left (M1)
      { x: 50, y: 78, rotation: 'ccw' },  // Rear (M2)
      { x: 85, y: 55, rotation: 'cw' },   // Right (M3)
    ],
    motors: [
      { throttle: 1.0, roll: 0.0, pitch: 1.0, yaw: -1.0 },
      { throttle: 1.0, roll: -1.0, pitch: 0.0, yaw: 1.0 },
      { throttle: 1.0, roll: 0.0, pitch: -1.0, yaw: -1.0 },
      { throttle: 1.0, roll: 1.0, pitch: 0.0, yaw: 1.0 },
    ],
  },
  hex: {
    nameKey: 'parameters:motorMixerTab.preset.hexName',
    descriptionKey: 'parameters:motorMixerTab.preset.hexDesc',
    beginnerKey: 'parameters:motorMixerTab.preset.hexBeginner',
    icon: Cog,
    platform: 'multirotor',
    positions: [
      { x: 30, y: 32, rotation: 'ccw' },  // Front-left
      { x: 15, y: 55, rotation: 'cw' },   // Left
      { x: 30, y: 78, rotation: 'ccw' },  // Rear-left
      { x: 70, y: 78, rotation: 'cw' },   // Rear-right
      { x: 85, y: 55, rotation: 'ccw' },  // Right
      { x: 70, y: 32, rotation: 'cw' },   // Front-right
    ],
    motors: [
      { throttle: 1.0, roll: -0.5, pitch: 1.0, yaw: -1.0 },
      { throttle: 1.0, roll: -1.0, pitch: 0.0, yaw: 1.0 },
      { throttle: 1.0, roll: -0.5, pitch: -1.0, yaw: -1.0 },
      { throttle: 1.0, roll: 0.5, pitch: -1.0, yaw: 1.0 },
      { throttle: 1.0, roll: 1.0, pitch: 0.0, yaw: -1.0 },
      { throttle: 1.0, roll: 0.5, pitch: 1.0, yaw: 1.0 },
    ],
  },

  // === AIRPLANE PRESETS ===
  singleMotor: {
    nameKey: 'parameters:motorMixerTab.preset.singleMotorName',
    descriptionKey: 'parameters:motorMixerTab.preset.singleMotorDesc',
    beginnerKey: 'parameters:motorMixerTab.preset.singleMotorBeginner',
    icon: Plane,
    recommended: true,
    platform: 'airplane',
    positions: [
      { x: 50, y: 50, rotation: 'cw' },   // Center - single motor
    ],
    motors: [
      { throttle: 1.0, roll: 0.0, pitch: 0.0, yaw: 0.0 },
    ],
  },
  twinMotorDiff: {
    nameKey: 'parameters:motorMixerTab.preset.twinMotorDiffName',
    descriptionKey: 'parameters:motorMixerTab.preset.twinMotorDiffDesc',
    beginnerKey: 'parameters:motorMixerTab.preset.twinMotorDiffBeginner',
    icon: Plane,
    platform: 'airplane',
    positions: [
      { x: 25, y: 50, rotation: 'ccw' },  // Left motor - CCW
      { x: 75, y: 50, rotation: 'cw' },   // Right motor - CW
    ],
    motors: [
      { throttle: 1.0, roll: 0.0, pitch: 0.0, yaw: 0.5 },
      { throttle: 1.0, roll: 0.0, pitch: 0.0, yaw: -0.5 },
    ],
  },
  twinMotorRudder: {
    nameKey: 'parameters:motorMixerTab.preset.twinMotorRudderName',
    descriptionKey: 'parameters:motorMixerTab.preset.twinMotorRudderDesc',
    beginnerKey: 'parameters:motorMixerTab.preset.twinMotorRudderBeginner',
    icon: Plane,
    platform: 'airplane',
    positions: [
      { x: 25, y: 50, rotation: 'ccw' },  // Left motor - CCW
      { x: 75, y: 50, rotation: 'cw' },   // Right motor - CW
    ],
    motors: [
      { throttle: 1.0, roll: 0.0, pitch: 0.0, yaw: 0.0 },
      { throttle: 1.0, roll: 0.0, pitch: 0.0, yaw: 0.0 },
    ],
  },
  quadPlaneVTOL: {
    nameKey: 'parameters:motorMixerTab.preset.quadPlaneVTOLName',
    descriptionKey: 'parameters:motorMixerTab.preset.quadPlaneVTOLDesc',
    beginnerKey: 'parameters:motorMixerTab.preset.quadPlaneVTOLBeginner',
    icon: Plane,
    platform: 'airplane',
    positions: [
      { x: 25, y: 35, rotation: 'ccw' },  // Front-left quad motor
      { x: 75, y: 35, rotation: 'cw' },   // Front-right quad motor
      { x: 25, y: 58, rotation: 'cw' },   // Rear-left quad motor
      { x: 75, y: 58, rotation: 'ccw' },  // Rear-right quad motor
      { x: 50, y: 80, rotation: 'cw' },   // Pusher motor (rear)
    ],
    motors: [
      { throttle: 1.0, roll: -1.0, pitch: 1.0, yaw: -1.0 },  // FL
      { throttle: 1.0, roll: 1.0, pitch: 1.0, yaw: 1.0 },    // FR
      { throttle: 1.0, roll: -1.0, pitch: -1.0, yaw: 1.0 },  // RL
      { throttle: 1.0, roll: 1.0, pitch: -1.0, yaw: -1.0 },  // RR
      { throttle: 1.0, roll: 0.0, pitch: 0.0, yaw: 0.0 },    // Pusher
    ],
  },
  triVTOL: {
    nameKey: 'parameters:motorMixerTab.preset.triVTOLName',
    descriptionKey: 'parameters:motorMixerTab.preset.triVTOLDesc',
    beginnerKey: 'parameters:motorMixerTab.preset.triVTOLBeginner',
    icon: Plane,
    platform: 'airplane',
    positions: [
      { x: 25, y: 42, rotation: 'ccw' },  // Left motor
      { x: 75, y: 42, rotation: 'cw' },   // Right motor
      { x: 50, y: 75, rotation: 'cw' },   // Rear motor (tilts for yaw)
    ],
    motors: [
      { throttle: 1.0, roll: -1.0, pitch: 0.5, yaw: 0.0 },
      { throttle: 1.0, roll: 1.0, pitch: 0.5, yaw: 0.0 },
      { throttle: 1.0, roll: 0.0, pitch: -1.0, yaw: 0.0 },   // Yaw via servo tilt
    ],
  },
};

// Visual motor layout diagram component - bigger and clearer
function MotorLayoutDiagram({
  positions,
  size = 140,
  showLabels = true,
}: {
  positions: MotorPosition[];
  size?: number;
  showLabels?: boolean;
}) {
  const { t } = useTranslation();
  // Scale motor size based on diagram size
  const motorSize = size >= 140 ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-xs';
  const labelSize = size >= 140 ? 'text-[10px]' : 'text-[8px]';
  const iconSize = size >= 140 ? 'w-3 h-3' : 'w-2.5 h-2.5';

  return (
    <div
      className="relative bg-surface-overlay-light rounded-xl"
      style={{ width: size, height: size }}
    >
      {/* Front indicator */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent border-b-emerald-500" />
        <span className="text-[10px] text-emerald-400 font-semibold mt-1">{t('parameters:motorMixerTab.front')}</span>
      </div>

      {/* Motors */}
      {positions.map((pos, idx) => (
        <div
          key={idx}
          className="absolute flex flex-col items-center"
          style={{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Motor circle */}
          <div
            className={`${motorSize} rounded-full border-2 flex items-center justify-center font-bold shadow-lg ${
              pos.rotation === 'cw'
                ? 'border-orange-500 bg-orange-500/30 text-orange-100'
                : 'border-blue-500 bg-blue-500/30 text-blue-100'
            }`}
          >
            {showLabels && idx}
          </div>
          {/* Direction label with icon */}
          <div className={`flex items-center gap-0.5 mt-1 ${
            pos.rotation === 'cw' ? 'text-orange-400' : 'text-blue-400'
          }`}>
            {pos.rotation === 'cw' ? (
              <RotateCw className={iconSize} />
            ) : (
              <RotateCcw className={iconSize} />
            )}
            <span className={`${labelSize} font-semibold`}>
              {pos.rotation.toUpperCase()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

const MAX_MOTORS = 8;

// Mixing value bar visualization
function MixBar({ value, color, label }: { value: number; color: string; label: string }) {
  const percentage = Math.abs(value) * 100;
  const isNegative = value < 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-content-secondary">{label}</span>
        <span className="font-mono" style={{ color }}>{value.toFixed(3)}</span>
      </div>
      <div className="relative h-2 bg-surface-inset rounded-full overflow-hidden">
        <div
          className="absolute top-0 h-full rounded-full transition-all"
          style={{
            left: isNegative ? `${50 - percentage / 2}%` : '50%',
            width: `${percentage / 2}%`,
            backgroundColor: color,
          }}
        />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600" />
      </div>
    </div>
  );
}

const PENDING_ID = 'motor-mixer';

async function writeMotorMixer(motors: MotorMix[]): Promise<boolean> {
  const rules = motors.map((m) => ({ throttle: m.throttle, roll: m.roll, pitch: m.pitch, yaw: m.yaw }));
  return (await window.electronAPI?.mspSetMotorMixer(rules)) ?? false;
}

// Helper to determine platform category from vehicle type
function getPlatformCategory(vehicleType?: string): PlatformCategory {
  if (!vehicleType) return 'multirotor';
  const lower = vehicleType.toLowerCase();
  if (lower.includes('plane') || lower.includes('airplane') || lower.includes('wing') || lower === 'airplane') {
    return 'airplane';
  }
  return 'multirotor';
}

export default function MotorMixerTab() {
  const { t } = useTranslation();
  const connectionState = useConnectionStore((s) => s.connectionState);
  const showInfoCards = useSettingsStore((s) => s.uiVisibility.showInfoCards);
  const draft = pendingDraft<MotorMix[]>(PENDING_ID);
  const [motors, setMotors] = useState<MotorMix[]>(draft ?? []);
  const [dirty, setDirty] = useState(!!draft);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMorePresets, setShowMorePresets] = useState(false);

  // Determine current platform and filter presets
  const currentPlatform = getPlatformCategory(connectionState.vehicleType);
  const filteredPresets = Object.entries(MOTOR_PRESETS).filter(
    ([, preset]) => preset.platform === currentPlatform
  );
  const defaultPreset = currentPlatform === 'airplane' ? 'singleMotor' : 'quadX';

  // Split presets: first 3 are "main", rest go in accordion
  const mainPresets = filteredPresets.slice(0, 3);
  const morePresets = filteredPresets.slice(3);

  // Load motor mixer from FC via MSP (with CLI fallback)
  const loadMotorMixer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try MSP first (modern boards)
      let result = await window.electronAPI?.mspGetMotorMixer();

      if (!result) {
        // CLI fallback for legacy boards
        const cliResult = await window.electronAPI?.mspReadMmixCli();
        if (cliResult) {
          result = cliResult.map(m => ({
            throttle: m.throttle,
            roll: m.roll,
            pitch: m.pitch,
            yaw: m.yaw,
          }));
        }
      }

      if (result && result.length > 0) {
        // Limit to MAX_MOTORS to prevent garbage data issues
        const validMotors = result.slice(0, MAX_MOTORS).map((m, i) => ({ ...m, index: i }));
        setMotors(validMotors);
      } else {
        setMotors([]);
      }
    } catch (err) {
      console.error('[MotorMixer] Load failed:', err);
      setError(err instanceof Error ? err.message : t('parameters:motorMixerTab.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Auto-load on mount, unless unsaved edits from before a tab switch are waiting
  useEffect(() => {
    if (connectionState.isConnected && !pendingDraft(PENDING_ID)) {
      loadMotorMixer();
    }
  }, [connectionState.isConnected, loadMotorMixer]);

  useEffect(() => {
    if (!dirty) return;
    usePendingWritesStore.getState().put<MotorMix[]>(PENDING_ID, {
      label: t('parameters:motorMixerTab.pendingLabel'),
      draft: motors,
      write: writeMotorMixer,
      needsReboot: true,
    });
  }, [dirty, motors, t]);

  const reload = () => {
    usePendingWritesStore.getState().drop(PENDING_ID);
    setDirty(false);
    void loadMotorMixer();
  };

  // Update a motor's mix values
  const updateMotor = (index: number, updates: Partial<MotorMix>) => {
    setMotors(prev => prev.map(m =>
      m.index === index ? { ...m, ...updates } : m
    ));
    setDirty(true);
  };

  // Add a new motor
  const addMotor = () => {
    if (motors.length >= MAX_MOTORS) return;
    const newIndex = motors.length;
    setMotors(prev => [...prev, {
      index: newIndex,
      throttle: 1.0,
      roll: 0,
      pitch: 0,
      yaw: 0,
    }]);
    setDirty(true);
  };

  // Remove a motor
  const removeMotor = (index: number) => {
    setMotors(prev => {
      const filtered = prev.filter(m => m.index !== index);
      return filtered.map((m, i) => ({ ...m, index: i }));
    });
    setDirty(true);
  };

  // Apply a preset
  const applyPreset = (presetKey: string) => {
    const preset = MOTOR_PRESETS[presetKey];
    if (!preset) return;
    setMotors(preset.motors.map((m, i) => ({ ...m, index: i })));
    setDirty(true);
  };

  // Reset all motors
  const resetAll = () => {
    setMotors([]);
    setDirty(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-sm text-content-secondary">{t('parameters:motorMixerTab.loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-500/20 flex items-center justify-center">
            <Cog className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-content">{t('parameters:motorMixerTab.title')}</h2>
            <p className="text-sm text-content-secondary">{t('parameters:motorMixerTab.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={reload}
            disabled={loading}
            className="px-3 py-2 text-content-secondary hover:text-content hover:bg-surface-raised rounded-lg transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {dirty ? t('parameters:motorMixerTab.discardChanges') : t('common:reload')}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/10 border-red-500/30 rounded-lg text-sm text-red-300 flex items-center gap-2">
          <span>{t('parameters:motorMixerTab.errorPrefix')}</span> {error}
          <button onClick={() => setError(null)} className="ml-auto hover:text-red-200">×</button>
        </div>
      )}

      {/* Beginner Help */}
      {showInfoCards && (
        <div className="bg-blue-500/10 rounded-xl border-blue-500/20 p-4">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-medium text-blue-300 mb-1">{t('parameters:motorMixerTab.whatIs')}</h3>
              <p className="text-sm text-blue-200/70">
                {currentPlatform === 'airplane'
                  ? t('parameters:motorMixerTab.whatIsPlane')
                  : t('parameters:motorMixerTab.whatIsMulti')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Frame Selection - Visual Presets */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-content">
            {currentPlatform === 'airplane' ? t('parameters:motorMixerTab.questionPlane') : t('parameters:motorMixerTab.questionMulti')}
          </h3>
          <button
            onClick={resetAll}
            className="px-3 py-1.5 text-xs bg-surface-raised hover:bg-red-500/20 rounded-lg text-content-tertiary hover:text-red-400 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3 h-3" />
            {t('parameters:motorMixerTab.clearAll')}
          </button>
        </div>

        {/* Preset Cards - all same size, expandable grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(showMorePresets ? filteredPresets : mainPresets).map(([key, preset]) => {
            const IconComponent = preset.icon;
            const isSelected = motors.length === preset.motors.length &&
              motors.every((m, i) =>
                Math.abs(m.throttle - preset.motors[i]!.throttle) < 0.01 &&
                Math.abs(m.roll - preset.motors[i]!.roll) < 0.01 &&
                Math.abs(m.pitch - preset.motors[i]!.pitch) < 0.01 &&
                Math.abs(m.yaw - preset.motors[i]!.yaw) < 0.01
              );

            return (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`rounded-xl border text-left transition-all overflow-hidden ${
                  isSelected
                    ? 'bg-emerald-500/10 border-emerald-500/50 ring-2 ring-emerald-500/30'
                    : 'bg-surface border-subtle hover:border'
                }`}
              >
                {/* Diagram Header - Full Width, Bigger */}
                <div className={`flex items-center justify-center py-8 ${
                  isSelected ? 'bg-emerald-500/10' : 'bg-surface'
                }`}>
                  <MotorLayoutDiagram positions={preset.positions} size={140} />
                </div>

                {/* Content */}
                <div className="p-4">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2">
                    <IconComponent className={`w-4 h-4 ${isSelected ? 'text-emerald-400' : 'text-content-secondary'}`} />
                    <span className={`font-semibold ${isSelected ? 'text-emerald-300' : 'text-content'}`}>
                      {t(preset.nameKey)}
                    </span>
                    {preset.recommended && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded font-medium">
                        {t('parameters:motorMixerTab.popular')}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-content-secondary mb-3">{t(preset.descriptionKey)}</p>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      isSelected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface-raised text-content-tertiary'
                    }`}>
                      {t('parameters:motorMixerTab.motorCount', { count: preset.motors.length })}
                    </span>
                    {isSelected && (
                      <span className="text-xs text-emerald-400 font-medium">{t('parameters:motorMixerTab.selected')}</span>
                    )}
                  </div>

                  {/* Beginner tip */}
                  <p className="mt-3 pt-3 border-t border-subtle text-[11px] text-content-secondary">
                    {t(preset.beginnerKey)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Show More / Show Less Button */}
        {morePresets.length > 0 && (
          <div className="flex justify-center">
            <button
              onClick={() => setShowMorePresets(!showMorePresets)}
              className="px-4 py-2 bg-surface hover:bg-surface-raised border rounded-lg text-sm font-medium text-content transition-colors flex items-center gap-2"
            >
              {showMorePresets ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  {t('parameters:motorMixerTab.showLess')}
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  {t('parameters:motorMixerTab.showMore', { count: morePresets.length })}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Motor Cards */}
      {motors.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-xl border-subtle">
          <HelpCircle className="w-12 h-12 text-content-tertiary mx-auto mb-3" />
          <h3 className="text-lg font-medium text-content mb-2">
            {currentPlatform === 'airplane' ? t('parameters:motorMixerTab.emptyPlane') : t('parameters:motorMixerTab.emptyMulti')}
          </h3>
          <p className="text-sm text-content-secondary max-w-md mx-auto mb-4">
            {currentPlatform === 'airplane'
              ? t('parameters:motorMixerTab.emptyPlaneHint')
              : t('parameters:motorMixerTab.emptyMultiHint')}
          </p>
          <button
            onClick={() => applyPreset(defaultPreset)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            {currentPlatform === 'airplane' ? (
              <>
                <Plane className="w-4 h-4" />
                {t('parameters:motorMixerTab.useSingleMotor')}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t('parameters:motorMixerTab.useQuadX')}
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          {/* Current Configuration Summary */}
          <div className="bg-emerald-500/10 rounded-xl border-emerald-500/20 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Cog className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-medium text-emerald-300">
                    {t('parameters:motorMixerTab.configTitle', { count: motors.length })}
                  </h3>
                  <p className="text-sm text-emerald-200/60">
                    {t(Object.entries(MOTOR_PRESETS).find(([, p]) =>
                      p.motors.length === motors.length &&
                      motors.every((m, i) =>
                        Math.abs(m.throttle - p.motors[i]!.throttle) < 0.01 &&
                        Math.abs(m.roll - p.motors[i]!.roll) < 0.01 &&
                        Math.abs(m.pitch - p.motors[i]!.pitch) < 0.01 &&
                        Math.abs(m.yaw - p.motors[i]!.yaw) < 0.01
                      )
                    )?.[1]?.nameKey ?? 'parameters:motorMixerTab.customConfig')}
                  </p>
                </div>
              </div>
              {dirty && (
                <span className="px-3 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-full">
                  {t('common:unsavedChanges')}
                </span>
              )}
            </div>
          </div>

          {/* Collapsible Advanced Section */}
          <div className="bg-surface rounded-xl border-subtle overflow-hidden">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface transition-colors"
            >
              <div className="flex items-center gap-2">
                <Cog className="w-4 h-4 text-content-secondary" />
                <span className="text-sm font-medium text-content">{t('parameters:motorMixerTab.advancedTitle')}</span>
                <span className="text-xs text-content-secondary">{t('parameters:motorMixerTab.advancedHint')}</span>
              </div>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-content-secondary" />
              ) : (
                <ChevronDown className="w-4 h-4 text-content-secondary" />
              )}
            </button>

            {showAdvanced && (
              <div className="p-4 border-t border-subtle space-y-4">
                {/* Info about direction inference */}
                <div className="flex items-start gap-2 p-3 bg-surface-raised rounded-lg text-xs text-content-secondary">
                  <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p>
                    <Trans i18nKey="parameters:motorMixerTab.rotationInfo" components={{ b: <span className="text-content font-medium" /> }} />
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {motors.map((motor) => {
                    // Infer rotation direction from mixing values:
                    // - For multirotors: negative roll = CCW, positive roll = CW
                    // - For airplanes (roll=0): positive yaw = CCW, negative yaw = CW
                    // - Default (single motor, no mixing): CW
                    let isCW = true;
                    if (Math.abs(motor.roll) > 0.01) {
                      isCW = motor.roll > 0;
                    } else if (Math.abs(motor.yaw) > 0.01) {
                      isCW = motor.yaw < 0;
                    }
                    const rotation = isCW ? 'cw' : 'ccw';

                    return (
                    <div
                      key={motor.index}
                      className={`bg-surface rounded-xl border overflow-hidden ${
                        isCW ? 'border-orange-500/30' : 'border-blue-500/30'
                      }`}
                    >
                      {/* Motor Header */}
                      <div className={`px-4 py-3 border-b flex items-center justify-between ${
                        isCW ? 'bg-orange-500/10 border-orange-500/20' : 'bg-blue-500/10 border-blue-500/20'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold ${
                            isCW
                              ? 'border-orange-500 bg-orange-500/30 text-orange-100'
                              : 'border-blue-500 bg-blue-500/30 text-blue-100'
                          }`}>
                            M{motor.index}
                          </div>
                          <div>
                            <h3 className="font-semibold text-content">{t('parameters:motorMixerTab.motorN', { n: motor.index })}</h3>
                            <div className={`flex items-center gap-1 text-xs ${
                              isCW ? 'text-orange-400' : 'text-blue-400'
                            }`}>
                              {isCW ? <RotateCw className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                              <span className="font-medium">{rotation.toUpperCase()}</span>
                              <span className="text-content-secondary ml-1">· {t('parameters:motorMixerTab.outputN', { n: motor.index + 1 })}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => removeMotor(motor.index)}
                          className="p-2 text-content-secondary hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Mix Bars */}
                      <div className="p-4 space-y-3">
                        <MixBar value={motor.throttle} color="#F59E0B" label={t('common:throttle')} />
                        <MixBar value={motor.roll} color="#EF4444" label={t('common:roll')} />
                        <MixBar value={motor.pitch} color="#22C55E" label={t('common:pitch')} />
                        <MixBar value={motor.yaw} color="#3B82F6" label={t('common:yaw')} />
                      </div>

                      {/* Edit Controls */}
                      <div className="px-4 pb-4 space-y-3 border-t border-subtle pt-3">
                        <CompactSlider
                          label={t('common:throttle')}
                          value={motor.throttle * 1000}
                          onChange={(v) => updateMotor(motor.index, { throttle: v / 1000 })}
                          min={0}
                          max={1000}
                          step={10}
                          formatValue={(v: number) => (v / 1000).toFixed(2)}
                        />
                        <CompactSlider
                          label={t('common:roll')}
                          value={(motor.roll + 1) * 500}
                          onChange={(v) => updateMotor(motor.index, { roll: (v / 500) - 1 })}
                          min={0}
                          max={1000}
                          step={10}
                          formatValue={(v: number) => ((v / 500) - 1).toFixed(2)}
                        />
                        <CompactSlider
                          label={t('common:pitch')}
                          value={(motor.pitch + 1) * 500}
                          onChange={(v) => updateMotor(motor.index, { pitch: (v / 500) - 1 })}
                          min={0}
                          max={1000}
                          step={10}
                          formatValue={(v: number) => ((v / 500) - 1).toFixed(2)}
                        />
                        <CompactSlider
                          label={t('common:yaw')}
                          value={(motor.yaw + 1) * 500}
                          onChange={(v) => updateMotor(motor.index, { yaw: (v / 500) - 1 })}
                          min={0}
                          max={1000}
                          step={10}
                          formatValue={(v: number) => ((v / 500) - 1).toFixed(2)}
                        />
                      </div>
                    </div>
                    );
                  })}
                </div>

                {/* Add Motor Button */}
                {motors.length < MAX_MOTORS && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={addMotor}
                      className="px-4 py-2 bg-surface-raised hover:bg-surface-raised text-content rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      {t('parameters:motorMixerTab.addMotor', { n: motors.length, max: MAX_MOTORS })}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Legend */}
      <div className="bg-surface rounded-xl border-subtle p-4">
        <h4 className="font-medium text-content mb-3">{t('parameters:motorMixerTab.legendTitle')}</h4>
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full border-2 border-orange-500 bg-orange-500/30 flex items-center justify-center">
              <span className="text-[10px] font-bold text-orange-100">0</span>
            </div>
            <div className="flex items-center gap-1 text-orange-400">
              <RotateCw className="w-3.5 h-3.5" />
              <span className="font-medium">CW</span>{/* i18n-exempt */}
            </div>
            <span className="text-content-secondary">{t('parameters:motorMixerTab.clockwise')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full border-2 border-blue-500 bg-blue-500/30 flex items-center justify-center">
              <span className="text-[10px] font-bold text-blue-100">1</span>
            </div>
            <div className="flex items-center gap-1 text-blue-400">
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="font-medium">CCW</span>{/* i18n-exempt */}
            </div>
            <span className="text-content-secondary">{t('parameters:motorMixerTab.counterClockwise')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent border-b-emerald-500" />
            <span className="text-emerald-400 font-medium">{t('parameters:motorMixerTab.front')}</span>
            <span className="text-content-secondary">{t('parameters:motorMixerTab.frontOfAircraft')}</span>
          </div>
        </div>
        <p className="text-xs text-content-secondary mt-3">
          {t('parameters:motorMixerTab.legendHint')}
        </p>
      </div>
    </div>
  );
}
