/**
 * RateCurve Component
 *
 * SVG visualization of rate curves for flight controller tuning.
 * Shows how stick input maps to rotation rate.
 */

import React, { useMemo } from 'react';

// Rate calculation functions for different rate types
export type RateType = 'betaflight' | 'raceflight' | 'kiss' | 'actual' | 'quick' | 'ardupilot';

/**
 * Calculate rate based on stick position and rate type
 */
export function calculateRate(
  stick: number,
  rcRate: number,
  superRate: number,
  expo: number,
  ratesType: number | RateType
): number {
  const absStick = Math.abs(stick);

  // Convert string type to number for internal use
  const typeNum = typeof ratesType === 'string'
    ? { betaflight: 0, raceflight: 1, kiss: 2, actual: 3, quick: 4, ardupilot: 5 }[ratesType] ?? 0
    : ratesType;

  switch (typeNum) {
    case 0: // Betaflight
      const rcRateFactor = rcRate / 100;
      const superRateFactor = superRate / 100;
      const expoFactor = expo / 100;
      const expoValue = stick * Math.pow(absStick, 3) * expoFactor + stick * (1 - expoFactor);
      return rcRateFactor * (1 + absStick * superRateFactor * 0.01) * expoValue * 200;

    case 1: // Raceflight
      const rcCommandf = ((1 + 0.01 * expo * (stick * stick - 1.0)) * stick);
      return ((1 + 0.01 * superRate * rcCommandf * rcCommandf) * rcCommandf) * rcRate;

    case 2: // KISS
      const kissExpof = (expo / 100) * Math.pow(absStick, 3) * stick + stick * (1 - expo / 100);
      return (kissExpof * (rcRate / 10 + (rcRate / 10) * absStick * superRate / 100)) * 10;

    case 3: // Actual
      const expof = absStick * (Math.pow(stick, 5) * expo / 100 + stick * (1 - expo / 100));
      const centerSensitivity = rcRate * 10;
      const maxRate = superRate * 10;
      return (maxRate - centerSensitivity) * absStick + centerSensitivity;

    case 4: // Quick
      const rcRateQuick = rcRate * 2 / 10;
      const maxRateQuick = rcRateQuick + (rcRateQuick * superRate / 100 * absStick);
      const expoValueQuick = absStick * (Math.pow(stick, 5) * expo / 100 + stick * (1 - expo / 100));
      return maxRateQuick * expoValueQuick * 10;

    case 5: // ArduPilot (linear with expo)
      // ArduPilot uses simpler linear rates with expo
      const ardupilotExpo = expo / 100;
      const stickWithExpo = stick * (1 - ardupilotExpo) + Math.pow(stick, 3) * ardupilotExpo;
      return stickWithExpo * rcRate;

    default:
      return stick * rcRate;
  }
}

/**
 * Calculate maximum rate for a given configuration
 */
export function calculateMaxRate(
  rcRate: number,
  superRate: number,
  ratesType: number | RateType
): number {
  const typeNum = typeof ratesType === 'string'
    ? { betaflight: 0, raceflight: 1, kiss: 2, actual: 3, quick: 4, ardupilot: 5 }[ratesType] ?? 0
    : ratesType;

  switch (typeNum) {
    case 0: // Betaflight
      return Math.round((rcRate / 100) * (1 + superRate / 100) * 200 * 1.8);
    case 1: // Raceflight
      return Math.round((1 + superRate / 100) * rcRate);
    case 2: // KISS
      return Math.round((rcRate / 10 + (rcRate / 10) * superRate / 100) * 10);
    case 3: // Actual
      return superRate * 10;
    case 4: // Quick
      return Math.round((rcRate * 2 / 10 * (1 + superRate / 100)) * 10);
    case 5: // ArduPilot
      return rcRate;
    default:
      return rcRate;
  }
}

export interface RateCurveProps {
  /** RC Rate / Center sensitivity (0-200) */
  rcRate: number;
  /** Super Rate / Max rate (0-200) */
  superRate: number;
  /** Expo value (0-100) */
  expo: number;
  /** Curve color (CSS color) */
  color: string;
  /** Rate calculation type (default: 0 = Betaflight) */
  ratesType?: number | RateType;
  /** Show max rate label */
  showMaxRate?: boolean;
  /** Height of the SVG */
  height?: number;
  /** Optional class name */
  className?: string;
}

export function RateCurve({
  rcRate,
  superRate,
  expo,
  color,
  ratesType = 0,
  showMaxRate = true,
  height = 96,
  className = '',
}: RateCurveProps) {
  const points = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 100; i += 2) {
      const stick = i / 100;
      const rate = calculateRate(stick, rcRate, superRate, expo, ratesType);
      const x = 5 + (i / 100) * 90;
      const maxRate = calculateMaxRate(rcRate, superRate, ratesType);
      const normalizedRate = maxRate > 0 ? (rate / maxRate) * 90 : 0;
      const y = 95 - Math.min(normalizedRate, 90);
      pts.push(`${x},${y}`);
    }
    return pts.join(' ');
  }, [rcRate, superRate, expo, ratesType]);

  const maxRate = useMemo(() => {
    return calculateMaxRate(rcRate, superRate, ratesType);
  }, [rcRate, superRate, ratesType]);

  return (
    <div className={`bg-gray-900/50 rounded-lg p-3 border border-gray-800 ${className}`}>
      {showMaxRate && (
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span>Response Curve</span>
          <span className="text-gray-400">
            Max: <span style={{ color }}>{maxRate}°/s</span>
          </span>
        </div>
      )}
      <svg viewBox="0 0 100 100" style={{ height }} className="w-full">
        {/* Grid lines */}
        <line x1="5" y1="95" x2="95" y2="95" stroke="#374151" strokeWidth="0.5" />
        <line x1="5" y1="50" x2="95" y2="50" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
        <line x1="5" y1="5" x2="5" y2="95" stroke="#374151" strokeWidth="0.5" />
        <line x1="50" y1="5" x2="50" y2="95" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />

        {/* Axis labels */}
        <text x="50" y="99" fill="#6B7280" fontSize="4" textAnchor="middle">Stick</text>
        <text x="2" y="50" fill="#6B7280" fontSize="4" textAnchor="middle" transform="rotate(-90, 2, 50)">Rate</text>

        {/* Rate curve */}
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          points={points}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/**
 * Compact rate curve for smaller spaces
 */
export function CompactRateCurve({
  rcRate,
  superRate,
  expo,
  color,
  ratesType = 0,
}: Omit<RateCurveProps, 'showMaxRate' | 'height' | 'className'>) {
  return (
    <RateCurve
      rcRate={rcRate}
      superRate={superRate}
      expo={expo}
      color={color}
      ratesType={ratesType}
      showMaxRate={false}
      height={64}
      className="p-2"
    />
  );
}

export default RateCurve;
