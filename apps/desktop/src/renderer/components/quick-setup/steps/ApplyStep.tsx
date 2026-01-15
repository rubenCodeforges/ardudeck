/**
 * ApplyStep
 *
 * Final step that applies the preset configuration to the flight controller.
 * Shows progress, success, or error states.
 */

import React, { useEffect, useRef } from 'react';
import { useQuickSetupStore } from '../../../stores/quick-setup-store';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Rocket,
  RefreshCw,
} from 'lucide-react';

// Task status icon component
const TaskStatusIcon: React.FC<{ status: 'pending' | 'in_progress' | 'completed' | 'error' }> = ({
  status,
}) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    case 'in_progress':
      return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-red-400" />;
    default:
      return <div className="w-4 h-4 rounded-full border-2 border-zinc-600" />;
  }
};

export const ApplyStep: React.FC = () => {
  const {
    selectedPreset,
    isApplying,
    applyProgress,
    applyError,
    applySuccess,
    applyPreset,
    prevStep,
    closeWizard,
  } = useQuickSetupStore();

  // Track if we've already started applying
  const hasStartedRef = useRef(false);

  // Start applying when this step is reached
  useEffect(() => {
    if (!hasStartedRef.current && !isApplying && !applySuccess && !applyError) {
      hasStartedRef.current = true;
      applyPreset();
    }
  }, [applyPreset, isApplying, applySuccess, applyError]);

  // Reset ref when component unmounts
  useEffect(() => {
    return () => {
      hasStartedRef.current = false;
    };
  }, []);

  if (!selectedPreset) {
    return (
      <div className="text-center py-8">
        <p className="text-zinc-400">No preset selected.</p>
      </div>
    );
  }

  // Progress percentage
  const progressPercent =
    applyProgress.total > 0
      ? Math.round((applyProgress.current / applyProgress.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div
          className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
            applySuccess
              ? 'bg-green-500/20'
              : applyError
              ? 'bg-red-500/20'
              : 'bg-blue-500/20'
          }`}
        >
          {applySuccess ? (
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          ) : applyError ? (
            <XCircle className="w-8 h-8 text-red-400" />
          ) : (
            <Rocket className="w-8 h-8 text-blue-400 animate-bounce" />
          )}
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">
          {applySuccess
            ? 'Configuration Applied!'
            : applyError
            ? 'Configuration Failed'
            : 'Applying Configuration...'}
        </h2>
        <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
          {applySuccess
            ? `Your ${selectedPreset.name} preset has been successfully applied to your flight controller.`
            : applyError
            ? 'There was an error applying the configuration. You can try again or go back.'
            : `Applying ${selectedPreset.name} preset to your flight controller...`}
        </p>
      </div>

      {/* Progress bar */}
      {!applySuccess && !applyError && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">{applyProgress.currentTask || 'Starting...'}</span>
            <span className="text-zinc-500">{progressPercent}%</span>
          </div>
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="p-4 bg-zinc-800/50 rounded-xl">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Configuration Tasks</h3>
        <div className="space-y-2">
          {applyProgress.tasks.map((task, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 p-2 rounded-lg ${
                task.status === 'in_progress'
                  ? 'bg-blue-500/10'
                  : task.status === 'error'
                  ? 'bg-red-500/10'
                  : task.status === 'completed'
                  ? 'bg-green-500/5'
                  : ''
              }`}
            >
              <TaskStatusIcon status={task.status} />
              <span
                className={`text-sm ${
                  task.status === 'completed'
                    ? 'text-zinc-400'
                    : task.status === 'in_progress'
                    ? 'text-zinc-200'
                    : task.status === 'error'
                    ? 'text-red-300'
                    : 'text-zinc-500'
                }`}
              >
                {task.name}
              </span>
              {task.error && (
                <span className="text-xs text-red-400 ml-auto">{task.error}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error message */}
      {applyError && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-200 text-sm">Error Details</h4>
              <p className="text-xs text-red-100/70 mt-1">{applyError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success message */}
      {applySuccess && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-green-200 text-sm">What's Next?</h4>
              <p className="text-xs text-green-100/70 mt-1">
                Your configuration has been saved to EEPROM. You can fine-tune individual
                settings in the dedicated tabs, or test your setup now.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-zinc-700">
        {applySuccess ? (
          <>
            <div /> {/* Spacer */}
            <button
              onClick={closeWizard}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Done
            </button>
          </>
        ) : applyError ? (
          <>
            <button
              onClick={prevStep}
              className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <button
              onClick={() => {
                hasStartedRef.current = false;
                applyPreset();
              }}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </>
        ) : (
          <>
            <button
              onClick={prevStep}
              disabled={isApplying}
              className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              Cancel
            </button>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Please wait...
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ApplyStep;
