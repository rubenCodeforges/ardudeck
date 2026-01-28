/**
 * Safety Tab - Unified Safety & Failsafe Configuration
 *
 * Combines all safety-related features in one place:
 * - Failsafe behavior (what happens when signal is lost)
 * - GPS Rescue (Betaflight RTH) or Navigation link (iNav)
 * - Receiver & Arming settings (iNav)
 *
 * Clean, modern UI with collapsible sections.
 */

import { useState, useEffect, useCallback } from 'react';
import { DraggableSlider } from '../ui/DraggableSlider';
import {
  Shield,
  AlertTriangle,
  RefreshCw,
  Lock,
  Zap,
  Save,
  Radio,
  Home,
  ChevronDown,
  Settings,
  Satellite,
  Gauge,
  ArrowUp,
  ArrowDown,
  Info,
  Check,
  X,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connection-store';

// ============================================================================
// Types & Constants
// ============================================================================

// Failsafe procedures
const FAILSAFE_PROCEDURES = [
  { value: 0, label: 'Land', icon: '🛬', description: 'Land in place', color: 'amber' },
  { value: 1, label: 'Drop', icon: '⚠️', description: 'Cut motors (dangerous!)', color: 'red' },
  { value: 2, label: 'RTH', icon: '🏠', description: 'Return to home', color: 'green' },
  { value: 3, label: 'None', icon: '🚫', description: 'Keep flying', color: 'gray' },
] as const;

// Receiver types
const RECEIVER_TYPES = [
  { value: 'NONE', label: 'None', icon: '🚫' },
  { value: 'SERIAL', label: 'Serial', icon: '📡' },
  { value: 'MSP', label: 'MSP', icon: '💻' },
  { value: 'SIM (SITL)', label: 'SITL', icon: '🎮' },
] as const;

// GPS Rescue altitude modes
const ALTITUDE_MODES = [
  { value: 0, label: 'Maximum', description: 'Higher of current or set altitude' },
  { value: 1, label: 'Fixed', description: 'Always climb to set altitude' },
  { value: 2, label: 'Current', description: 'Use current altitude' },
] as const;

// Sanity check options
const SANITY_CHECKS = [
  { value: 0, label: 'Off', description: 'No safety checks' },
  { value: 1, label: 'Flyaway', description: 'Detect flyaways only' },
  { value: 2, label: 'All', description: 'All checks (recommended)' },
] as const;

// Interfaces
interface FailsafeConfig {
  failsafeDelay: number;
  failsafeOffDelay: number;
  failsafeThrottle: number;
  failsafeKillSwitch: number;
  failsafeThrottleLowDelay: number;
  failsafeProcedure: number;
  failsafeRecoveryDelay: number;
  failsafeFwRollAngle: number;
  failsafeFwPitchAngle: number;
  failsafeFwYawRate: number;
  failsafeStickMotionThreshold: number;
  failsafeMinDistance: number;
  failsafeMinDistanceProcedure: number;
}

interface ArmingSafetyConfig {
  receiverType: string;
  navExtraArmingSafety: string;
  navGpsMinSats: number;
}

interface GpsRescueConfig {
  angle: number;
  initialAltitudeM: number;
  descentDistanceM: number;
  rescueGroundspeed: number;
  throttleMin: number;
  throttleMax: number;
  throttleHover: number;
  sanityChecks: number;
  minSats: number;
  ascendRate: number;
  descendRate: number;
  allowArmingWithoutFix: number;
  altitudeMode: number;
  minRescueDth: number;
  targetLandingAltitudeM: number;
}

interface GpsRescuePids {
  throttleP: number;
  throttleI: number;
  throttleD: number;
  velP: number;
  velI: number;
  velD: number;
  yawP: number;
}

// Defaults
const DEFAULT_FAILSAFE: FailsafeConfig = {
  failsafeDelay: 5,
  failsafeOffDelay: 10,
  failsafeThrottle: 1000,
  failsafeKillSwitch: 0,
  failsafeThrottleLowDelay: 100,
  failsafeProcedure: 2,
  failsafeRecoveryDelay: 5,
  failsafeFwRollAngle: 0,
  failsafeFwPitchAngle: 0,
  failsafeFwYawRate: 0,
  failsafeStickMotionThreshold: 50,
  failsafeMinDistance: 0,
  failsafeMinDistanceProcedure: 0,
};

const DEFAULT_ARMING: ArmingSafetyConfig = {
  receiverType: 'SERIAL',
  navExtraArmingSafety: 'ON',
  navGpsMinSats: 6,
};

const DEFAULT_GPS_RESCUE: GpsRescueConfig = {
  angle: 300,
  initialAltitudeM: 30,
  descentDistanceM: 20,
  rescueGroundspeed: 750,
  throttleMin: 1100,
  throttleMax: 1700,
  throttleHover: 1280,
  sanityChecks: 2,
  minSats: 8,
  ascendRate: 500,
  descendRate: 150,
  allowArmingWithoutFix: 0,
  altitudeMode: 0,
  minRescueDth: 30,
  targetLandingAltitudeM: 5,
};

const DEFAULT_GPS_PIDS: GpsRescuePids = {
  throttleP: 15,
  throttleI: 15,
  throttleD: 20,
  velP: 8,
  velI: 40,
  velD: 12,
  yawP: 40,
};

// ============================================================================
// Collapsible Section Component
// ============================================================================

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  color: string;
  defaultOpen?: boolean;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}

function Section({ title, icon, color, defaultOpen = false, badge, badgeColor, children }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/30">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-5 py-4 flex items-center gap-3 hover:bg-zinc-800/30 transition-colors`}
      >
        <div className={`w-10 h-10 rounded-lg bg-${color}-500/20 flex items-center justify-center`}>
          {icon}
        </div>
        <span className="flex-1 text-left font-medium text-zinc-100">{title}</span>
        {badge && (
          <span className={`px-2 py-0.5 text-xs rounded-full bg-${badgeColor || color}-500/20 text-${badgeColor || color}-400`}>
            {badge}
          </span>
        )}
        <ChevronDown
          className={`w-5 h-5 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-5 pb-5 border-t border-zinc-800/50">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface Props {
  isInav: boolean;
}

export default function SafetyTab({ isInav }: Props) {
  // Connection state
  const connectionState = useConnectionStore((state) => state.connectionState);
  const isSitl = connectionState?.isSitl ?? false;

  // Failsafe state
  const [failsafe, setFailsafe] = useState<FailsafeConfig>(DEFAULT_FAILSAFE);
  const [originalFailsafe, setOriginalFailsafe] = useState<FailsafeConfig>(DEFAULT_FAILSAFE);

  // Arming safety state (iNav)
  const [arming, setArming] = useState<ArmingSafetyConfig>(DEFAULT_ARMING);
  const [originalArming, setOriginalArming] = useState<ArmingSafetyConfig>(DEFAULT_ARMING);

  // GPS Rescue state (Betaflight)
  const [gpsRescue, setGpsRescue] = useState<GpsRescueConfig>(DEFAULT_GPS_RESCUE);
  const [originalGpsRescue, setOriginalGpsRescue] = useState<GpsRescueConfig>(DEFAULT_GPS_RESCUE);
  const [gpsPids, setGpsPids] = useState<GpsRescuePids>(DEFAULT_GPS_PIDS);
  const [originalGpsPids, setOriginalGpsPids] = useState<GpsRescuePids>(DEFAULT_GPS_PIDS);
  const [showGpsPids, setShowGpsPids] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showRebootConfirm, setShowRebootConfirm] = useState(false);
  const [rebootTarget, setRebootTarget] = useState<'arming' | 'failsafe' | null>(null);

  // Check for changes
  const failsafeChanged = JSON.stringify(failsafe) !== JSON.stringify(originalFailsafe);
  const armingChanged = JSON.stringify(arming) !== JSON.stringify(originalArming);
  const gpsRescueChanged = JSON.stringify(gpsRescue) !== JSON.stringify(originalGpsRescue);
  const gpsPidsChanged = JSON.stringify(gpsPids) !== JSON.stringify(originalGpsPids);
  const hasChanges = failsafeChanged || armingChanged || gpsRescueChanged || gpsPidsChanged;

  // Load all configuration
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Load failsafe via MSP
      const failsafeConfig = await window.electronAPI.mspGetFailsafeConfig() as FailsafeConfig | null;
      if (failsafeConfig) {
        setFailsafe(failsafeConfig);
        setOriginalFailsafe(failsafeConfig);
      }

      // Load GPS Rescue for Betaflight
      if (!isInav) {
        const [rescueConfig, rescuePids] = await Promise.all([
          window.electronAPI.mspGetGpsRescue() as Promise<GpsRescueConfig | null>,
          window.electronAPI.mspGetGpsRescuePids() as Promise<GpsRescuePids | null>,
        ]);

        if (rescueConfig) {
          setGpsRescue(rescueConfig);
          setOriginalGpsRescue(rescueConfig);
        }
        if (rescuePids) {
          setGpsPids(rescuePids);
          setOriginalGpsPids(rescuePids);
        }
      }

      // Load arming safety for iNav
      if (isInav) {
        try {
          const settings = await window.electronAPI.mspGetSettings([
            'receiver_type',
            'nav_extra_arming_safety',
            'gps_min_sats',
          ]);

          if (settings?.['nav_extra_arming_safety'] !== null) {
            const safety: ArmingSafetyConfig = {
              receiverType: String(settings['receiver_type'] ?? 'SERIAL').toUpperCase(),
              navExtraArmingSafety: String(settings['nav_extra_arming_safety']).toUpperCase(),
              navGpsMinSats: Number(settings['gps_min_sats'] ?? 6),
            };
            setArming(safety);
            setOriginalArming(safety);
          }
        } catch {
          // Settings API not available, try CLI fallback for SITL
          if (isSitl) {
            try {
              await window.electronAPI.mspStopTelemetry();
              await new Promise(r => setTimeout(r, 200));
              const dump = await window.electronAPI.cliGetDump();

              const receiverMatch = dump.match(/set receiver_type\s*=\s*(.+?)$/im);
              const armingMatch = dump.match(/set nav_extra_arming_safety\s*=\s*(\S+)/i);
              const satsMatch = dump.match(/set gps_min_sats\s*=\s*(\d+)/i);

              setArming({
                receiverType: receiverMatch?.[1]?.trim().toUpperCase() ?? 'SERIAL',
                navExtraArmingSafety: armingMatch?.[1]?.toUpperCase() ?? 'ON',
                navGpsMinSats: satsMatch ? parseInt(satsMatch[1], 10) : 6,
              });
              setOriginalArming({
                receiverType: receiverMatch?.[1]?.trim().toUpperCase() ?? 'SERIAL',
                navExtraArmingSafety: armingMatch?.[1]?.toUpperCase() ?? 'ON',
                navGpsMinSats: satsMatch ? parseInt(satsMatch[1], 10) : 6,
              });

              await new Promise(r => setTimeout(r, 500));
              await window.electronAPI.mspStartTelemetry();
            } catch {
              // Ignore
              try { await window.electronAPI.mspStartTelemetry(); } catch { /* ignore */ }
            }
          }
        }
      }
    } catch (err) {
      console.error('[SafetyTab] Failed to load:', err);
      setError('Failed to load safety configuration');
    } finally {
      setLoading(false);
    }
  }, [isInav, isSitl]);

  // Save all changes
  const saveAll = async () => {
    // Check if reboot is needed (arming changes on SITL, or failsafe on SITL)
    if (isSitl && (armingChanged || failsafeChanged)) {
      setRebootTarget(armingChanged ? 'arming' : 'failsafe');
      setShowRebootConfirm(true);
      return;
    }

    await doSave();
  };

  const doSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Save failsafe
      if (failsafeChanged) {
        if (isSitl) {
          // CLI path for SITL
          await window.electronAPI.mspStopTelemetry();
          await new Promise(r => setTimeout(r, 200));
          await window.electronAPI.cliEnterMode();
          await new Promise(r => setTimeout(r, 300));

          await window.electronAPI.cliSendCommand(`set failsafe_delay = ${failsafe.failsafeDelay}`);
          await new Promise(r => setTimeout(r, 100));
          await window.electronAPI.cliSendCommand(`set failsafe_off_delay = ${failsafe.failsafeOffDelay}`);
          await new Promise(r => setTimeout(r, 100));
          await window.electronAPI.cliSendCommand(`set failsafe_throttle = ${failsafe.failsafeThrottle}`);
          await new Promise(r => setTimeout(r, 100));
          await window.electronAPI.cliSendCommand(`set failsafe_procedure = ${['LAND', 'DROP', 'RTH', 'NONE'][failsafe.failsafeProcedure]}`);
          await new Promise(r => setTimeout(r, 100));
          await window.electronAPI.cliSendCommand('save');

          setOriginalFailsafe({ ...failsafe });
          setSuccess('Settings saved! Board is rebooting...');
          await new Promise(r => setTimeout(r, 3000));
          await window.electronAPI.disconnect();
          return;
        } else {
          const result = await window.electronAPI.mspSetFailsafeConfig(failsafe);
          if (!result) throw new Error('Failed to save failsafe');
        }
      }

      // Save GPS Rescue (Betaflight)
      if (!isInav && gpsRescueChanged) {
        const result = await window.electronAPI.mspSetGpsRescue(gpsRescue);
        if (!result) throw new Error('Failed to save GPS Rescue');
      }

      if (!isInav && gpsPidsChanged) {
        const result = await window.electronAPI.mspSetGpsRescuePids(gpsPids);
        if (!result) throw new Error('Failed to save GPS Rescue PIDs');
      }

      // Save arming safety (iNav)
      if (isInav && armingChanged) {
        if (!isSitl) {
          const result = await window.electronAPI.mspSetSettings({
            'receiver_type': arming.receiverType,
            'nav_extra_arming_safety': arming.navExtraArmingSafety,
            'gps_min_sats': arming.navGpsMinSats,
          });
          if (!result) throw new Error('Failed to save arming settings');
        } else {
          // CLI path for SITL arming settings
          await window.electronAPI.mspStopTelemetry();
          await new Promise(r => setTimeout(r, 200));
          await window.electronAPI.cliEnterMode();
          await new Promise(r => setTimeout(r, 300));

          await window.electronAPI.cliSendCommand(`set receiver_type = ${arming.receiverType}`);
          await new Promise(r => setTimeout(r, 100));
          await window.electronAPI.cliSendCommand(`set nav_extra_arming_safety = ${arming.navExtraArmingSafety}`);
          await new Promise(r => setTimeout(r, 100));
          await window.electronAPI.cliSendCommand(`set gps_min_sats = ${arming.navGpsMinSats}`);
          await new Promise(r => setTimeout(r, 100));
          await window.electronAPI.cliSendCommand('save');

          setOriginalArming({ ...arming });
          setSuccess('Settings saved! Board is rebooting...');
          await new Promise(r => setTimeout(r, 3000));
          await window.electronAPI.disconnect();
          return;
        }
      }

      // Save to EEPROM
      await window.electronAPI.mspSaveEeprom();

      // Update originals
      setOriginalFailsafe({ ...failsafe });
      setOriginalGpsRescue({ ...gpsRescue });
      setOriginalGpsPids({ ...gpsPids });
      setOriginalArming({ ...arming });

      setSuccess('All safety settings saved!');
    } catch (err) {
      console.error('[SafetyTab] Save failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings');
      try { await window.electronAPI.mspStartTelemetry(); } catch { /* ignore */ }
    } finally {
      setSaving(false);
    }
  };

  // Load on mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Clear messages after delay
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-zinc-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading safety configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-red-500/20 flex items-center justify-center">
            <Shield className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">Safety & Failsafe</h2>
            <p className="text-sm text-zinc-500">Configure emergency behaviors and arming safety</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadConfig}
            disabled={loading}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={saveAll}
            disabled={saving || !hasChanges}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${
              hasChanges
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <Save className={`w-4 h-4 ${saving ? 'animate-pulse' : ''}`} />
            {saving ? 'Saving...' : 'Save All'}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-500/20 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400">
          <Check className="w-5 h-5 shrink-0" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* Failsafe Section */}
      <Section
        title="Failsafe Behavior"
        icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
        color="amber"
        defaultOpen={true}
        badge={failsafeChanged ? 'Modified' : undefined}
        badgeColor="yellow"
      >
        <div className="mt-4 space-y-6">
          {/* Procedure Selection - Visual Cards */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-3">
              What should happen when signal is lost?
            </label>
            <div className="grid grid-cols-4 gap-2">
              {FAILSAFE_PROCEDURES.map((proc) => {
                const isSelected = failsafe.failsafeProcedure === proc.value;
                return (
                  <button
                    key={proc.value}
                    onClick={() => setFailsafe(prev => ({ ...prev, failsafeProcedure: proc.value }))}
                    className={`p-4 rounded-xl border-2 transition-all text-center ${
                      isSelected
                        ? proc.color === 'red'
                          ? 'bg-red-500/20 border-red-500 text-white'
                          : proc.color === 'green'
                          ? 'bg-green-500/20 border-green-500 text-white'
                          : proc.color === 'amber'
                          ? 'bg-amber-500/20 border-amber-500 text-white'
                          : 'bg-zinc-700/50 border-zinc-500 text-white'
                        : 'bg-zinc-800/30 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800/50 hover:border-zinc-600'
                    }`}
                  >
                    <div className="text-2xl mb-1">{proc.icon}</div>
                    <div className="font-medium text-sm">{proc.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{proc.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timing Sliders */}
          <div className="grid grid-cols-2 gap-4">
            <DraggableSlider
              label="Activation Delay"
              value={failsafe.failsafeDelay}
              onChange={(v) => setFailsafe(prev => ({ ...prev, failsafeDelay: v }))}
              min={0}
              max={50}
              step={1}
              unit="×0.1s"
              color="#F59E0B"
              hint={`${(failsafe.failsafeDelay / 10).toFixed(1)}s before failsafe triggers`}
            />
            <DraggableSlider
              label="Recovery Delay"
              value={failsafe.failsafeOffDelay}
              onChange={(v) => setFailsafe(prev => ({ ...prev, failsafeOffDelay: v }))}
              min={0}
              max={200}
              step={1}
              unit="×0.1s"
              color="#10B981"
              hint={`${(failsafe.failsafeOffDelay / 10).toFixed(1)}s after signal recovery`}
            />
          </div>

          <DraggableSlider
            label="Failsafe Throttle"
            value={failsafe.failsafeThrottle}
            onChange={(v) => setFailsafe(prev => ({ ...prev, failsafeThrottle: v }))}
            min={1000}
            max={2000}
            step={10}
            unit="µs"
            color="#6366F1"
            hint="Throttle value during land/drop"
          />

          {/* Min Distance for RTH */}
          {isInav && failsafe.failsafeProcedure === 2 && (
            <DraggableSlider
              label="Minimum RTH Distance"
              value={failsafe.failsafeMinDistance}
              onChange={(v) => setFailsafe(prev => ({ ...prev, failsafeMinDistance: v }))}
              min={0}
              max={1000}
              step={10}
              unit="m"
              color="#8B5CF6"
              hint="Distance below which RTH won't trigger (0 = always RTH)"
            />
          )}
        </div>
      </Section>

      {/* GPS Rescue Section (Betaflight only) */}
      {!isInav && (
        <Section
          title="GPS Rescue (Return to Home)"
          icon={<Home className="w-5 h-5 text-green-400" />}
          color="green"
          defaultOpen={false}
          badge={gpsRescueChanged || gpsPidsChanged ? 'Modified' : undefined}
          badgeColor="green"
        >
          <div className="mt-4 space-y-6">
            {/* Info Banner */}
            <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-200/80">
                GPS Rescue automatically flies your quad back home when activated via failsafe or a switch.
                Configure the <strong>GPS_RESCUE</strong> mode in the Modes tab to enable switch activation.
              </p>
            </div>

            {/* Altitude & Speed */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <ArrowUp className="w-4 h-4 text-blue-400" />
                  Altitude & Climb
                </h4>
                <DraggableSlider
                  label="Rescue Altitude"
                  value={gpsRescue.initialAltitudeM}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, initialAltitudeM: v }))}
                  min={20}
                  max={200}
                  step={5}
                  unit="m"
                  color="#3B82F6"
                />
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-400 w-28">Altitude Mode</span>
                  <select
                    value={gpsRescue.altitudeMode}
                    onChange={(e) => setGpsRescue(prev => ({ ...prev, altitudeMode: parseInt(e.target.value) }))}
                    className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
                  >
                    {ALTITUDE_MODES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <DraggableSlider
                  label="Ascend Rate"
                  value={gpsRescue.ascendRate}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, ascendRate: v }))}
                  min={100}
                  max={1000}
                  step={25}
                  unit="cm/s"
                  color="#6366F1"
                  hint={`${(gpsRescue.ascendRate / 100).toFixed(1)} m/s`}
                />
              </div>
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <ArrowDown className="w-4 h-4 text-orange-400" />
                  Return & Descent
                </h4>
                <DraggableSlider
                  label="Return Speed"
                  value={gpsRescue.rescueGroundspeed}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, rescueGroundspeed: v }))}
                  min={100}
                  max={3000}
                  step={50}
                  unit="cm/s"
                  color="#10B981"
                  hint={`${(gpsRescue.rescueGroundspeed / 100).toFixed(1)} m/s`}
                />
                <DraggableSlider
                  label="Descend Rate"
                  value={gpsRescue.descendRate}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, descendRate: v }))}
                  min={50}
                  max={500}
                  step={25}
                  unit="cm/s"
                  color="#8B5CF6"
                  hint={`${(gpsRescue.descendRate / 100).toFixed(1)} m/s`}
                />
                <DraggableSlider
                  label="Descent Distance"
                  value={gpsRescue.descentDistanceM}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, descentDistanceM: v }))}
                  min={5}
                  max={100}
                  step={5}
                  unit="m"
                  color="#F59E0B"
                />
              </div>
            </div>

            {/* Throttle Settings */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-orange-400" />
                Throttle Limits
              </h4>
              <div className="grid grid-cols-3 gap-4">
                <DraggableSlider
                  label="Min"
                  value={gpsRescue.throttleMin}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, throttleMin: v }))}
                  min={1000}
                  max={1500}
                  step={10}
                  color="#EF4444"
                />
                <DraggableSlider
                  label="Hover"
                  value={gpsRescue.throttleHover}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, throttleHover: v }))}
                  min={1000}
                  max={2000}
                  step={10}
                  color="#F59E0B"
                />
                <DraggableSlider
                  label="Max"
                  value={gpsRescue.throttleMax}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, throttleMax: v }))}
                  min={1500}
                  max={2000}
                  step={10}
                  color="#22C55E"
                />
              </div>
            </div>

            {/* GPS & Safety */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Satellite className="w-4 h-4 text-cyan-400" />
                  GPS Requirements
                </h4>
                <DraggableSlider
                  label="Min Satellites"
                  value={gpsRescue.minSats}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, minSats: v }))}
                  min={5}
                  max={20}
                  color="#06B6D4"
                />
                <DraggableSlider
                  label="Min Distance"
                  value={gpsRescue.minRescueDth}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, minRescueDth: v }))}
                  min={10}
                  max={200}
                  step={5}
                  unit="m"
                  color="#8B5CF6"
                  hint="Rescue won't activate closer"
                />
              </div>
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  Safety Checks
                </h4>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-400 w-24">Sanity</span>
                  <select
                    value={gpsRescue.sanityChecks}
                    onChange={(e) => setGpsRescue(prev => ({ ...prev, sanityChecks: parseInt(e.target.value) }))}
                    className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
                  >
                    {SANITY_CHECKS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setGpsRescue(prev => ({ ...prev, allowArmingWithoutFix: prev.allowArmingWithoutFix ? 0 : 1 }))}
                  className={`w-full px-4 py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all border ${
                    gpsRescue.allowArmingWithoutFix
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  }`}
                >
                  {gpsRescue.allowArmingWithoutFix ? (
                    <>
                      <AlertTriangle className="w-4 h-4" />
                      Arm Without GPS Fix
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      Require GPS Fix to Arm
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Advanced PIDs Toggle */}
            <button
              onClick={() => setShowGpsPids(!showGpsPids)}
              className="w-full px-4 py-3 flex items-center justify-between bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-zinc-300">GPS Rescue PIDs</span>
                <span className="text-xs text-zinc-500">(Advanced)</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${showGpsPids ? 'rotate-180' : ''}`} />
            </button>

            {showGpsPids && (
              <div className="grid grid-cols-3 gap-6 p-4 bg-zinc-800/30 rounded-lg">
                <div className="space-y-3">
                  <h5 className="text-xs font-medium text-orange-400">Throttle</h5>
                  <DraggableSlider label="P" value={gpsPids.throttleP} onChange={(v) => setGpsPids(prev => ({ ...prev, throttleP: v }))} min={0} max={200} color="#F97316" />
                  <DraggableSlider label="I" value={gpsPids.throttleI} onChange={(v) => setGpsPids(prev => ({ ...prev, throttleI: v }))} min={0} max={200} color="#FB923C" />
                  <DraggableSlider label="D" value={gpsPids.throttleD} onChange={(v) => setGpsPids(prev => ({ ...prev, throttleD: v }))} min={0} max={200} color="#FDBA74" />
                </div>
                <div className="space-y-3">
                  <h5 className="text-xs font-medium text-blue-400">Velocity</h5>
                  <DraggableSlider label="P" value={gpsPids.velP} onChange={(v) => setGpsPids(prev => ({ ...prev, velP: v }))} min={0} max={200} color="#3B82F6" />
                  <DraggableSlider label="I" value={gpsPids.velI} onChange={(v) => setGpsPids(prev => ({ ...prev, velI: v }))} min={0} max={200} color="#60A5FA" />
                  <DraggableSlider label="D" value={gpsPids.velD} onChange={(v) => setGpsPids(prev => ({ ...prev, velD: v }))} min={0} max={200} color="#93C5FD" />
                </div>
                <div className="space-y-3">
                  <h5 className="text-xs font-medium text-green-400">Yaw</h5>
                  <DraggableSlider label="P" value={gpsPids.yawP} onChange={(v) => setGpsPids(prev => ({ ...prev, yawP: v }))} min={0} max={200} color="#22C55E" />
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Receiver & Arming Section (iNav only) */}
      {isInav && (
        <Section
          title="Receiver & Arming Safety"
          icon={<Radio className="w-5 h-5 text-purple-400" />}
          color="purple"
          defaultOpen={false}
          badge={armingChanged ? 'Modified' : undefined}
          badgeColor="purple"
        >
          <div className="mt-4 space-y-6">
            {/* Receiver Type - Visual Selection */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-3">Receiver Type</label>
              <div className="grid grid-cols-4 gap-2">
                {RECEIVER_TYPES.map((type) => {
                  const isSelected = arming.receiverType === type.value;
                  return (
                    <button
                      key={type.value}
                      onClick={() => setArming(prev => ({ ...prev, receiverType: type.value }))}
                      className={`p-4 rounded-xl border-2 transition-all text-center ${
                        isSelected
                          ? 'bg-purple-500/20 border-purple-500 text-white'
                          : 'bg-zinc-800/30 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800/50 hover:border-zinc-600'
                      }`}
                    >
                      <div className="text-2xl mb-1">{type.icon}</div>
                      <div className="font-medium text-sm">{type.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Arming Safety */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-3">Navigation Arming Safety</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setArming(prev => ({ ...prev, navExtraArmingSafety: 'ON' }))}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    arming.navExtraArmingSafety === 'ON'
                      ? 'bg-green-500/20 border-green-500 text-white'
                      : 'bg-zinc-800/30 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Lock className="w-5 h-5" />
                    <span className="font-medium">Enabled</span>
                  </div>
                  <p className="text-xs opacity-70">Require GPS fix & safe conditions to arm</p>
                </button>
                <button
                  onClick={() => setArming(prev => ({ ...prev, navExtraArmingSafety: 'ALLOW_BYPASS' }))}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    arming.navExtraArmingSafety === 'ALLOW_BYPASS'
                      ? 'bg-amber-500/20 border-amber-500 text-white'
                      : 'bg-zinc-800/30 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-5 h-5" />
                    <span className="font-medium">Allow Bypass</span>
                  </div>
                  <p className="text-xs opacity-70">Can bypass with stick commands (SITL/testing)</p>
                </button>
              </div>
            </div>

            {arming.navExtraArmingSafety === 'ALLOW_BYPASS' && (
              <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200/80">
                  <strong>Bypass Mode:</strong> Stick commands can override safety checks. Only use for SITL
                  testing or indoor flights without GPS.
                </p>
              </div>
            )}

            {/* GPS Satellites */}
            <DraggableSlider
              label="Minimum GPS Satellites"
              value={arming.navGpsMinSats}
              onChange={(v) => setArming(prev => ({ ...prev, navGpsMinSats: v }))}
              min={0}
              max={12}
              color="#A855F7"
              hint="Required for arming (0 = no GPS needed)"
            />
          </div>
        </Section>
      )}

      {/* iNav Navigation Note */}
      {isInav && (
        <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <Home className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-300">Return to Home</h4>
            <p className="text-sm text-blue-200/70 mt-1">
              iNav's advanced navigation features (RTH, waypoints, position hold) are configured in the{' '}
              <strong>Navigation</strong> tab. The failsafe RTH option above uses those settings.
            </p>
          </div>
        </div>
      )}

      {/* Reboot Confirmation Dialog */}
      {showRebootConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-500/20 rounded-full">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">Reboot Required</h3>
            </div>
            <p className="text-zinc-300 mb-4">
              Saving {rebootTarget === 'arming' ? 'receiver/arming' : 'failsafe'} settings on SITL requires
              a reboot.
            </p>
            <p className="text-zinc-400 text-sm mb-6">
              You'll be disconnected. Reconnect after ~3 seconds when SITL restarts.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRebootConfirm(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRebootConfirm(false);
                  doSave();
                }}
                className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
              >
                Save & Reboot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
