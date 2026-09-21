import { useState, useCallback } from 'react';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useNavigationStore, isViewId, type ViewId } from '../../stores/navigation-store';
import type { PreArmFix } from '../../../shared/prearm-checks';

interface PreArmParamFixProps {
  paramIds: string[];
  hint: string;
  action?: PreArmFix['action'];
  navigateTo?: string;
}

/**
 * A single parameter row that deep-links to the Parameters view, filtered to
 * this parameter, rather than editing it inline. The Parameters view is the one
 * place with the full editor (metadata-aware input, validation, description,
 * reboot handling), so we send the user there instead of duplicating a cramped
 * editor inside the pre-arm popover.
 */
function ParamLink({ paramId }: { paramId: string }) {
  const param = useParameterStore((s) => s.parameters.get(paramId));

  const open = useCallback(() => {
    // setView's scrollTarget is consumed by ParametersView to filter/scroll to
    // this exact parameter on arrival.
    useNavigationStore.getState().setView('parameters', paramId);
  }, [paramId]);

  return (
    <button
      type="button"
      onClick={open}
      className="group w-full flex items-center gap-2 px-2 py-1 rounded bg-surface-raised/50 hover:bg-surface-raised border border-subtle text-left transition-colors"
      title={`Open ${paramId} in Parameters`}
    >
      <span className="text-[10px] font-mono text-content truncate">{paramId}</span>
      {param && (
        <span className="text-[10px] font-mono text-content-secondary shrink-0">= {param.value}</span>
      )}
      <span className="ml-auto text-[10px] text-blue-400 group-hover:text-blue-300 whitespace-nowrap shrink-0">
        Open in Parameters
      </span>
    </button>
  );
}

/**
 * Inline pre-arm fix. Shows the hint, links to the relevant parameter(s) in the
 * Parameters view, and offers escape hatches (calibration/tab links, or
 * disabling arming checks) when there's no direct parameter to point at.
 */
export function PreArmParamFix({ paramIds, hint, action, navigateTo }: PreArmParamFixProps) {
  const setParameter = useParameterStore((s) => s.setParameterImmediate);
  const isPx4 = useConnectionStore((s) => s.connectionState.firmware) === 'px4';
  const [disabling, setDisabling] = useState(false);
  const [disabled, setDisabled] = useState(false);

  const handleDisableArmingChecks = useCallback(async () => {
    setDisabling(true);
    const ok = await setParameter('ARMING_CHECK', 0);
    setDisabling(false);
    if (ok) {
      setDisabled(true);
    }
  }, [setParameter]);

  const goToTab = useCallback(() => {
    if (navigateTo && isViewId(navigateTo)) {
      useNavigationStore.getState().setView(navigateTo as ViewId);
    }
  }, [navigateTo]);

  // Show "Disable Arming Checks" when there's no direct param fix
  // PX4 has no ARMING_CHECK: writing it would fail while the UI claimed the
  // checks were off. Its checks are individual COM_ARM_* / CBRK_* switches.
  const showDisableButton =
    !isPx4 && !disabled && (action || (paramIds.length === 0 && !navigateTo));
  const showPx4CheckHint = isPx4 && (action || (paramIds.length === 0 && !navigateTo));
  const tabLabel = navigateTo ? navigateTo.charAt(0).toUpperCase() + navigateTo.slice(1) : '';

  return (
    <div className="px-3 py-2 bg-surface border-t border-subtle space-y-2">
      <div className="text-[11px] text-content">{hint}</div>

      {action && (
        <div className="text-[10px] text-content-secondary">
          {action === 'calibrate-accel' && 'Use the Calibration tab to run Accelerometer (Level) calibration.'}
          {action === 'calibrate-compass' && 'Use the Calibration tab to run Compass calibration.'}
          {action === 'calibrate-rc' && 'Use the Calibration tab to run RC calibration.'}
        </div>
      )}

      {navigateTo && (
        isViewId(navigateTo) ? (
          <button
            type="button"
            onClick={goToTab}
            className="text-[10px] text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline"
          >
            Go to {tabLabel} tab to resolve
          </button>
        ) : (
          <div className="text-[10px] text-blue-400">Go to {tabLabel} tab to resolve</div>
        )
      )}

      {paramIds.length > 0 && (
        <div className="space-y-1">
          {paramIds.map((id) => (
            <ParamLink key={id} paramId={id} />
          ))}
        </div>
      )}

      {showDisableButton && !disabled && (
        <button
          onClick={handleDisableArmingChecks}
          disabled={disabling}
          className="w-full px-3 py-1.5 text-[11px] font-medium rounded bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition-colors disabled:opacity-50"
        >
          {disabling ? 'Disabling...' : 'Disable Arming Checks'}
        </button>
      )}

      {showPx4CheckHint && (
        <button
          type="button"
          onClick={() => useNavigationStore.getState().setView('parameters', 'COM_ARM_')}
          className="w-full px-3 py-1.5 text-left text-[10px] rounded bg-surface-raised/50 hover:bg-surface-raised border border-subtle text-content-secondary transition-colors"
        >
          PX4 has no single arming-check switch. Each check has its own
          parameter (COM_ARM_WO_GPS, COM_ARM_MAG_STR, COM_ARM_CHK_ESCS,
          CBRK_SUPPLY_CHK). Open them in Parameters.
        </button>
      )}

      {disabled && (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Arming checks disabled (ARMING_CHECK = 0)
        </div>
      )}
    </div>
  );
}
