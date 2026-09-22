export type OutputShape = 'angular' | 'bipolar' | 'unidirectional' | 'discrete' | 'motor';

export interface OutputShapeResult {
  shape: OutputShape;
  /** True when the function name settled it; false when we inferred from endpoints. */
  confident: boolean;
}

export interface OutputShapeInput {
  /** SERVOn_FUNCTION label from parameter metadata, e.g. "GroundSteering". */
  functionName?: string;
  min?: number;
  trim?: number;
  max?: number;
}

/** Matched on the vehicle's own labels, so new names need no enum table. */
const ANGULAR = [
  /^GroundSteering$/i,
  /^Aileron/i,
  /^Elevator$/i,
  /^Rudder$/i,
  /^Elevon(Left|Right)$/i,
  /^VTail(Left|Right)$/i,
  /^Flaperon(Left|Right)$/i,
  /^DifferentialSpoiler/i,
  /^Mount\d*(Yaw|Pitch|Roll)$/i,
  /^TiltMotor/i,
  /^SailMastRotation$/i,
  /^WingSailElevator$/i,
];

/** Mixer-driven: MIN/MAX are calibration, not travel, so they are display-only. */
const MOTOR = [/^Motor\d+$/i];

const DISCRETE = [
  /^NeoPixel/i,
  /^ProfiLED/i,
  /^Alarm/i,
  /^GPIO$/i,
  /Clutch$/i,
  /Retract$/i,
  /^CameraTrigger$/i,
  /^Parachute$/i,
  /^LandingGear$/i,
  /^EngineRunEnable$/i,
];

/** Fraction of the span that trim may sit from the midpoint and still count as centred. */
const CENTRED_TOLERANCE = 0.1;

/** Known names decide it; otherwise infer from where the builder put TRIM. */
export function classifyOutput({ functionName, min, trim, max }: OutputShapeInput): OutputShapeResult {
  const name = functionName?.trim();

  if (name) {
    if (MOTOR.some((re) => re.test(name))) return { shape: 'motor', confident: true };
    if (DISCRETE.some((re) => re.test(name))) return { shape: 'discrete', confident: true };
    if (ANGULAR.some((re) => re.test(name))) return { shape: 'angular', confident: true };
  }

  if (
    min !== undefined && max !== undefined && trim !== undefined &&
    Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(trim) &&
    max > min
  ) {
    const mid = (min + max) / 2;
    const centred = Math.abs(trim - mid) <= (max - min) * CENTRED_TOLERANCE;
    return { shape: centred ? 'bipolar' : 'unidirectional', confident: false };
  }

  return { shape: 'unidirectional', confident: false };
}

/** Travel either side of trim, in µs. Uses the shorter side of an uneven pair. */
export function travelFromEndpoints(min: number, trim: number, max: number): number {
  return Math.max(0, Math.min(trim - min, max - trim));
}

/** Only a stick-driven output centred on trim has a travel the user may set. */
export function isTravelEditable(shape: OutputShape): boolean {
  return shape === 'angular' || shape === 'bipolar';
}
