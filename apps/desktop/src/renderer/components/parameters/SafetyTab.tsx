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
import { pendingDraft, usePendingWritesStore } from '../../stores/msp-pending-writes-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import {
  Shield,
  AlertTriangle,
  RefreshCw,
  Lock,
  Zap,
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
import { Trans, useTranslation } from 'react-i18next';

// ============================================================================
// Types & Constants
// ============================================================================

// Failsafe procedures
import {
  PlaneLanding,
  CircleSlash,
  Gamepad2,
  Monitor as MonitorIcon,
} from 'lucide-react';

const FAILSAFE_PROCEDURES = [
  { value: 0, label: 'Land', icon: PlaneLanding, descriptionKey: 'parameters:safetyTab.procLandDesc', color: 'amber' }, // i18n-exempt
  { value: 1, label: 'Drop', icon: AlertTriangle, descriptionKey: 'parameters:safetyTab.procDropDesc', color: 'red' }, // i18n-exempt
  { value: 2, label: 'RTH', icon: Home, descriptionKey: 'parameters:safetyTab.procRthDesc', color: 'green' },
  { value: 3, label: 'None', icon: CircleSlash, descriptionKey: 'parameters:safetyTab.procNoneDesc', color: 'gray' }, // i18n-exempt
] as const;

// Receiver types (iNav)
const RECEIVER_TYPES = [
  { value: 'NONE', label: 'None', icon: CircleSlash }, // i18n-exempt
  { value: 'SERIAL', label: 'Serial', icon: Radio }, // i18n-exempt
  { value: 'MSP', label: 'MSP', icon: MonitorIcon },
  { value: 'SIM (SITL)', label: 'SITL', icon: Gamepad2 },
] as const;

// Betaflight receiver providers (serialrx_provider) - numeric values match FC encoding
const BF_RECEIVER_PROVIDERS = [
  { value: 0, label: 'Spektrum 1024', description: 'Spektrum DSM2 1024' }, // i18n-exempt
  { value: 1, label: 'Spektrum 2048', description: 'Spektrum DSM2/DSMX 2048' }, // i18n-exempt
  { value: 2, label: 'SBUS', description: 'FrSky SBUS/F.Port' }, // i18n-exempt
  { value: 3, label: 'SUMD', description: 'Graupner SUMD' }, // i18n-exempt
  { value: 4, label: 'SUMH', description: 'Graupner SUMH' }, // i18n-exempt
  { value: 5, label: 'XBus Mode B', description: 'JR XBus Mode B' }, // i18n-exempt
  { value: 6, label: 'XBus RJ01', description: 'JR XBus RJ01' }, // i18n-exempt
  { value: 7, label: 'IBUS', description: 'FlySky IBUS' }, // i18n-exempt
  { value: 8, label: 'Jeti ExBus', description: 'Jeti ExBus' }, // i18n-exempt
  { value: 9, label: 'CRSF', description: 'TBS Crossfire/ELRS' }, // i18n-exempt
  { value: 10, label: 'SRXL', description: 'Spektrum SRXL' }, // i18n-exempt
  { value: 12, label: 'F.Port', description: 'FrSky F.Port' }, // i18n-exempt
  { value: 13, label: 'SRXL2', description: 'Spektrum SRXL2' }, // i18n-exempt
  { value: 14, label: 'Ghost', description: 'ImmersionRC Ghost' }, // i18n-exempt
  { value: 15, label: 'MSP', description: 'MSP (for SITL/testing)' }, // i18n-exempt
] as const;

// Quick select buttons (most common protocols)
const BF_QUICK_SELECT = [
  { value: 9, label: 'CRSF' },
  { value: 2, label: 'SBUS' },
  { value: 7, label: 'IBUS' },
  { value: 15, label: 'MSP' },
] as const;

// GPS Rescue altitude modes
const ALTITUDE_MODES = [
  { value: 0, labelKey: 'parameters:safetyTab.altModeMaximum', description: 'Higher of current or set altitude' }, // i18n-exempt
  { value: 1, labelKey: 'parameters:safetyTab.altModeFixed', description: 'Always climb to set altitude' }, // i18n-exempt
  { value: 2, labelKey: 'parameters:safetyTab.altModeCurrent', description: 'Use current altitude' }, // i18n-exempt
] as const;

// Sanity check options
const SANITY_CHECKS = [
  { value: 0, labelKey: 'parameters:safetyTab.sanityOff', description: 'No safety checks' }, // i18n-exempt
  { value: 1, labelKey: 'parameters:safetyTab.sanityFlyaway', description: 'Detect flyaways only' }, // i18n-exempt
  { value: 2, labelKey: 'parameters:safetyTab.sanityAll', description: 'All checks (recommended)' }, // i18n-exempt
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

interface BfReceiverConfig {
  serialrxProvider: number;
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

const DEFAULT_BF_RECEIVER: BfReceiverConfig = {
  serialrxProvider: 9, // CRSF
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
    <div className="rounded-xl border-subtle overflow-hidden bg-surface">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-5 py-4 flex items-center gap-3 hover:bg-surface transition-colors`}
      >
        <div className={`w-10 h-10 rounded-lg bg-${color}-500/20 flex items-center justify-center`}>
          {icon}
        </div>
        <span className="flex-1 text-left font-medium text-content">{title}</span>
        {badge && (
          <span className={`px-2 py-0.5 text-xs rounded-full bg-${badgeColor || color}-500/20 text-${badgeColor || color}-400`}>
            {badge}
          </span>
        )}
        <ChevronDown
          className={`w-5 h-5 text-content-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-5 pb-5 border-t border-subtle">
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

const PENDING_ID = 'safety';

interface SafetyDraft {
  isInav: boolean;
  failsafe: FailsafeConfig;
  originalFailsafe: FailsafeConfig;
  arming: ArmingSafetyConfig;
  originalArming: ArmingSafetyConfig;
  bfReceiver: BfReceiverConfig;
  originalBfReceiver: BfReceiverConfig;
  gpsRescue: GpsRescueConfig;
  originalGpsRescue: GpsRescueConfig;
  gpsPids: GpsRescuePids;
  originalGpsPids: GpsRescuePids;
}

const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

/** Writes only what changed, the same MSP way on SITL as on hardware (as INAV Configurator does). */
async function writeSafety(d: SafetyDraft): Promise<boolean> {
  if (differs(d.failsafe, d.originalFailsafe) && !(await window.electronAPI.mspSetFailsafeConfig(d.failsafe))) return false;
  if (!d.isInav) {
    if (differs(d.gpsRescue, d.originalGpsRescue) && !(await window.electronAPI.mspSetGpsRescue(d.gpsRescue))) return false;
    if (differs(d.gpsPids, d.originalGpsPids) && !(await window.electronAPI.mspSetGpsRescuePids(d.gpsPids))) return false;
    if (differs(d.bfReceiver, d.originalBfReceiver) && !(await window.electronAPI.mspSetRxConfig(d.bfReceiver.serialrxProvider))) return false;
  } else {
    // Changed keys only: receiver_type also belongs to the Receiver tab's pending write
    const names: Record<keyof ArmingSafetyConfig, string> = {
      receiverType: 'receiver_type',
      navExtraArmingSafety: 'nav_extra_arming_safety',
      navGpsMinSats: 'gps_min_sats',
    };
    const writes: Record<string, string | number> = {};
    for (const k of Object.keys(names) as Array<keyof ArmingSafetyConfig>) {
      if (d.arming[k] !== d.originalArming[k]) writes[names[k]] = d.arming[k];
    }
    if (Object.keys(writes).length > 0 && !(await window.electronAPI.mspSetSettings(writes))) return false;
  }
  return true;
}

export default function SafetyTab({ isInav }: Props) {
  const { t } = useTranslation();
  const draft = pendingDraft<SafetyDraft>(PENDING_ID);
  // Connection state
  const connectionState = useConnectionStore((state) => state.connectionState);
  const isSitl = connectionState?.isSitl ?? false;

  // Failsafe state
  const [failsafe, setFailsafe] = useState<FailsafeConfig>(draft?.failsafe ?? DEFAULT_FAILSAFE);
  const [originalFailsafe, setOriginalFailsafe] = useState<FailsafeConfig>(draft?.originalFailsafe ?? DEFAULT_FAILSAFE);

  // Arming safety state (iNav)
  const [arming, setArming] = useState<ArmingSafetyConfig>(draft?.arming ?? DEFAULT_ARMING);
  const [originalArming, setOriginalArming] = useState<ArmingSafetyConfig>(draft?.originalArming ?? DEFAULT_ARMING);

  // Receiver state (Betaflight)
  const [bfReceiver, setBfReceiver] = useState<BfReceiverConfig>(draft?.bfReceiver ?? DEFAULT_BF_RECEIVER);
  const [originalBfReceiver, setOriginalBfReceiver] = useState<BfReceiverConfig>(draft?.originalBfReceiver ?? DEFAULT_BF_RECEIVER);

  // GPS Rescue state (Betaflight)
  const [gpsRescue, setGpsRescue] = useState<GpsRescueConfig>(draft?.gpsRescue ?? DEFAULT_GPS_RESCUE);
  const [originalGpsRescue, setOriginalGpsRescue] = useState<GpsRescueConfig>(draft?.originalGpsRescue ?? DEFAULT_GPS_RESCUE);
  const [gpsPids, setGpsPids] = useState<GpsRescuePids>(draft?.gpsPids ?? DEFAULT_GPS_PIDS);
  const [originalGpsPids, setOriginalGpsPids] = useState<GpsRescuePids>(draft?.originalGpsPids ?? DEFAULT_GPS_PIDS);
  const [showGpsPids, setShowGpsPids] = useState(false);

  // UI state
  const [loading, setLoading] = useState(!draft);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Check for changes
  const failsafeChanged = JSON.stringify(failsafe) !== JSON.stringify(originalFailsafe);
  const armingChanged = JSON.stringify(arming) !== JSON.stringify(originalArming);
  const bfReceiverChanged = JSON.stringify(bfReceiver) !== JSON.stringify(originalBfReceiver);
  const gpsRescueChanged = JSON.stringify(gpsRescue) !== JSON.stringify(originalGpsRescue);
  const gpsPidsChanged = JSON.stringify(gpsPids) !== JSON.stringify(originalGpsPids);
  const hasChanges = failsafeChanged || armingChanged || bfReceiverChanged || gpsRescueChanged || gpsPidsChanged;

  useEffect(() => {
    const store = usePendingWritesStore.getState();
    if (!hasChanges) {
      store.drop(PENDING_ID);
      return;
    }
    store.put<SafetyDraft>(PENDING_ID, {
      label: t('parameters:safetyTab.pendingLabel'),
      draft: {
        isInav, failsafe, originalFailsafe, arming, originalArming, bfReceiver, originalBfReceiver,
        gpsRescue, originalGpsRescue, gpsPids, originalGpsPids,
      },
      write: writeSafety,
    });
  }, [hasChanges, isInav, failsafe, originalFailsafe, arming, originalArming, bfReceiver, originalBfReceiver,
    gpsRescue, originalGpsRescue, gpsPids, originalGpsPids, t]);

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

      // Load GPS Rescue and Receiver config for Betaflight
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

        // Load Betaflight receiver config via MSP_RX_CONFIG (no CLI disruption!)
        try {
          const rxConfig = await window.electronAPI.mspGetRxConfig();
          if (rxConfig) {
            setBfReceiver({ serialrxProvider: rxConfig.serialrxProvider });
            setOriginalBfReceiver({ serialrxProvider: rxConfig.serialrxProvider });
          }
        } catch {
          // Ignore - use defaults
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
                navGpsMinSats: satsMatch ? parseInt(satsMatch[1]!, 10) : 6,
              });
              setOriginalArming({
                receiverType: receiverMatch?.[1]?.trim().toUpperCase() ?? 'SERIAL',
                navExtraArmingSafety: armingMatch?.[1]?.toUpperCase() ?? 'ON',
                navGpsMinSats: satsMatch ? parseInt(satsMatch[1]!, 10) : 6,
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
      setError(t('parameters:safetyTab.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [isInav, isSitl, t]);

  // Load on mount, unless unsaved edits from before a tab switch are waiting
  useEffect(() => {
    if (!pendingDraft(PENDING_ID)) loadConfig();
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
        <div className="flex items-center gap-3 text-content-secondary">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>{t('parameters:safetyTab.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
      {/* Messages */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border-red-500/30 rounded-xl text-red-400">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="text-sm">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-500/20 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 p-4 bg-green-500/10 border-green-500/30 rounded-xl text-green-400">
          <Check className="w-5 h-5 shrink-0" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* Failsafe Section */}
      <Section
        title={t('parameters:safetyTab.failsafeBehavior')}
        icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
        color="amber"
        defaultOpen={true}
        badge={failsafeChanged ? t('common:modified') : undefined}
        badgeColor="yellow"
      >
        <div className="mt-4 space-y-6">
          {/* Procedure Selection - Visual Cards */}
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-3">
              {t('parameters:safetyTab.signalLostQuestion')}
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
                          : 'bg-surface-raised border text-content'
                        : 'bg-surface border-subtle text-content-secondary hover:bg-surface hover:border'
                    }`}
                  >
                    <div className="mb-1"><proc.icon className="w-6 h-6 mx-auto" /></div>
                    <div className="font-medium text-sm">{proc.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{t(proc.descriptionKey)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timing Sliders */}
          <div className="grid grid-cols-2 gap-4">
            <DraggableSlider
              label={t('parameters:safetyTab.activationDelay')}
              value={failsafe.failsafeDelay}
              onChange={(v) => setFailsafe(prev => ({ ...prev, failsafeDelay: v }))}
              min={0}
              max={200}
              step={1}
              unit="×0.1s"
              color="#F59E0B"
              hint={t('parameters:safetyTab.activationDelayHint', { seconds: (failsafe.failsafeDelay / 10).toFixed(1) })}
            />
            <DraggableSlider
              label={t('parameters:safetyTab.recoveryDelay')}
              value={failsafe.failsafeOffDelay}
              onChange={(v) => setFailsafe(prev => ({ ...prev, failsafeOffDelay: v }))}
              min={0}
              max={200}
              step={1}
              unit="×0.1s"
              color="#10B981"
              hint={t('parameters:safetyTab.recoveryDelayHint', { seconds: (failsafe.failsafeOffDelay / 10).toFixed(1) })}
            />
          </div>

          <DraggableSlider
            label={t('parameters:safetyTab.failsafeThrottle')}
            value={failsafe.failsafeThrottle}
            onChange={(v) => setFailsafe(prev => ({ ...prev, failsafeThrottle: v }))}
            min={1000}
            max={2000}
            step={10}
            unit="µs"
            color="#6366F1"
            hint={t('parameters:safetyTab.failsafeThrottleHint')}
          />

          {/* Min Distance for RTH */}
          {isInav && failsafe.failsafeProcedure === 2 && (
            <DraggableSlider
              label={t('parameters:safetyTab.minRthDistance')}
              value={failsafe.failsafeMinDistance}
              onChange={(v) => setFailsafe(prev => ({ ...prev, failsafeMinDistance: v }))}
              min={0}
              max={1000}
              step={10}
              unit="m"
              color="#8B5CF6"
              hint={t('parameters:safetyTab.minRthDistanceHint')}
            />
          )}
        </div>
      </Section>

      {/* GPS Rescue Section (Betaflight only) */}
      {!isInav && (
        <Section
          title={t('parameters:safetyTab.gpsRescueTitle')}
          icon={<Home className="w-5 h-5 text-green-400" />}
          color="green"
          defaultOpen={false}
          badge={gpsRescueChanged || gpsPidsChanged ? t('common:modified') : undefined}
          badgeColor="green"
        >
          <div className="mt-4 space-y-6">
            {/* Info Banner */}
            <div className="flex items-start gap-3 p-3 bg-blue-500/10 border-blue-500/20 rounded-lg">
              <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-200/80">
                <Trans i18nKey="parameters:safetyTab.gpsRescueInfo" components={{ b: <strong /> }} />
              </p>
            </div>

            {/* Altitude & Speed */}
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-content flex items-center gap-2">
                  <ArrowUp className="w-4 h-4 text-blue-400" />
                  {t('parameters:safetyTab.altitudeClimb')}
                </h4>
                <DraggableSlider
                  label={t('parameters:safetyTab.rescueAltitude')}
                  value={gpsRescue.initialAltitudeM}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, initialAltitudeM: v }))}
                  min={20}
                  max={200}
                  step={5}
                  unit="m"
                  color="#3B82F6"
                />
                <div className="flex items-center gap-3">
                  <span className="text-sm text-content-secondary w-28">{t('parameters:safetyTab.altitudeMode')}</span>
                  <select
                    value={gpsRescue.altitudeMode}
                    onChange={(e) => setGpsRescue(prev => ({ ...prev, altitudeMode: parseInt(e.target.value) }))}
                    className="flex-1 px-3 py-2 bg-surface-raised border rounded-lg text-content text-sm"
                  >
                    {ALTITUDE_MODES.map((m) => (
                      <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
                    ))}
                  </select>
                </div>
                <DraggableSlider
                  label={t('parameters:safetyTab.ascendRate')}
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
                <h4 className="text-sm font-medium text-content flex items-center gap-2">
                  <ArrowDown className="w-4 h-4 text-orange-400" />
                  {t('parameters:safetyTab.returnDescent')}
                </h4>
                <DraggableSlider
                  label={t('parameters:safetyTab.returnSpeed')}
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
                  label={t('parameters:safetyTab.descendRate')}
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
                  label={t('parameters:safetyTab.descentDistance')}
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
              <h4 className="text-sm font-medium text-content flex items-center gap-2">
                <Gauge className="w-4 h-4 text-orange-400" />
                {t('parameters:safetyTab.throttleLimits')}
              </h4>
              <div className="grid grid-cols-3 gap-4">
                <DraggableSlider
                  label={t('common:min')}
                  value={gpsRescue.throttleMin}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, throttleMin: v }))}
                  min={1000}
                  max={1500}
                  step={10}
                  color="#EF4444"
                />
                <DraggableSlider
                  label={t('parameters:safetyTab.hover')}
                  value={gpsRescue.throttleHover}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, throttleHover: v }))}
                  min={1000}
                  max={2000}
                  step={10}
                  color="#F59E0B"
                />
                <DraggableSlider
                  label={t('common:max')}
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
                <h4 className="text-sm font-medium text-content flex items-center gap-2">
                  <Satellite className="w-4 h-4 text-cyan-400" />
                  {t('parameters:safetyTab.gpsRequirements')}
                </h4>
                <DraggableSlider
                  label={t('parameters:safetyTab.minSatellites')}
                  value={gpsRescue.minSats}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, minSats: v }))}
                  min={5}
                  max={20}
                  color="#06B6D4"
                />
                <DraggableSlider
                  label={t('parameters:safetyTab.minDistance')}
                  value={gpsRescue.minRescueDth}
                  onChange={(v) => setGpsRescue(prev => ({ ...prev, minRescueDth: v }))}
                  min={10}
                  max={200}
                  step={5}
                  unit="m"
                  color="#8B5CF6"
                  hint={t('parameters:safetyTab.minDistanceHint')}
                />
              </div>
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-content flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  {t('parameters:safetyTab.safetyChecks')}
                </h4>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-content-secondary w-24">{t('parameters:safetyTab.sanity')}</span>
                  <select
                    value={gpsRescue.sanityChecks}
                    onChange={(e) => setGpsRescue(prev => ({ ...prev, sanityChecks: parseInt(e.target.value) }))}
                    className="flex-1 px-3 py-2 bg-surface-raised border rounded-lg text-content text-sm"
                  >
                    {SANITY_CHECKS.map((c) => (
                      <option key={c.value} value={c.value}>{t(c.labelKey)}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setGpsRescue(prev => ({ ...prev, allowArmingWithoutFix: prev.allowArmingWithoutFix ? 0 : 1 }))}
                  className={`w-full px-4 py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all border ${
                    gpsRescue.allowArmingWithoutFix
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-surface-raised border text-content-secondary'
                  }`}
                >
                  {gpsRescue.allowArmingWithoutFix ? (
                    <>
                      <AlertTriangle className="w-4 h-4" />
                      {t('parameters:safetyTab.armWithoutFix')}
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      {t('parameters:safetyTab.requireFixToArm')}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Advanced PIDs Toggle */}
            <button
              onClick={() => setShowGpsPids(!showGpsPids)}
              className="w-full px-4 py-3 flex items-center justify-between bg-surface hover:bg-surface-raised rounded-lg transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-purple-400" />
                <span className="text-sm text-content">{t('parameters:safetyTab.gpsRescuePids')}</span>
                <span className="text-xs text-content-secondary">{t('parameters:safetyTab.advancedParen')}</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-content-secondary transition-transform ${showGpsPids ? 'rotate-180' : ''}`} />
            </button>

            {showGpsPids && (
              <div className="grid grid-cols-3 gap-6 p-4 bg-surface-raised rounded-lg">
                <div className="space-y-3">
                  <h5 className="text-xs font-medium text-orange-400">{t('common:throttle')}</h5>
                  <DraggableSlider label="P" value={gpsPids.throttleP} onChange={(v) => setGpsPids(prev => ({ ...prev, throttleP: v }))} min={0} max={200} color="#F97316" />
                  <DraggableSlider label="I" value={gpsPids.throttleI} onChange={(v) => setGpsPids(prev => ({ ...prev, throttleI: v }))} min={0} max={200} color="#FB923C" />
                  <DraggableSlider label="D" value={gpsPids.throttleD} onChange={(v) => setGpsPids(prev => ({ ...prev, throttleD: v }))} min={0} max={200} color="#FDBA74" />
                </div>
                <div className="space-y-3">
                  <h5 className="text-xs font-medium text-blue-400">{t('parameters:safetyTab.velocity')}</h5>
                  <DraggableSlider label="P" value={gpsPids.velP} onChange={(v) => setGpsPids(prev => ({ ...prev, velP: v }))} min={0} max={200} color="#3B82F6" />
                  <DraggableSlider label="I" value={gpsPids.velI} onChange={(v) => setGpsPids(prev => ({ ...prev, velI: v }))} min={0} max={200} color="#60A5FA" />
                  <DraggableSlider label="D" value={gpsPids.velD} onChange={(v) => setGpsPids(prev => ({ ...prev, velD: v }))} min={0} max={200} color="#93C5FD" />
                </div>
                <div className="space-y-3">
                  <h5 className="text-xs font-medium text-green-400">{t('common:yaw')}</h5>
                  <DraggableSlider label="P" value={gpsPids.yawP} onChange={(v) => setGpsPids(prev => ({ ...prev, yawP: v }))} min={0} max={200} color="#22C55E" />
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Receiver settings moved note */}
      {isInav && (
        <Section
          title={t('parameters:safetyTab.armingSafety')}
          icon={<Radio className="w-5 h-5 text-purple-400" />}
          color="purple"
          defaultOpen={false}
          badge={armingChanged ? t('common:modified') : undefined}
          badgeColor="purple"
        >
          <div className="mt-4 space-y-6">
            {/* Arming Safety */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-3">{t('parameters:safetyTab.navArmingSafety')}</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setArming(prev => ({ ...prev, navExtraArmingSafety: 'ON' }))}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    arming.navExtraArmingSafety === 'ON'
                      ? 'bg-green-500/20 border-green-500 text-white'
                      : 'bg-surface border-subtle text-content-secondary hover:bg-surface'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Lock className="w-5 h-5" />
                    <span className="font-medium">{t('parameters:safetyTab.enabled')}</span>
                  </div>
                  <p className="text-xs opacity-70">{t('parameters:safetyTab.enabledHint')}</p>
                </button>
                <button
                  onClick={() => setArming(prev => ({ ...prev, navExtraArmingSafety: 'ALLOW_BYPASS' }))}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    arming.navExtraArmingSafety === 'ALLOW_BYPASS'
                      ? 'bg-amber-500/20 border-amber-500 text-white'
                      : 'bg-surface border-subtle text-content-secondary hover:bg-surface'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-5 h-5" />
                    <span className="font-medium">{t('parameters:safetyTab.allowBypass')}</span>
                  </div>
                  <p className="text-xs opacity-70">{t('parameters:safetyTab.allowBypassHint')}</p>
                </button>
              </div>
            </div>

            {arming.navExtraArmingSafety === 'ALLOW_BYPASS' && (
              <div className="flex items-start gap-3 p-3 bg-amber-500/10 border-amber-500/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-200/80">
                  <Trans i18nKey="parameters:safetyTab.bypassWarning" components={{ b: <strong /> }} />
                </p>
              </div>
            )}

            {/* GPS Satellites */}
            <DraggableSlider
              label={t('parameters:safetyTab.minGpsSatellites')}
              value={arming.navGpsMinSats}
              onChange={(v) => setArming(prev => ({ ...prev, navGpsMinSats: v }))}
              min={0}
              max={12}
              color="#A855F7"
              hint={t('parameters:safetyTab.minGpsSatellitesHint')}
            />

            <div className="flex items-start gap-3 p-3 bg-surface border-subtle rounded-lg">
              <Info className="w-4 h-4 text-content-secondary shrink-0 mt-0.5" />
              <p className="text-xs text-content-secondary">
                <Trans i18nKey="parameters:safetyTab.receiverMoved" components={{ b: <strong className="text-content" /> }} />
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* iNav Navigation Note */}
      {isInav && (
        <div className="flex items-start gap-3 p-4 bg-blue-500/10 border-blue-500/20 rounded-xl">
          <Home className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-300">{t('parameters:safetyTab.returnToHome')}</h4>
            <p className="text-sm text-blue-200/70 mt-1">
              <Trans i18nKey="parameters:safetyTab.inavNavNote" components={{ b: <strong /> }} />
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
