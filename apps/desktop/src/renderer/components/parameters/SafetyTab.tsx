/**
 * Safety Tab - Failsafe and Arming Safety Configuration
 *
 * Provides a user-friendly interface for configuring:
 * - Failsafe behavior (procedure, delays, throttle) via MSP
 * - Arming safety settings (uses CLI for compatibility - isolated)
 *
 * IMPORTANT: Failsafe config uses MSP_FAILSAFE_CONFIG (75/76) to avoid
 * the disconnect issues that CLI dump caused previously.
 */

import { useState, useEffect, useCallback } from 'react';
import { DraggableSlider } from '../ui/DraggableSlider';
import { Shield, AlertTriangle, RefreshCw, Lock, Zap, Save, Radio } from 'lucide-react';
import { useConnectionStore } from '../../stores/connection-store';

// Receiver types - includes SIM for SITL
// NOTE: Values must match EXACTLY what iNav CLI expects (including spaces and parentheses!)
const RECEIVER_TYPES = [
  { value: 'NONE', label: 'None', description: 'No receiver' },
  { value: 'SERIAL', label: 'Serial', description: 'Serial RX (SBUS, IBUS, CRSF, etc.)' },
  { value: 'MSP', label: 'MSP', description: 'Control via GCS/MSP' },
  { value: 'SIM (SITL)', label: 'SIM (SITL)', description: 'Simulated receiver for SITL testing' },
];

// Failsafe procedures (matches MSP values)
// 0=LAND, 1=DROP, 2=RTH, 3=NONE
const FAILSAFE_PROCEDURES = [
  { value: 0, label: 'Land', description: 'Attempt to land in place' },
  { value: 1, label: 'Drop', description: 'Cut motors immediately (dangerous!)' },
  { value: 2, label: 'RTH', description: 'Return to home position (recommended)' },
  { value: 3, label: 'None', description: 'Do nothing (keep flying)' },
];

// Navigation arming safety options (iNav)
// Note: iNav 9.0+ only supports ON and ALLOW_BYPASS (no OFF option)
const NAV_ARMING_SAFETY_OPTIONS = [
  { value: 'ON', label: 'On', description: 'Require GPS fix and safe conditions to arm' },
  { value: 'ALLOW_BYPASS', label: 'Bypass', description: 'Can bypass safety checks (for SITL/testing)' },
];

// MSP Failsafe Config structure (matches msp-ts MSPFailsafeConfig)
interface FailsafeConfig {
  failsafeDelay: number;              // 0.1s units
  failsafeOffDelay: number;           // 0.1s units
  failsafeThrottle: number;           // 1000-2000
  failsafeKillSwitch: number;         // 0=off, 1=on
  failsafeThrottleLowDelay: number;   // 0.1s units
  failsafeProcedure: number;          // 0=LAND, 1=DROP, 2=RTH, 3=NONE
  failsafeRecoveryDelay: number;      // 0.1s units
  failsafeFwRollAngle: number;        // 0.1 deg
  failsafeFwPitchAngle: number;       // 0.1 deg
  failsafeFwYawRate: number;          // deg/s
  failsafeStickMotionThreshold: number; // threshold value
  failsafeMinDistance: number;        // meters
  failsafeMinDistanceProcedure: number; // 0=LAND, 1=DROP, 2=RTH, 3=NONE
}

// Arming safety config (separate from MSP, uses CLI)
interface ArmingSafetyConfig {
  receiverType: string;         // NONE, SERIAL, MSP, SIM
  navExtraArmingSafety: string; // ON, ALLOW_BYPASS
  navGpsMinSats: number;        // Minimum satellites for arming
}

const DEFAULT_FAILSAFE: FailsafeConfig = {
  failsafeDelay: 5,
  failsafeOffDelay: 10,
  failsafeThrottle: 1000,
  failsafeKillSwitch: 0,
  failsafeThrottleLowDelay: 100,
  failsafeProcedure: 2, // RTH
  failsafeRecoveryDelay: 5,
  failsafeFwRollAngle: 0,
  failsafeFwPitchAngle: 0,
  failsafeFwYawRate: 0,
  failsafeStickMotionThreshold: 50,
  failsafeMinDistance: 0,
  failsafeMinDistanceProcedure: 0,
};

const DEFAULT_ARMING_SAFETY: ArmingSafetyConfig = {
  receiverType: 'SERIAL',
  navExtraArmingSafety: 'ON',
  navGpsMinSats: 6,
};

interface Props {
  isInav: boolean;
}

export default function SafetyTab({ isInav }: Props) {
  // Check if connected to SITL (needs CLI for everything)
  const connectionState = useConnectionStore((state) => state.connectionState);
  const isSitl = connectionState?.isSitl ?? false;

  // Failsafe config (via MSP, or CLI for SITL)
  const [failsafe, setFailsafe] = useState<FailsafeConfig>(DEFAULT_FAILSAFE);
  const [originalFailsafe, setOriginalFailsafe] = useState<FailsafeConfig>(DEFAULT_FAILSAFE);

  // Arming safety config (via CLI - separate)
  const [armingSafety, setArmingSafety] = useState<ArmingSafetyConfig>(DEFAULT_ARMING_SAFETY);
  const [originalArmingSafety, setOriginalArmingSafety] = useState<ArmingSafetyConfig>(DEFAULT_ARMING_SAFETY);

  // Loading/error states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Arming safety apply state
  const [applyingArmingSafety, setApplyingArmingSafety] = useState(false);
  const [showRebootConfirm, setShowRebootConfirm] = useState(false);
  const [showFailsafeRebootConfirm, setShowFailsafeRebootConfirm] = useState(false);

  // Check if failsafe has been modified
  const failsafeChanged = JSON.stringify(failsafe) !== JSON.stringify(originalFailsafe);

  // Check if arming safety has been modified
  const armingSafetyChanged =
    armingSafety.receiverType !== originalArmingSafety.receiverType ||
    armingSafety.navExtraArmingSafety !== originalArmingSafety.navExtraArmingSafety ||
    armingSafety.navGpsMinSats !== originalArmingSafety.navGpsMinSats;

  // Load failsafe config via MSP (no CLI!)
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Load failsafe config via MSP
      const config = await window.electronAPI.mspGetFailsafeConfig() as FailsafeConfig | null;

      if (config) {
        console.log('[SafetyTab] Loaded failsafe config via MSP:', config);
        setFailsafe(config);
        setOriginalFailsafe(config);
      } else {
        console.warn('[SafetyTab] Failed to get failsafe config, using defaults');
      }

      // For arming safety, we use the MSP Settings API if available
      // Falls back to CLI for SITL which doesn't support Settings API
      if (isInav) {
        let settingsLoaded = false;

        // Try MSP Settings API first
        try {
          const settings = await window.electronAPI.mspGetSettings([
            'receiver_type',
            'nav_extra_arming_safety',
            'gps_min_sats',
          ]);

          if (settings && settings['nav_extra_arming_safety'] !== null) {
            const safety: ArmingSafetyConfig = {
              receiverType: String(settings['receiver_type'] ?? 'SERIAL').toUpperCase(),
              navExtraArmingSafety: String(settings['nav_extra_arming_safety']).toUpperCase(),
              navGpsMinSats: Number(settings['gps_min_sats'] ?? 6),
            };
            console.log('[SafetyTab] Loaded arming safety via MSP Settings:', safety);
            setArmingSafety(safety);
            setOriginalArmingSafety(safety);
            settingsLoaded = true;
          }
        } catch (settingsErr) {
          console.warn('[SafetyTab] MSP Settings API failed, trying CLI fallback:', settingsErr);
        }

        // CLI fallback for SITL
        if (!settingsLoaded) {
          try {
            // Quick CLI read - just get these two settings
            await window.electronAPI.mspStopTelemetry();
            await new Promise(r => setTimeout(r, 200));

            const dump = await window.electronAPI.cliGetDump();

            // Parse settings from dump
            // Note: receiver_type can have spaces like "SIM (SITL)", so capture to end of line
            const receiverTypeMatch = dump.match(/set receiver_type\s*=\s*(.+?)$/im);
            const armingSafetyMatch = dump.match(/set nav_extra_arming_safety\s*=\s*(\S+)/i);
            const minSatsMatch = dump.match(/set gps_min_sats\s*=\s*(\d+)/i);

            const safety: ArmingSafetyConfig = {
              receiverType: receiverTypeMatch?.[1]?.trim().toUpperCase() ?? 'SERIAL',
              navExtraArmingSafety: armingSafetyMatch?.[1]?.toUpperCase() ?? 'ON',
              navGpsMinSats: minSatsMatch ? parseInt(minSatsMatch[1], 10) : 6,
            };
            console.log('[SafetyTab] Loaded arming safety via CLI:', safety);
            setArmingSafety(safety);
            setOriginalArmingSafety(safety);

            // Restart telemetry
            await new Promise(r => setTimeout(r, 500));
            await window.electronAPI.mspStartTelemetry();
          } catch (cliErr) {
            console.warn('[SafetyTab] CLI fallback failed, using defaults:', cliErr);
            // Try to restart telemetry anyway
            try {
              await window.electronAPI.mspStartTelemetry();
            } catch {
              // ignore
            }
          }
        }
      }
    } catch (err) {
      console.error('[SafetyTab] Failed to load config:', err);
      setError('Failed to load failsafe configuration');
    } finally {
      setLoading(false);
    }
  }, [isInav]);

  // Save failsafe config via MSP (or CLI for SITL)
  const saveFailsafe = async () => {
    // For SITL, show reboot confirmation since we'll use CLI save
    if (isSitl) {
      setShowFailsafeRebootConfirm(true);
      return;
    }

    await doSaveFailsafe();
  };

  // Actually save failsafe settings
  const doSaveFailsafe = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // For SITL, use CLI since MSP EEPROM write doesn't work reliably
      if (isSitl) {
        console.log('[SafetyTab] SITL detected, using CLI for failsafe...');

        // Stop telemetry
        await window.electronAPI.mspStopTelemetry();
        await new Promise((r) => setTimeout(r, 200));

        // Enter CLI
        await window.electronAPI.cliEnterMode();
        await new Promise((r) => setTimeout(r, 300));

        // Set failsafe settings via CLI
        await window.electronAPI.cliSendCommand(`set failsafe_delay = ${failsafe.failsafeDelay}`);
        await new Promise((r) => setTimeout(r, 100));
        await window.electronAPI.cliSendCommand(`set failsafe_off_delay = ${failsafe.failsafeOffDelay}`);
        await new Promise((r) => setTimeout(r, 100));
        await window.electronAPI.cliSendCommand(`set failsafe_throttle = ${failsafe.failsafeThrottle}`);
        await new Promise((r) => setTimeout(r, 100));
        await window.electronAPI.cliSendCommand(`set failsafe_throttle_low_delay = ${failsafe.failsafeThrottleLowDelay}`);
        await new Promise((r) => setTimeout(r, 100));
        await window.electronAPI.cliSendCommand(`set failsafe_procedure = ${['LAND', 'DROP', 'RTH', 'NONE'][failsafe.failsafeProcedure] ?? 'RTH'}`);
        await new Promise((r) => setTimeout(r, 100));
        await window.electronAPI.cliSendCommand(`set failsafe_recovery_delay = ${failsafe.failsafeRecoveryDelay}`);
        await new Promise((r) => setTimeout(r, 100));
        await window.electronAPI.cliSendCommand(`set failsafe_stick_threshold = ${failsafe.failsafeStickMotionThreshold}`);
        await new Promise((r) => setTimeout(r, 100));
        await window.electronAPI.cliSendCommand(`set failsafe_min_distance = ${failsafe.failsafeMinDistance}`);
        await new Promise((r) => setTimeout(r, 100));
        await window.electronAPI.cliSendCommand(`set failsafe_min_distance_procedure = ${['LAND', 'DROP', 'RTH', 'NONE'][failsafe.failsafeMinDistanceProcedure] ?? 'LAND'}`);
        await new Promise((r) => setTimeout(r, 100));

        // Save (causes reboot)
        await window.electronAPI.cliSendCommand('save');

        setOriginalFailsafe({ ...failsafe });
        setSuccess('Failsafe settings applied! Board is rebooting - please reconnect.');

        // Wait then disconnect
        await new Promise((r) => setTimeout(r, 3000));
        await window.electronAPI.disconnect();
      } else {
        // Normal MSP path for real hardware
        const result = await window.electronAPI.mspSetFailsafeConfig(failsafe);

        if (result) {
          // Save to EEPROM
          await window.electronAPI.mspSaveEeprom();
          setOriginalFailsafe({ ...failsafe });
          setSuccess('Failsafe settings saved!');
        } else {
          setError('Failed to save failsafe settings');
        }
      }
    } catch (err) {
      console.error('[SafetyTab] Failed to save failsafe:', err);
      setError('Failed to save failsafe settings');
      // Try to restart telemetry
      try {
        await window.electronAPI.mspStartTelemetry();
      } catch {
        // ignore
      }
    } finally {
      setSaving(false);
    }
  };

  // Apply arming safety settings via CLI (isolated - only when user clicks button)
  const applyArmingSafety = async () => {
    setApplyingArmingSafety(true);
    setError(null);
    setSuccess(null);

    try {
      // For SITL, ALWAYS use CLI - MSP Settings API doesn't work on SITL
      if (!isSitl) {
        // Try MSP Settings API first (works on modern iNav without CLI)
        const mspResult = await window.electronAPI.mspSetSettings({
          'receiver_type': armingSafety.receiverType,
          'nav_extra_arming_safety': armingSafety.navExtraArmingSafety,
          'gps_min_sats': armingSafety.navGpsMinSats,
        });

        if (mspResult) {
          // Save to EEPROM
          await window.electronAPI.mspSaveEeprom();
          setOriginalArmingSafety({ ...armingSafety });
          setSuccess('Arming safety settings saved!');
          setApplyingArmingSafety(false);
          return;
        }
      }

      // CLI for SITL or fallback for older firmware
      console.log('[SafetyTab] Using CLI for arming safety settings (isSitl=' + isSitl + ')...');
      console.log('[SafetyTab] Values to set:', {
        receiver_type: armingSafety.receiverType,
        nav_extra_arming_safety: armingSafety.navExtraArmingSafety,
        gps_min_sats: armingSafety.navGpsMinSats,
      });

      // Stop telemetry before CLI
      await window.electronAPI.mspStopTelemetry();
      await new Promise((r) => setTimeout(r, 300));

      // Enter CLI mode
      await window.electronAPI.cliEnterMode();
      await new Promise((r) => setTimeout(r, 500));

      // Set receiver_type
      console.log('[SafetyTab] Setting receiver_type =', armingSafety.receiverType);
      await window.electronAPI.cliSendCommand(`set receiver_type = ${armingSafety.receiverType}`);
      await new Promise((r) => setTimeout(r, 200));

      // Set nav_extra_arming_safety
      console.log('[SafetyTab] Setting nav_extra_arming_safety =', armingSafety.navExtraArmingSafety);
      await window.electronAPI.cliSendCommand(`set nav_extra_arming_safety = ${armingSafety.navExtraArmingSafety}`);
      await new Promise((r) => setTimeout(r, 200));

      // Set gps_min_sats
      console.log('[SafetyTab] Setting gps_min_sats =', armingSafety.navGpsMinSats);
      await window.electronAPI.cliSendCommand(`set gps_min_sats = ${armingSafety.navGpsMinSats}`);
      await new Promise((r) => setTimeout(r, 200));

      // Save and reboot
      console.log('[SafetyTab] Sending save command...');
      await window.electronAPI.cliSendCommand('save');

      // Update original config
      setOriginalArmingSafety({ ...armingSafety });
      setSuccess('Settings applied! Board is rebooting - please reconnect when ready.');

      // Wait for reboot then disconnect
      await new Promise((r) => setTimeout(r, 3000));
      await window.electronAPI.disconnect();
    } catch (err) {
      console.error('[SafetyTab] Failed to apply arming safety:', err);
      setError('Failed to apply arming safety settings');
      // Try to restart telemetry
      try {
        await window.electronAPI.mspStartTelemetry();
      } catch {
        // ignore
      }
    } finally {
      setApplyingArmingSafety(false);
    }
  };

  // Load on mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Update failsafe field
  const updateFailsafe = (field: keyof FailsafeConfig, value: number) => {
    setFailsafe(prev => ({ ...prev, [field]: value }));
  };

  // Update arming safety field
  const updateArmingSafety = (field: keyof ArmingSafetyConfig, value: string | number) => {
    setArmingSafety(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading safety configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Error/Success messages */}
      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm">
          {success}
        </div>
      )}

      {/* Failsafe Configuration (via MSP, or CLI for SITL) */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <h3 className="text-white font-medium">Failsafe Configuration</h3>
            {isSitl && (
              <span className="text-xs text-purple-400 bg-purple-500/20 px-2 py-0.5 rounded">SITL</span>
            )}
          </div>
          {/* Save button for failsafe */}
          <button
            onClick={saveFailsafe}
            disabled={saving || !failsafeChanged}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg flex items-center gap-2 transition-all ${
              failsafeChanged
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <Save className={`w-4 h-4 ${saving ? 'animate-pulse' : ''}`} />
            {saving ? 'Saving...' : isSitl ? 'Save & Reboot' : 'Save'}
          </button>
        </div>

        <div className="space-y-4">
          {/* Failsafe Procedure */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Failsafe Procedure</label>
            <div className="grid grid-cols-2 gap-2">
              {FAILSAFE_PROCEDURES.map(proc => (
                <button
                  key={proc.value}
                  onClick={() => updateFailsafe('failsafeProcedure', proc.value)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    failsafe.failsafeProcedure === proc.value
                      ? proc.value === 1
                        ? 'bg-red-600/20 border-red-500 text-white'
                        : proc.value === 2
                          ? 'bg-green-600/20 border-green-500 text-white'
                          : 'bg-amber-600/20 border-amber-500 text-white'
                      : 'bg-zinc-800/50 border-zinc-700 text-gray-400 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  <div className="font-medium text-sm">{proc.label}</div>
                  <div className="text-xs opacity-70 mt-0.5">{proc.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Failsafe Delay */}
          <DraggableSlider
            label="Failsafe Delay"
            value={failsafe.failsafeDelay}
            onChange={(v) => updateFailsafe('failsafeDelay', v)}
            min={0}
            max={50}
            step={1}
            unit="×0.1s"
            description="Time to wait before activating failsafe"
          />

          {/* Failsafe Off Delay */}
          <DraggableSlider
            label="Recovery Delay"
            value={failsafe.failsafeOffDelay}
            onChange={(v) => updateFailsafe('failsafeOffDelay', v)}
            min={0}
            max={200}
            step={1}
            unit="×0.1s"
            description="Time to wait after signal recovery before resuming control"
          />

          {/* Failsafe Throttle (only for procedure that uses it) */}
          <DraggableSlider
            label="Failsafe Throttle"
            value={failsafe.failsafeThrottle}
            onChange={(v) => updateFailsafe('failsafeThrottle', v)}
            min={1000}
            max={2000}
            step={10}
            unit="µs"
            description="Throttle value during land/set-throttle failsafe"
          />

          {/* Min Distance for RTH (iNav only) */}
          {isInav && failsafe.failsafeProcedure === 2 && (
            <DraggableSlider
              label="Minimum Distance"
              value={failsafe.failsafeMinDistance}
              onChange={(v) => updateFailsafe('failsafeMinDistance', v)}
              min={0}
              max={1000}
              step={10}
              unit="m"
              description="Minimum distance from home to trigger RTH (0 = always RTH)"
            />
          )}

          {/* Stick Motion Threshold */}
          <DraggableSlider
            label="Stick Motion Threshold"
            value={failsafe.failsafeStickMotionThreshold}
            onChange={(v) => updateFailsafe('failsafeStickMotionThreshold', v)}
            min={0}
            max={500}
            step={10}
            unit=""
            description="Stick movement required to cancel failsafe"
          />
        </div>
      </div>

      {/* Arming Safety Configuration (iNav only, uses CLI as fallback) */}
      {isInav && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-purple-400" />
              <h3 className="text-white font-medium">Receiver & Arming</h3>
            </div>
            {/* Apply button for arming safety */}
            <button
              onClick={() => setShowRebootConfirm(true)}
              disabled={applyingArmingSafety || !armingSafetyChanged}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg flex items-center gap-2 transition-all ${
                armingSafetyChanged
                  ? 'bg-purple-600 hover:bg-purple-500 text-white'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              <Zap className={`w-4 h-4 ${applyingArmingSafety ? 'animate-pulse' : ''}`} />
              {applyingArmingSafety ? 'Applying...' : 'Apply'}
            </button>
          </div>

          <div className="space-y-4">
            {/* Receiver Type */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                <Radio className="w-4 h-4 inline mr-1" />
                Receiver Type
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {RECEIVER_TYPES.map(type => (
                  <button
                    key={type.value}
                    onClick={() => updateArmingSafety('receiverType', type.value)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      armingSafety.receiverType === type.value
                        ? type.value === 'SIM (SITL)'
                          ? 'bg-green-600/20 border-green-500 text-white'
                          : 'bg-blue-600/20 border-blue-500 text-white'
                        : 'bg-zinc-800/50 border-zinc-700 text-gray-400 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <div className="font-medium text-sm">{type.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{type.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Nav Extra Arming Safety */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Navigation Arming Safety</label>
              <div className="grid grid-cols-2 gap-2">
                {NAV_ARMING_SAFETY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => updateArmingSafety('navExtraArmingSafety', opt.value)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      armingSafety.navExtraArmingSafety === opt.value
                        ? opt.value === 'ALLOW_BYPASS'
                          ? 'bg-amber-600/20 border-amber-500 text-white'
                          : 'bg-purple-600/20 border-purple-500 text-white'
                        : 'bg-zinc-800/50 border-zinc-700 text-gray-400 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{opt.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Warning when ALLOW_BYPASS */}
            {armingSafety.navExtraArmingSafety === 'ALLOW_BYPASS' && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <strong>Bypass Mode:</strong> You can bypass arming safety checks with stick commands.
                  Useful for SITL testing or indoor flights without GPS.
                </div>
              </div>
            )}

            {/* Min GPS Satellites */}
            <DraggableSlider
              label="Minimum GPS Satellites"
              value={armingSafety.navGpsMinSats}
              onChange={(v) => updateArmingSafety('navGpsMinSats', v)}
              min={0}
              max={12}
              step={1}
              unit=""
              description="Minimum satellites required before arming (0 = no GPS required)"
            />
          </div>
        </div>
      )}

      {/* Reboot Confirmation Dialog (Arming Safety) */}
      {showRebootConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-500/20 rounded-full">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-lg font-medium text-white">Board Reboot Required</h3>
            </div>

            <p className="text-gray-300 mb-4">
              Applying these settings will save to EEPROM and reboot the flight controller.
            </p>

            <p className="text-gray-400 text-sm mb-6">
              You will be disconnected. After the reboot completes (~3 seconds),
              simply reconnect to continue.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRebootConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRebootConfirm(false);
                  applyArmingSafety();
                }}
                className="px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
              >
                Apply & Reboot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reboot Confirmation Dialog (Failsafe - SITL only) */}
      {showFailsafeRebootConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-500/20 rounded-full">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-lg font-medium text-white">SITL Reboot Required</h3>
            </div>

            <p className="text-gray-300 mb-4">
              Saving failsafe settings on SITL requires using CLI commands, which will reboot the simulator.
            </p>

            <p className="text-gray-400 text-sm mb-6">
              You will be disconnected. After SITL restarts (~3 seconds),
              reconnect via TCP to continue.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowFailsafeRebootConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowFailsafeRebootConfirm(false);
                  doSaveFailsafe();
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
