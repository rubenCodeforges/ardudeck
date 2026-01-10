/**
 * ServoTestStep
 *
 * Step 3: Live test servos with reverse buttons.
 * Move transmitter sticks and verify servos respond correctly.
 */

import { useServoWizardStore } from '../../../stores/servo-wizard-store';
import { CONTROL_SURFACE_INFO } from '../presets/servo-presets';
import ServoBar from '../shared/ServoBar';

export default function ServoTestStep() {
  const {
    assignments,
    servoValues,
    isPollingServos,
    reverseServo,
    startServoPolling,
    stopServoPolling,
    nextStep,
    prevStep,
  } = useServoWizardStore();

  // Get servo value for an assignment
  const getServoValue = (servoIndex: number) => {
    return servoValues[servoIndex] || 1500;
  };

  // Determine if servo is moving (not near center)
  const isServoMoving = (value: number) => {
    return Math.abs(value - 1500) > 50;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-white">Test Your Servos</h2>
        <p className="text-sm text-zinc-400 mt-2">
          Move your transmitter sticks and verify each servo responds correctly.
          <br />
          If a servo moves the <strong className="text-zinc-300">wrong way</strong>, click <strong className="text-blue-400">Reverse</strong>.
        </p>
      </div>

      {/* Polling status */}
      <div className="flex items-center justify-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPollingServos}
            onChange={(e) => (e.target.checked ? startServoPolling() : stopServoPolling())}
            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/50"
          />
          <span className="text-sm text-zinc-400">
            {isPollingServos ? (
              <span className="text-green-400">● Live servo polling enabled</span>
            ) : (
              'Enable live servo polling'
            )}
          </span>
        </label>
      </div>

      {/* Servo test cards */}
      <div className="space-y-4">
        {assignments.map((assignment, index) => {
          const surfaceInfo = CONTROL_SURFACE_INFO[assignment.surface];
          const value = getServoValue(assignment.servoIndex);
          const moving = isServoMoving(value);

          return (
            <div
              key={assignment.surface}
              className={`bg-zinc-900/50 rounded-xl border p-4 transition-all ${
                moving
                  ? 'border-green-500/50 bg-green-500/5'
                  : 'border-zinc-800/50'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{surfaceInfo.name}</span>
                    <span className="text-xs px-2 py-0.5 bg-zinc-800 rounded text-zinc-400">
                      Servo {assignment.servoIndex}
                    </span>
                    {assignment.reversed && (
                      <span className="text-xs px-2 py-0.5 bg-yellow-500/20 rounded text-yellow-400">
                        Reversed
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {getServoTestInstruction(assignment.surface)}
                  </div>
                </div>
                <button
                  onClick={() => reverseServo(index)}
                  className={`px-4 py-2 text-sm rounded-lg transition-all ${
                    assignment.reversed
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                  }`}
                >
                  {assignment.reversed ? '↩ Undo Reverse' : '↔ Reverse'}
                </button>
              </div>

              {/* Servo bar */}
              <ServoBar
                value={value}
                min={assignment.min}
                max={assignment.max}
                center={assignment.center}
                showLabels={false}
                height={20}
              />

              {/* Status indicator */}
              <div className="mt-2 flex items-center gap-2">
                {moving ? (
                  <>
                    <span className="text-green-400">✓</span>
                    <span className="text-xs text-green-400">Servo is responding</span>
                  </>
                ) : (
                  <>
                    <span className="text-zinc-500">○</span>
                    <span className="text-xs text-zinc-500">Move stick to test</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Help tip */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
        <span className="text-xl">💡</span>
        <div>
          <p className="text-sm text-amber-400 font-medium">How to check direction:</p>
          <ul className="text-xs text-zinc-400 mt-1 space-y-1 list-disc list-inside">
            <li><strong>Ailerons:</strong> Roll stick right → right aileron should go UP, left should go DOWN</li>
            <li><strong>Elevator:</strong> Pull stick back → trailing edge should go UP</li>
            <li><strong>Rudder:</strong> Yaw stick right → rudder should move RIGHT</li>
            <li><strong>Elevons:</strong> Test both roll and pitch movements</li>
          </ul>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={prevStep}
          className="px-6 py-2.5 rounded-lg font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        >
          ← Back
        </button>
        <button
          onClick={nextStep}
          className="px-6 py-2.5 rounded-lg font-medium bg-blue-500 text-white hover:bg-blue-400"
        >
          Continue: Calibrate →
        </button>
      </div>
    </div>
  );
}

// Get test instruction for a control surface
function getServoTestInstruction(surface: string): string {
  switch (surface) {
    case 'aileron_left':
      return 'Move roll stick RIGHT → this servo should move DOWN';
    case 'aileron_right':
      return 'Move roll stick RIGHT → this servo should move UP';
    case 'elevator':
      return 'Pull pitch stick BACK → trailing edge should go UP';
    case 'rudder':
      return 'Move yaw stick RIGHT → rudder should deflect RIGHT';
    case 'elevon_left':
      return 'Roll RIGHT → DOWN. Pitch BACK → UP (trailing edge)';
    case 'elevon_right':
      return 'Roll RIGHT → UP. Pitch BACK → UP (trailing edge)';
    case 'vtail_left':
      return 'Pitch BACK and Yaw RIGHT → test both movements';
    case 'vtail_right':
      return 'Pitch BACK and Yaw RIGHT → test both movements';
    case 'yaw_servo':
      return 'Move yaw stick → motor should tilt';
    case 'gimbal_pan':
      return 'Move yaw stick → camera should rotate horizontally';
    case 'gimbal_tilt':
      return 'Move pitch stick → camera should tilt up/down';
    default:
      return 'Move the corresponding stick';
  }
}
