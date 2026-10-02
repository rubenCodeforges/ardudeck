import { Rocket, ShieldAlert, AlertTriangle, Loader2 } from 'lucide-react';
import { t } from '../../../../shared/i18n/index.js';
import type { VehicleProfile } from '../../../stores/settings-store.js';
import { useConnectionStore } from '../../../stores/connection-store.js';
import { useParameterStore } from '../../../stores/parameter-store.js';
import { useTelemetryStore } from '../../../stores/telemetry-store.js';
import { useActiveVehicleStore } from '../../../stores/active-vehicle-store.js';
import { useProfileApplyStore } from '../../../stores/profile-apply-store.js';
import { useProfileApply } from './use-profile-apply.js';

interface ApplyProfileButtonProps {
  profile: VehicleProfile;
  /** Called before the apply flow starts (e.g. to close a parent modal). */
  onBeforeStart?: () => void;
  /** "compact" for cards, "full" for dialog insertions. */
  size?: 'compact' | 'full';
}

/**
 * Smart-gated Apply button. All heavyweight UI (real-FC confirm modal, toast)
 * is rendered at App root by <ProfileApplyOverlay> — this component only emits
 * actions to the global profile-apply store so state survives modal closes.
 */
export function ApplyProfileButton({ profile, onBeforeStart, size = 'compact' }: ApplyProfileButtonProps) {
  const isConnected = useConnectionStore(s => s.connectionState.isConnected);
  const isSitl = useConnectionStore(s => s.connectionState.isSitl ?? false);
  // Zero unless a full download landed: applying a profile diffed against a
  // few connect-time reads would write the wrong deltas.
  const paramCount = useParameterStore(s => (s.downloadState === 'complete' ? s.parameters.size : 0));
  const armed = useTelemetryStore(s => s.flight.armed);
  const hasFleetVehicles = useActiveVehicleStore(s => Object.keys(s.knownVehicles).length > 0);
  // A fleet is live but there's no primary single connection. Profiles are a bulk
  // parameter write, which runs over a DIRECT connection only (params are not
  // routed per fleet vehicle) - so we surface that instead of a misleading
  // "Connect first" when the operator clearly is connected to a fleet.
  const fleetOnly = !isConnected && hasFleetVehicles;
  const applyStatus = useProfileApplyStore(s => s.status);
  const activeProfileId = useProfileApplyStore(s => s.activeProfileId);

  const { start } = useProfileApply(profile);

  const inFlight =
    activeProfileId === profile.id && (applyStatus === 'writing' || applyStatus === 'reviewing');
  const globallyBusy = applyStatus !== 'idle' && activeProfileId !== profile.id;

  const { label, variant, disabled, subLabel } = deriveButtonState({
    isConnected, isSitl, armed, paramCount, inFlight, globallyBusy, applyStatus, fleetOnly,
  });

  const sizeClasses = size === 'full'
    ? 'w-full justify-center px-4 py-2.5 text-sm'
    : 'px-3 py-1.5 text-xs';

  const variantClasses: Record<typeof variant, string> = {
    primary: 'bg-blue-600 hover:bg-blue-500 text-white',
    warning: 'bg-amber-500 hover:bg-amber-400 text-black',
    danger:  'bg-red-500/20 text-red-300 cursor-not-allowed',
    muted:   'bg-surface-overlay-subtle text-content-secondary cursor-not-allowed',
  };

  const handleClick = () => {
    onBeforeStart?.();
    void start();
  };

  return (
    <div className={size === 'full' ? '' : 'flex items-center gap-2'}>
      <button
        onClick={handleClick}
        disabled={disabled || inFlight || globallyBusy}
        title={subLabel}
        className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors ${sizeClasses} ${variantClasses[variant]} disabled:opacity-60`}
      >
        {inFlight || globallyBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
         : variant === 'warning' ? <ShieldAlert className="w-3.5 h-3.5" />
         : variant === 'danger' || variant === 'muted' ? <AlertTriangle className="w-3.5 h-3.5" />
         : <Rocket className="w-3.5 h-3.5" />}
        <span>{label}</span>
      </button>
    </div>
  );
}

function deriveButtonState(args: {
  isConnected: boolean;
  isSitl: boolean;
  armed: boolean;
  paramCount: number;
  inFlight: boolean;
  globallyBusy: boolean;
  applyStatus: string;
  fleetOnly: boolean;
}): {
  label: string;
  subLabel: string;
  variant: 'primary' | 'warning' | 'danger' | 'muted';
  disabled: boolean;
} {
  if (args.inFlight) {
    const label = args.applyStatus === 'writing' ? t('settings:applyProfileButton.writing') : t('settings:applyProfileButton.reviewing');
    return { label, subLabel: t('settings:applyProfileButton.inProgress'), variant: 'primary', disabled: true };
  }
  if (args.globallyBusy) {
    return { label: t('settings:applyProfileButton.busy'), subLabel: t('settings:applyProfileButton.busySub'), variant: 'muted', disabled: true };
  }
  if (args.fleetOnly) {
    return { label: t('settings:applyProfileButton.directLink'), subLabel: t('settings:applyProfileButton.directLinkSub'), variant: 'muted', disabled: true };
  }
  if (!args.isConnected) {
    return { label: t('settings:applyProfileButton.connectFirst'), subLabel: t('settings:applyProfileButton.connectFirstSub'), variant: 'muted', disabled: true };
  }
  if (args.paramCount === 0) {
    return { label: t('settings:applyProfileButton.loadingParams'), subLabel: t('settings:applyProfileButton.loadingParamsSub'), variant: 'muted', disabled: true };
  }
  if (args.armed) {
    return { label: t('settings:applyProfileButton.disarmFirst'), subLabel: t('settings:applyProfileButton.disarmFirstSub'), variant: 'danger', disabled: true };
  }
  if (args.isSitl) {
    return { label: t('settings:applyProfileButton.applySitl'), subLabel: t('settings:applyProfileButton.applySitlSub'), variant: 'primary', disabled: false };
  }
  return { label: t('settings:applyProfileButton.applyVehicle'), subLabel: t('settings:applyProfileButton.applyVehicleSub'), variant: 'warning', disabled: false };
}
