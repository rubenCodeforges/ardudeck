import { useState, useEffect, useCallback } from 'react';
import { TileCacheCard } from './TileCacheCard';
import { UnitSelectionCard } from './UnitSelectionCard';
import { useSettingsStore, type VehicleProfile, type VehicleType, type ExperienceLevel, type UiVisibility } from '../../stores/settings-store';
import { useParameterStore } from '../../stores/parameter-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useUpdateStore } from '../../stores/update-store';
import { ScriptInstallModal } from '../script-installer/ScriptInstallModal';
import { VehicleTemplatePicker } from './vehicle-profile/VehicleTemplatePicker';
import { ApplyProfileButton } from './vehicle-profile/ApplyProfileButton';
import { DriftBadge } from './vehicle-profile/DriftBadge';
import { SnapshotList } from './vehicle-profile/SnapshotList';
import { TemplateChip } from './vehicle-profile/TemplateChip';
import { ConfigSelectors } from './vehicle-profile/ConfigSelectors';
import { PhysicsAdvanced } from './vehicle-profile/PhysicsAdvanced';
import { ParamsPreview } from './vehicle-profile/ParamsPreview';
import { StallSpeedCalcButton } from './vehicle-profile/StallSpeedCalcButton';
import { inferProfileFromParams } from '../../lib/vehicle-templates/import';
import { saveParmToFile } from '../../lib/vehicle-templates/export-parm';
import { getTemplate, defaultTemplateForType } from '../../lib/vehicle-templates/registry';
import { Download } from 'lucide-react';
import type { VehicleTemplate } from '../../lib/vehicle-templates/types';
import {
  AREA_INPUT_PRECISION,
  areaInputValueFromSquareCentimeters,
  altitudeValueFromMeters,
  capacityValueFromMah,
  dimensionInputValueFromMillimeters,
  formatAltitudeFromMeters,
  formatCapacityFromMah,
  formatDimensionFromMillimeters,
  formatSpeedFromMetersPerSecond,
  formatWeightFromGrams,
  speedValueFromMetersPerSecond,
  toGramsFromWeightUnit,
  toMahFromCapacityUnit,
  toMetersPerSecondFromSpeedUnit,
  toMetersFromAltitudeUnit,
  toMillimetersFromDimensionUnit,
  toSquareCentimetersFromAreaUnit,
  UNIT_LABELS,
  UNIT_PRECISION,
  weightInputValueFromGrams,
  type AreaUnit,
  type AltitudeUnit,
  type DimensionUnit,
  type ElectricCapacityUnit,
  type SpeedUnit,
  type WeightUnit,
} from '../../../shared/user-units.js';

// Display unit conversion helpers - storage stays in each field's native unit.
function fmtWeight(g: number, unit: WeightUnit): string {
  return formatWeightFromGrams(g, unit);
}
function fmtLength(mm: number, unit: DimensionUnit): string {
  return formatDimensionFromMillimeters(mm, unit);
}
function fmtCapacity(mah: number, unit: ElectricCapacityUnit): string {
  return formatCapacityFromMah(mah, unit);
}

const MISSION_ALTITUDE_FIELDS = new Set([
  'safeAltitudeBuffer',
  'defaultWaypointAltitude',
  'defaultTakeoffAltitude',
]);

const ALTITUDE_INPUT_PRECISION: Record<AltitudeUnit, number> = {
  m: UNIT_PRECISION.altitude.m,
  km: 3,
  ft: 2,
};

function isMissionAltitudeField(field: string): boolean {
  return MISSION_ALTITUDE_FIELDS.has(field);
}

function altitudeInputValueFromMeters(meters: number | undefined, unit: AltitudeUnit): string {
  if (meters === undefined || !Number.isFinite(meters)) return '';
  const decimals = ALTITUDE_INPUT_PRECISION[unit];
  return String(Number(altitudeValueFromMeters(meters, unit).toFixed(decimals)));
}

function altitudeInputStep(unit: AltitudeUnit): string {
  return unit === 'm' ? '1' : String(1 / (10 ** ALTITUDE_INPUT_PRECISION[unit]));
}

function clampAltitudeMetersToRules(meters: number, rules: FieldValidation): number {
  let next = meters;
  if (rules.min !== undefined) next = Math.max(rules.min, next);
  if (rules.max !== undefined) next = Math.min(rules.max, next);
  return next;
}

function speedInputValueFromMetersPerSecond(mps: number | undefined, unit: SpeedUnit): string {
  if (mps === undefined || !Number.isFinite(mps)) return '';
  return String(Number(speedValueFromMetersPerSecond(mps, unit).toFixed(UNIT_PRECISION.speed[unit])));
}

function speedInputStep(unit: SpeedUnit): string {
  return String(1 / (10 ** UNIT_PRECISION.speed[unit]));
}

function clampSpeedMetersPerSecondToRules(mps: number, rules: FieldValidation): number {
  let next = mps;
  if (rules.min !== undefined) next = Math.max(rules.min, next);
  if (rules.max !== undefined) next = Math.min(rules.max, next);
  return next;
}

function validateSpeedField(value: string, rules: FieldValidation, unit: SpeedUnit): string | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return rules.required ? 'Required' : null;
  }
  const displayValue = Number(trimmed);
  if (!Number.isFinite(displayValue)) return 'Invalid number';

  const metersPerSecond = toMetersPerSecondFromSpeedUnit(displayValue, unit);
  if (rules.min !== undefined && metersPerSecond < rules.min) {
    return `Min: ${speedInputValueFromMetersPerSecond(rules.min, unit)} ${UNIT_LABELS.speed[unit]}`;
  }
  if (rules.max !== undefined && metersPerSecond > rules.max) {
    return `Max: ${speedInputValueFromMetersPerSecond(rules.max, unit)} ${UNIT_LABELS.speed[unit]}`;
  }
  return null;
}

// Vehicle types supported by each firmware
// Betaflight: Only multirotors (racing/freestyle focused)
// iNav: Multirotors, planes, rovers (GPS navigation firmware)
// MAVLink (ArduPilot): Everything
const FIRMWARE_SUPPORTED_TYPES: Record<string, VehicleType[]> = {
  BTFL: ['copter'],  // Betaflight - racing/freestyle multirotors only
  CLFL: ['copter'],  // Cleanflight - multirotors only
  INAV: ['copter', 'plane', 'rover', 'boat'],  // iNav - navigation firmware
  // MAVLink/ArduPilot supports everything via different firmware (Copter, Plane, Rover, Sub)
};

// Map MAV_TYPE to our vehicle types
// See: https://mavlink.io/en/messages/common.html#MAV_TYPE
const mavTypeToVehicleType: Record<number, VehicleType> = {
  0: 'copter',    // MAV_TYPE_GENERIC
  1: 'plane',     // MAV_TYPE_FIXED_WING
  2: 'copter',    // MAV_TYPE_QUADROTOR
  3: 'copter',    // MAV_TYPE_COAXIAL
  4: 'copter',    // MAV_TYPE_HELICOPTER
  10: 'rover',    // MAV_TYPE_GROUND_ROVER
  11: 'boat',     // MAV_TYPE_SURFACE_BOAT
  12: 'sub',      // MAV_TYPE_SUBMARINE
  13: 'copter',   // MAV_TYPE_HEXAROTOR
  14: 'copter',   // MAV_TYPE_OCTOROTOR
  15: 'copter',   // MAV_TYPE_TRICOPTER
  16: 'plane',    // MAV_TYPE_FLAPPING_WING (legacy APM uses this for planes!)
  19: 'vtol',     // MAV_TYPE_VTOL_DUOROTOR
  20: 'vtol',     // MAV_TYPE_VTOL_QUADROTOR
  21: 'vtol',     // MAV_TYPE_VTOL_TILTROTOR
  22: 'vtol',     // MAV_TYPE_VTOL_RESERVED2
  23: 'vtol',     // MAV_TYPE_VTOL_RESERVED3
  24: 'vtol',     // MAV_TYPE_VTOL_RESERVED4
  25: 'vtol',     // MAV_TYPE_VTOL_RESERVED5
};

// Module-level variable to track auto-detection session (survives component remounts)
let lastAutoDetectSession: string | null = null;

// Vehicle type icons (SVG paths)
const VEHICLE_ICONS: Record<VehicleType, React.ReactNode> = {
  copter: (
    <svg viewBox="0 0 32 32" className="w-full h-full" fill="currentColor">
      <path d="M7,12a5,5,0,1,1,5-5H10a3,3,0,1,0-3,3Z" />
      <path d="M25,12V10a3,3,0,1,0-3-3H20a5,5,0,1,1,5,5Z" />
      <path d="M7,30A5,5,0,0,1,7,20v2a3,3,0,1,0,3,3h2A5.0055,5.0055,0,0,1,7,30Z" />
      <path d="M25,30a5.0055,5.0055,0,0,1-5-5h2a3,3,0,1,0,3-3V20a5,5,0,0,1,0,10Z" />
      <path d="M20,18.5859V13.4141L25.707,7.707a1,1,0,1,0-1.414-1.414l-4.4995,4.5a3.9729,3.9729,0,0,0-7.587,0L7.707,6.293a.9994.9994,0,0,0-1.414,0h0a.9994.9994,0,0,0,0,1.414L12,13.4141v5.1718L6.293,24.293a.9994.9994,0,0,0,0,1.414h0a.9994.9994,0,0,0,1.414,0l4.5-4.5a3.9729,3.9729,0,0,0,7.587,0l4.4995,4.5a1,1,0,0,0,1.414-1.414ZM18,20a2,2,0,0,1-4,0V12a2,2,0,0,1,4,0Z" />
    </svg>
  ),
  plane: (
    <svg viewBox="0 0 16 16" className="w-full h-full">
      {/* Streamline airplane icon - rotated to point left */}
      <g transform="rotate(-90 8 8)">
        <path d="M9.333333333333332 5.964913333333333 14.666666666666666 9.333333333333332v1.3333333333333333l-5.333333333333333 -1.6842v3.5730666666666666L11.333333333333332 13.666666666666666V14.666666666666666l-3 -0.6666666666666666L5.333333333333333 14.666666666666666v-1l2 -1.1111333333333333v-3.5730666666666666L2 10.666666666666666v-1.3333333333333333l5.333333333333333 -3.3684199999999995V2.333333333333333c0 -0.5522866666666666 0.4477333333333333 -1 1 -1s1 0.4477133333333333 1 1v3.63158Z" fill="currentColor" />
      </g>
    </svg>
  ),
  vtol: (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {/* Fuselage */}
      <ellipse cx="50" cy="50" rx="25" ry="6" fill="currentColor" opacity="0.9" />
      {/* Wings */}
      <rect x="25" y="45" width="50" height="10" rx="2" fill="currentColor" opacity="0.7" />
      {/* Front rotors */}
      <circle cx="25" cy="35" r="6" fill="currentColor" opacity="0.6" />
      <circle cx="75" cy="35" r="6" fill="currentColor" opacity="0.6" />
      {/* Rear rotors */}
      <circle cx="25" cy="65" r="6" fill="currentColor" opacity="0.6" />
      <circle cx="75" cy="65" r="6" fill="currentColor" opacity="0.6" />
      {/* Tail */}
      <path d="M75 50 L90 45 L90 55 Z" fill="currentColor" opacity="0.7" />
    </svg>
  ),
  rover: (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {/* Body */}
      <rect x="20" y="35" width="60" height="30" rx="5" fill="currentColor" opacity="0.9" />
      {/* Wheels */}
      <circle cx="30" cy="70" r="10" fill="currentColor" opacity="0.7" />
      <circle cx="70" cy="70" r="10" fill="currentColor" opacity="0.7" />
      {/* Antenna */}
      <line x1="70" y1="35" x2="75" y2="20" stroke="currentColor" strokeWidth="2" />
      <circle cx="75" cy="18" r="3" fill="currentColor" />
    </svg>
  ),
  boat: (
    <svg viewBox="0 100 475 270" className="w-full h-full" fill="currentColor">
      <path d="M474.057,253.807c-1.334-2.341-3.821-3.788-6.517-3.788H344.527l-31.122-61.4c-0.238-0.471-0.526-0.916-0.858-1.327c-4.803-5.935-12.059-14.904-24.214-14.904H169.711l-14.466-65.499c-0.759-3.436-3.805-5.882-7.323-5.882h-64c-2.219,0-4.324,0.982-5.749,2.684c-1.425,1.701-2.023,3.945-1.635,6.13l13.353,75.051l-60.441,65.147H7.5c-4.143,0-7.5,3.358-7.5,7.5v85.15c0,0.516,0.053,1.03,0.158,1.534c3.612,17.285,19.05,29.83,36.708,29.83H276.16c39.849,0,79.213-10.425,113.838-30.148c34.624-19.723,63.669-48.265,83.993-82.541C475.366,259.026,475.391,256.149,474.057,253.807z M276.16,359.033H36.866c-10.354,0-19.437-7.189-21.866-17.196v-22.311h360.354c4.143,0,7.5-3.358,7.5-7.5s-3.357-7.5-7.5-7.5H15v-39.507h293.02c4.143,0,7.5-3.358,7.5-7.5c0-4.142-3.357-7.5-7.5-7.5H49.91l43.272-46.642l4.788,26.91c0.646,3.634,3.809,6.188,7.375,6.188c0.436,0,0.879-0.039,1.322-0.117c4.078-0.726,6.796-4.62,6.07-8.698L92.873,116.007h49.023l14.467,65.499c0.848,3.84,4.499,6.33,8.329,5.809c0.326,0.043,0.656,0.073,0.995,0.073h122.646c4.083,0,7.319,2.939,12.057,8.73l5.29,10.437h-80.959c-4.143,0-7.5,3.358-7.5,7.5s3.357,7.5,7.5,7.5h88.563l19.948,39.355c1.261,2.488,3.791,4.057,6.568,4.072h119.618c-18.697,29.383-43.785,54.018-72.764,71.524C325.693,350.646,301.148,359.033,276.16,359.033z" />
    </svg>
  ),
  sub: (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {/* Body */}
      <ellipse cx="50" cy="50" rx="35" ry="12" fill="currentColor" opacity="0.9" />
      {/* Conning tower */}
      <rect x="40" y="35" width="15" height="10" rx="2" fill="currentColor" opacity="0.8" />
      {/* Periscope */}
      <line x1="47" y1="35" x2="47" y2="25" stroke="currentColor" strokeWidth="2" />
      {/* Propeller */}
      <circle cx="88" cy="50" r="5" fill="currentColor" opacity="0.6" />
    </svg>
  ),
};

const VEHICLE_TYPE_NAMES: Record<VehicleType, string> = {
  copter: 'Multicopter',
  plane: 'Fixed Wing',
  vtol: 'VTOL',
  rover: 'Rover',
  boat: 'Boat',
  sub: 'Submarine',
};

// Firmware display names
const FIRMWARE_NAMES: Record<string, string> = {
  BTFL: 'Betaflight',
  CLFL: 'Cleanflight',
  INAV: 'iNav',
};

// Check if a vehicle profile type is compatible with the connected board
function checkProfileCompatibility(
  profileType: VehicleType | undefined,
  fcVariant: string | undefined,
  protocol: 'mavlink' | 'msp' | undefined
): { compatible: boolean; message?: string; supportedTypes?: VehicleType[] } {
  if (!profileType || !protocol) return { compatible: true };

  // MAVLink (ArduPilot) supports all vehicle types
  if (protocol === 'mavlink') return { compatible: true };

  // MSP protocol - check firmware variant
  if (protocol === 'msp' && fcVariant) {
    const supportedTypes = FIRMWARE_SUPPORTED_TYPES[fcVariant];
    if (supportedTypes && !supportedTypes.includes(profileType)) {
      return {
        compatible: false,
        message: `Your ${VEHICLE_TYPE_NAMES[profileType]} profile is not compatible with ${FIRMWARE_NAMES[fcVariant] || fcVariant}`,
        supportedTypes,
      };
    }
  }

  return { compatible: true };
}

// Profile compatibility warning banner
function ProfileCompatibilityBanner({
  profileType,
  fcVariant,
  boardId,
  supportedTypes,
  onCreateNewProfile,
}: {
  profileType: VehicleType;
  fcVariant: string;
  boardId?: string;
  supportedTypes: VehicleType[];
  onCreateNewProfile: (type: VehicleType) => void;
}) {
  return (
    <div className="mb-6 bg-gradient-to-r from-amber-900/40 to-orange-900/30 border border-amber-500/40 rounded-xl p-4">
      <div className="flex items-start gap-4">
        {/* Warning Icon */}
        <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        {/* Message Content */}
        <div className="flex-1">
          <h3 className="text-lg font-medium text-amber-300">Profile Compatibility Issue</h3>
          <p className="text-sm text-content mt-1">
            Your current profile is configured for <span className="font-medium text-amber-400">{VEHICLE_TYPE_NAMES[profileType]}</span>,
            but you're connected to a <span className="font-medium text-blue-400">{FIRMWARE_NAMES[fcVariant] || fcVariant}</span> board
            {boardId && <span className="text-content-secondary"> ({boardId})</span>}.
          </p>
          <p className="text-sm text-content-secondary mt-2">
            {FIRMWARE_NAMES[fcVariant] || fcVariant} only supports: {supportedTypes.map(t => VEHICLE_TYPE_NAMES[t]).join(', ')}.
          </p>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2 mt-4">
            {supportedTypes.map((type) => (
              <button
                key={type}
                onClick={() => onCreateNewProfile(type)}
                className="flex items-center gap-2 px-3 py-2 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 rounded-lg text-sm text-amber-200 transition-colors"
              >
                <div className="w-5 h-5">{VEHICLE_ICONS[type]}</div>
                Create {VEHICLE_TYPE_NAMES[type]} Profile
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Circular gauge component
function CircularGauge({
  value,
  max,
  label,
  unit,
  color,
  size = 120,
}: {
  value: number;
  max: number;
  label: string;
  unit: string;
  color: string;
  size?: number;
}) {
  const safeValue = isFinite(value) ? Math.max(0, value) : 0;
  const percentage = max > 0 ? Math.min(100, (safeValue / max) * 100) : 0;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background circle */}
        <svg className="absolute inset-0 -rotate-90" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-content-tertiary"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-content">{safeValue}</span>
          <span className="text-xs text-content-secondary">{unit}</span>
        </div>
      </div>
      <span className="mt-2 text-sm text-content-secondary">{label}</span>
    </div>
  );
}

// Stat card component
function StatCard({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div className="bg-surface-raised rounded-lg p-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <div className="text-lg font-semibold text-content">{value}</div>
        <div className="text-xs text-content-secondary">{label}</div>
      </div>
    </div>
  );
}

// Weather data interface with aviation-relevant fields
interface WeatherData {
  temp: number;
  windSpeed: number;
  windGusts: number;
  windDir: number;
  visibility: number;  // km
  cloudCover: number;  // %
  humidity: number;    // %
  pressure: number;    // hPa
  condition: string;
  // Maritime-specific (for boats)
  waveHeight?: number;    // meters
  swellHeight?: number;   // meters
  swellDirection?: number; // degrees
  swellPeriod?: number;   // seconds
}

// Convert km/h to knots
const kmhToKnots = (kmh: number) => Math.round(kmh * 0.539957);

// Weather widget with caching and rate limiting
const weatherCache: {
  data: WeatherData | null;
  lat: number;
  lon: number;
  timestamp: number;
} = { data: null, lat: 0, lon: 0, timestamp: 0 };

const WEATHER_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const WEATHER_LOCATION_THRESHOLD = 0.01; // ~1km movement before refetch

function WeatherWidget({ vehicleType }: { vehicleType?: VehicleType }) {
  const gps = useTelemetryStore((s) => s.gps);
  const [weather, setWeather] = useState<WeatherData | null>(weatherCache.data);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationSource, setLocationSource] = useState<'vehicle' | 'device' | null>(null);

  // Fallback: Get user's device location if vehicle GPS is not available
  useEffect(() => {
    if (gps.lat !== 0 || gps.lon !== 0) {
      // Vehicle GPS is available, use it
      setLocationSource('vehicle');
      return;
    }

    // Try IP-based geolocation (more reliable than browser geolocation)
    const fetchIpLocation = async () => {
      try {
        // Use ip-api.com (free, no API key needed, 45 req/min limit)
        const response = await fetch('http://ip-api.com/json/?fields=lat,lon,status');
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success' && data.lat && data.lon) {
            setUserLocation({ lat: data.lat, lon: data.lon });
            setLocationSource('device');
            return;
          }
        }
      } catch (err) {
        console.log('IP geolocation failed:', err);
      }

      // Fallback: try browser geolocation if IP lookup fails
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({
              lat: position.coords.latitude,
              lon: position.coords.longitude,
            });
            setLocationSource('device');
          },
          (error) => {
            console.log('Browser geolocation error:', error.message);
          },
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
        );
      }
    };

    fetchIpLocation();
  }, [gps.lat, gps.lon]);

  // Determine which location to use
  const effectiveLat = gps.lat !== 0 ? gps.lat : userLocation?.lat ?? 0;
  const effectiveLon = gps.lon !== 0 ? gps.lon : userLocation?.lon ?? 0;

  useEffect(() => {
    // Only fetch if we have coords from either source
    if (effectiveLat === 0 && effectiveLon === 0) return;

    // Check if cache is still valid (same location within threshold, not expired)
    const now = Date.now();
    const locationChanged =
      Math.abs(effectiveLat - weatherCache.lat) > WEATHER_LOCATION_THRESHOLD ||
      Math.abs(effectiveLon - weatherCache.lon) > WEATHER_LOCATION_THRESHOLD;
    const cacheExpired = now - weatherCache.timestamp > WEATHER_CACHE_DURATION;

    // Use cache if valid
    if (weatherCache.data && !locationChanged && !cacheExpired) {
      setWeather(weatherCache.data);
      return;
    }

    // Don't fetch if we fetched recently (rate limit protection)
    if (now - weatherCache.timestamp < 30000) { // 30 second minimum between fetches
      return;
    }

    const fetchWeather = async () => {
      setLoading(true);
      try {
        // Fetch standard weather data
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${effectiveLat.toFixed(4)}&longitude=${effectiveLon.toFixed(4)}&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,visibility,cloud_cover,relative_humidity_2m,surface_pressure`
        );

        if (!response.ok) {
          console.warn('Weather API returned:', response.status);
          setLoading(false);
          return;
        }

        const data = await response.json();

        // For boats, also fetch marine data
        let marineData: { waveHeight?: number; swellHeight?: number; swellDirection?: number; swellPeriod?: number } = {};
        if (vehicleType === 'boat' || vehicleType === 'sub') {
          try {
            const marineResponse = await fetch(
              `https://marine-api.open-meteo.com/v1/marine?latitude=${effectiveLat.toFixed(4)}&longitude=${effectiveLon.toFixed(4)}&current=wave_height,swell_wave_height,swell_wave_direction,swell_wave_period`
            );
            if (marineResponse.ok) {
              const marine = await marineResponse.json();
              if (marine.current) {
                marineData = {
                  waveHeight: marine.current.wave_height,
                  swellHeight: marine.current.swell_wave_height,
                  swellDirection: marine.current.swell_wave_direction,
                  swellPeriod: marine.current.swell_wave_period,
                };
              }
            }
          } catch (marineErr) {
            console.warn('Marine API failed:', marineErr);
          }
        }

        if (data.current) {
          const weatherCode = data.current.weather_code;
          let condition = 'Clear';
          // WMO Weather interpretation codes
          if (weatherCode >= 95) condition = 'Thunderstorm';       // 95, 96, 99
          else if (weatherCode >= 71 && weatherCode <= 77) condition = 'Snow';  // 71-77
          else if (weatherCode >= 51) condition = 'Rain';          // 51-67, 80-82
          else if (weatherCode >= 45) condition = 'Fog';           // 45, 48
          else if (weatherCode >= 3) condition = 'Cloudy';         // 3
          else if (weatherCode >= 1) condition = 'Partly Cloudy';  // 1, 2

          const weatherData: WeatherData = {
            temp: Math.round(data.current.temperature_2m),
            windSpeed: Math.round(data.current.wind_speed_10m),
            windGusts: Math.round(data.current.wind_gusts_10m || data.current.wind_speed_10m),
            windDir: data.current.wind_direction_10m,
            visibility: Math.round((data.current.visibility || 10000) / 1000), // Convert to km
            cloudCover: Math.round(data.current.cloud_cover || 0),
            humidity: Math.round(data.current.relative_humidity_2m || 0),
            pressure: Math.round(data.current.surface_pressure || 1013),
            condition,
            ...marineData,
          };

          // Update cache
          weatherCache.data = weatherData;
          weatherCache.lat = effectiveLat;
          weatherCache.lon = effectiveLon;
          weatherCache.timestamp = now;

          setWeather(weatherData);
        }
      } catch (err) {
        console.error('Failed to fetch weather:', err);
      }
      setLoading(false);
    };

    fetchWeather();

    // Refresh every 10 minutes (only if component still mounted)
    const interval = setInterval(() => {
      // Only refetch if cache expired
      if (Date.now() - weatherCache.timestamp > WEATHER_CACHE_DURATION) {
        fetchWeather();
      }
    }, WEATHER_CACHE_DURATION);

    return () => clearInterval(interval);
  }, [effectiveLat, effectiveLon, vehicleType]); // Refetch when location or vehicle type changes

  const getWindDirection = (deg: number) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return directions[Math.round(deg / 45) % 8];
  };

  // No location available at all
  if (effectiveLat === 0 && effectiveLon === 0) {
    return (
      <div className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4 h-full">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
          <span className="text-sm font-medium text-content-secondary">Weather</span>
        </div>
        <div className="text-center py-6">
          <svg className="w-12 h-12 text-content-tertiary mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <div className="text-content-secondary text-sm">Getting location...</div>
          <div className="text-content-tertiary text-xs mt-1">Connect vehicle or allow location access</div>
        </div>
      </div>
    );
  }

  if (loading && !weather) {
    return (
      <div className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4 h-full">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
          <span className="text-sm font-medium text-content-secondary">Weather</span>
        </div>
        <div className="text-center py-6">
          <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-2" />
          <div className="text-content-secondary text-sm">Loading weather...</div>
        </div>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4 h-full">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
          <span className="text-sm font-medium text-content-secondary">Weather</span>
        </div>
        <div className="text-center py-6">
          <div className="text-content-secondary text-sm">Unavailable</div>
        </div>
      </div>
    );
  }

  // Flight conditions assessment
  const isAirVehicle = !vehicleType || ['copter', 'plane', 'vtol'].includes(vehicleType);
  const isMaritime = vehicleType === 'boat' || vehicleType === 'sub';
  const windLimit = isAirVehicle ? 25 : 40;
  const gustLimit = isAirVehicle ? 35 : 50;
  const visibilityLimit = isAirVehicle ? 3 : 1;

  const isBad = weather.windSpeed >= windLimit || weather.windGusts >= gustLimit || weather.condition === 'Rain' || weather.condition === 'Thunderstorm' || weather.visibility < visibilityLimit;
  const isCaution = weather.windSpeed >= windLimit * 0.6 || weather.windGusts >= gustLimit * 0.7 || weather.condition === 'Fog' || weather.condition === 'Snow' || weather.visibility < visibilityLimit * 2;

  // Weather-based gradient colors
  const getWeatherGradient = () => {
    if (isBad) return 'from-red-900/50 via-red-800/30 to-surface-base';
    if (isCaution) return 'from-amber-900/50 via-amber-800/30 to-surface-base';
    if (weather.condition === 'Clear') return 'from-blue-900/50 via-cyan-900/30 to-surface-base';
    if (weather.condition === 'Partly Cloudy') return 'from-slate-800/50 via-blue-900/30 to-surface-base';
    return 'from-surface via-surface to-surface-base';
  };

  const getBorderColor = () => {
    if (isBad) return 'border-red-500/40';
    if (isCaution) return 'border-amber-500/40';
    if (weather.condition === 'Clear') return 'border-blue-500/40';
    return 'border-border';
  };

  const getStatusColor = () => {
    if (isBad) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (isCaution) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  };

  // Weather icon based on condition
  const WeatherIcon = () => {
    const iconClass = `w-10 h-10 ${isBad ? 'text-red-400' : isCaution ? 'text-amber-400' : weather.condition === 'Clear' ? 'text-yellow-400' : 'text-blue-400'}`;

    if (weather.condition === 'Thunderstorm') return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 11L10 16H15L12 21M6 16.4438C4.22194 15.5683 3 13.7502 3 11.6493C3 9.20008 4.8 6.9375 7.5 6.5C8.34694 4.48637 10.3514 3 12.6893 3C15.684 3 18.1317 5.32251 18.3 8.25C19.8893 8.94488 21 10.6503 21 12.4969C21 14.0582 20.206 15.4339 19 16.2417" />
      </svg>
    );
    if (weather.condition === 'Rain') return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 14.7519C3.37037 13.8768 3 12.8059 3 11.6493C3 9.20008 4.8 6.9375 7.5 6.5C8.34694 4.48637 10.3514 3 12.6893 3C15.684 3 18.1317 5.32251 18.3 8.25C19.8893 8.94488 21 10.6503 21 12.4969C21 13.5693 20.6254 14.5541 20 15.3275M12.5 12.9995L10.5 21.0008M8.5 11.9995L6.5 20.0008M16.5 12L14.5 20.0013" />
      </svg>
    );
    if (weather.condition === 'Snow') return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.5 15H9.51M15.5 15H15.51M9.5 19H9.51M12.5 17H12.51M12.5 21H12.51M15.5 19H15.51M6 16.4438C4.22194 15.5683 3 13.7502 3 11.6493C3 9.20008 4.8 6.9375 7.5 6.5C8.34694 4.48637 10.3514 3 12.6893 3C15.684 3 18.1317 5.32251 18.3 8.25C19.8893 8.94488 21 10.6503 21 12.4969C21 14.0582 20.206 15.4339 19 16.2417" />
      </svg>
    );
    if (weather.condition === 'Cloudy') return (
      <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 4C8.68 4 6 6.68 6 10c0 .34.03.67.08 1H6c-2.21 0-4 1.79-4 4s1.79 4 4 4h12c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96C17.45 6.19 15.02 4 12 4z"/>
      </svg>
    );
    if (weather.condition === 'Partly Cloudy') return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.0947 8.02658C11.5476 5.73111 13.5717 4 16 4C18.7614 4 21 6.23858 21 9C21 11.0345 19.7849 12.7852 18.0408 13.5659M11.0947 8.02658C9.24194 8.21766 7.68947 9.4193 7 11C4.6 11.375 3 13.3144 3 15.4137C3 17.9466 5.14903 20 7.8 20L15 20C17.2091 20 19 18.2719 19 16.1402C19 15.1829 18.6388 14.2698 18.0408 13.5659M11.0947 8.02658C11.265 8.00902 11.4378 8 11.6127 8C14.2747 8 16.4504 9.99072 16.6 12.5C17.1583 12.7354 17.6501 13.106 18.0408 13.5659" />
      </svg>
    );
    if (weather.condition === 'Fog') return (
      <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 15h18v2H3v-2zm0 4h18v2H3v-2zm0-8h18v2H3v-2zm0-4h18v2H3V7z"/>
      </svg>
    );
    // Clear/sunny
    return (
      <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41.39.39 1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41.39.39 1.03.39 1.41 0l1.06-1.06z"/>
      </svg>
    );
  };

  // Get vehicle-specific label
  const getVehicleLabel = () => {
    if (!vehicleType) return 'Flight';
    switch (vehicleType) {
      case 'copter':
      case 'plane':
      case 'vtol': return 'Flight';
      case 'boat': return 'Maritime';
      case 'sub': return 'Dive';
      case 'rover': return 'Drive';
      default: return 'Operation';
    }
  };

  return (
    <div className={`bg-gradient-to-br ${getWeatherGradient()} rounded-xl border ${getBorderColor()} p-4 h-full`}>
      {/* Header with status badge */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <WeatherIcon />
          <div>
            <div className="text-2xl font-bold text-content">{weather.temp}°C</div>
            <div className="text-sm text-content-secondary">{weather.condition}</div>
          </div>
        </div>
        <div className="text-right">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${getStatusColor()}`}>
            {isBad ? 'No Go' : isCaution ? 'Caution' : 'Good'}
          </span>
          <div className="text-[10px] text-content-secondary mt-1 flex items-center justify-end gap-1">
            {locationSource === 'device' && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            )}
            {locationSource === 'vehicle' && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
            )}
            {getVehicleLabel()} conditions
          </div>
        </div>
      </div>

      {/* Wind section - show knots for maritime, km/h for others */}
      <div className="bg-black/20 rounded-lg p-3 mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <div>
              {isMaritime ? (
                <>
                  <div className="text-lg font-semibold text-content">{kmhToKnots(weather.windSpeed)} <span className="text-sm font-normal text-content-secondary">kts</span></div>
                  <div className="text-xs text-content-secondary">Wind from {getWindDirection(weather.windDir)}</div>
                </>
              ) : (
                <>
                  <div className="text-lg font-semibold text-content">{weather.windSpeed} <span className="text-sm font-normal text-content-secondary">km/h</span></div>
                  <div className="text-xs text-content-secondary">Wind from {getWindDirection(weather.windDir)}</div>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            {isMaritime ? (
              <>
                <div className={`text-lg font-semibold ${weather.windGusts > weather.windSpeed * 1.3 ? 'text-amber-400' : 'text-content'}`}>
                  {kmhToKnots(weather.windGusts)} <span className="text-sm font-normal text-content-secondary">kts</span>
                </div>
                <div className="text-xs text-content-secondary">Gusts</div>
              </>
            ) : (
              <>
                <div className={`text-lg font-semibold ${weather.windGusts > weather.windSpeed * 1.3 ? 'text-amber-400' : 'text-content'}`}>
                  {weather.windGusts} <span className="text-sm font-normal text-content-secondary">km/h</span>
                </div>
                <div className="text-xs text-content-secondary">Gusts</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Maritime-specific: Wave and Swell data */}
      {isMaritime && (weather.waveHeight !== undefined || weather.swellHeight !== undefined) && (
        <div className="bg-black/20 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 12c1.5-2 3.5-3 5.5-3s4 1 5.5 3c1.5-2 3.5-3 5.5-3s4 1 5.5 3v2c-1.5-2-3.5-3-5.5-3s-4 1-5.5 3c-1.5-2-3.5-3-5.5-3s-4 1-5.5 3v-2z"/>
                <path d="M2 17c1.5-2 3.5-3 5.5-3s4 1 5.5 3c1.5-2 3.5-3 5.5-3s4 1 5.5 3v2c-1.5-2-3.5-3-5.5-3s-4 1-5.5 3c-1.5-2-3.5-3-5.5-3s-4 1-5.5 3v-2z"/>
              </svg>
              <div>
                <div className={`text-lg font-semibold ${(weather.waveHeight || 0) > 1.5 ? 'text-amber-400' : 'text-content'}`}>
                  {weather.waveHeight?.toFixed(1) || '—'} <span className="text-sm font-normal text-content-secondary">m</span>
                </div>
                <div className="text-xs text-content-secondary">Wave Height</div>
              </div>
            </div>
            {weather.swellHeight !== undefined && (
              <div className="text-right">
                <div className={`text-lg font-semibold ${weather.swellHeight > 2 ? 'text-amber-400' : 'text-content'}`}>
                  {weather.swellHeight?.toFixed(1)} <span className="text-sm font-normal text-content-secondary">m</span>
                </div>
                <div className="text-xs text-content-secondary">
                  Swell {weather.swellDirection !== undefined ? getWindDirection(weather.swellDirection) : ''}
                  {weather.swellPeriod ? ` ${weather.swellPeriod.toFixed(0)}s` : ''}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Additional metrics grid - different for maritime vs aviation */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {isMaritime ? (
          <>
            <div className="bg-black/20 rounded-lg py-2 px-1">
              <div className={`text-sm font-semibold ${weather.visibility < 5 ? 'text-amber-400' : 'text-content'}`}>
                {weather.visibility}km
              </div>
              <div className="text-[10px] text-content-secondary uppercase">Visibility</div>
            </div>
            <div className="bg-black/20 rounded-lg py-2 px-1">
              <div className="text-sm font-semibold text-content">{weather.pressure}</div>
              <div className="text-[10px] text-content-secondary uppercase">hPa</div>
            </div>
            <div className="bg-black/20 rounded-lg py-2 px-1">
              <div className="text-sm font-semibold text-content">{weather.temp}°</div>
              <div className="text-[10px] text-content-secondary uppercase">Air Temp</div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-black/20 rounded-lg py-2 px-1">
              <div className={`text-sm font-semibold ${weather.visibility < 5 ? 'text-amber-400' : 'text-content'}`}>
                {weather.visibility}km
              </div>
              <div className="text-[10px] text-content-secondary uppercase">Visibility</div>
            </div>
            <div className="bg-black/20 rounded-lg py-2 px-1">
              <div className="text-sm font-semibold text-content">{weather.cloudCover}%</div>
              <div className="text-[10px] text-content-secondary uppercase">Clouds</div>
            </div>
            <div className="bg-black/20 rounded-lg py-2 px-1">
              <div className="text-sm font-semibold text-content">{weather.pressure}</div>
              <div className="text-[10px] text-content-secondary uppercase">hPa</div>
            </div>
          </>
        )}
      </div>

      {/* Contextual wind warning */}
      {(isBad || isCaution) && (
        <div className={`mt-3 rounded-lg p-2 flex items-start gap-2 ${isBad ? 'bg-red-500/10 border border-red-500/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
          <svg className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${isBad ? 'text-red-400' : 'text-amber-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className={`text-[11px] leading-relaxed ${isBad ? 'text-red-400' : 'text-amber-400'}`}>
            {weather.windGusts >= gustLimit
              ? `Gusts of ${weather.windGusts} km/h exceed safe limit (${gustLimit} km/h). Risk of loss of control.`
              : weather.windSpeed >= windLimit
                ? `Sustained wind of ${weather.windSpeed} km/h exceeds safe limit (${windLimit} km/h).`
                : weather.condition === 'Thunderstorm'
                  ? 'Thunderstorm activity detected. Do not fly.'
                  : weather.condition === 'Rain'
                    ? 'Rain detected. Electronics at risk.'
                    : weather.visibility < visibilityLimit
                      ? `Low visibility (${weather.visibility} km). Maintain visual line of sight.`
                      : weather.condition === 'Fog'
                        ? 'Fog detected. Reduced visibility likely.'
                        : `Wind approaching limits. Monitor conditions closely.`}
          </p>
        </div>
      )}
    </div>
  );
}

// Tips component
function TipsSection({ vehicle }: { vehicle: VehicleProfile | null }) {
  const { missionDefaults } = useSettingsStore();

  const tips: { type: 'info' | 'warning' | 'success'; message: string }[] = [];

  if (vehicle) {
    // Performance tips
    if ((vehicle._avgPowerDraw ?? 0) > 500) {
      tips.push({ type: 'info', message: 'High power draw - consider larger battery for longer flights' });
    }
    if ((vehicle._cruiseSpeed ?? 0) > 15 && vehicle.type === 'copter') {
      tips.push({ type: 'info', message: 'High cruise speed reduces efficiency on multirotors' });
    }
    if (vehicle.batteryCapacity < 3000 && vehicle.weight > 2000) {
      tips.push({ type: 'warning', message: 'Small battery for vehicle weight - flight time may be limited' });
    }
  }

  // Mission tips
  if (missionDefaults.safeAltitudeBuffer < 20) {
    tips.push({ type: 'warning', message: 'Low safe altitude buffer - increase for mountainous terrain' });
  }

  // General tips
  if (tips.length === 0) {
    tips.push({ type: 'success', message: 'Your settings look good! Ready for flight planning.' });
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return (
          <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'success':
        return (
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div className="space-y-2">
      {tips.map((tip, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 p-3 rounded-lg ${
            tip.type === 'warning' ? 'bg-amber-500/10' :
            tip.type === 'success' ? 'bg-emerald-500/10' : 'bg-blue-500/10'
          }`}
        >
          {getIcon(tip.type)}
          <span className="text-sm text-content">{tip.message}</span>
        </div>
      ))}
    </div>
  );
}

// Format time helper
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins} min`;
}

// Format distance helper
function formatDistance(meters: number): string {
  if (!isFinite(meters) || meters < 0) return '--';
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

/**
 * ArduPilot Flight Statistics - reads STAT_ parameters from the FC
 * Only shown when connected via MAVLink (ArduPilot stores cumulative stats on-board)
 */
function ArduPilotFlightStats() {
  const { parameters } = useParameterStore();

  const statFlightTime = parameters.get('STAT_FLTTIME')?.value ?? 0;
  const statRuntime = parameters.get('STAT_RUNTIME')?.value ?? 0;
  const statBootCount = parameters.get('STAT_BOOTCNT')?.value ?? 0;

  return (
    <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4">
      <h3 className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-3">Flight Statistics (from FC)</h3>
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          value={formatTime(statFlightTime)}
          label="Total Flight Time"
          color="bg-blue-500/20 text-blue-400"
        />
        <StatCard
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
          value={formatTime(statRuntime)}
          label="Total Powered Time"
          color="bg-emerald-500/20 text-emerald-400"
        />
        <StatCard
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
          value={statBootCount.toString()}
          label="Boot Count"
          color="bg-purple-500/20 text-purple-400"
        />
        <StatCard
          icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
          value={statFlightTime > 0 ? `${Math.round((statFlightTime / statRuntime) * 100)}%` : '--'}
          label="Flight Ratio"
          color="bg-amber-500/20 text-amber-400"
        />
      </div>
    </section>
  );
}

/**
 * Settings View - App-level configuration with cool visualizations
 */
export function SettingsView() {
  const {
    missionDefaults,
    vehicles,
    activeVehicleId,
    updateMissionDefaults,
    addVehicle,
    updateVehicle,
    removeVehicle,
    setActiveVehicle,
    getActiveVehicle,
    getEstimatedFlightTime,
    getEstimatedRange,
    unitPreferences,
    experienceLevel,
    setExperienceLevel,
    uiVisibility,
    setUiVisibility,
    surveyPerformance,
    updateSurveyPerformance,
  } = useSettingsStore();

  // Deep-link scroll: a caller (e.g. the survey panel's "Performance settings"
  // link) can request this view and a target element to scroll to on arrival.
  const scrollTarget = useNavigationStore((s) => s.scrollTarget);
  useEffect(() => {
    if (!scrollTarget) return;
    const el = document.getElementById(scrollTarget);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-blue-500/60');
      const t = setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500/60'), 1800);
      useNavigationStore.getState().clearScrollTarget();
      return () => clearTimeout(t);
    }
    useNavigationStore.getState().clearScrollTarget();
  }, [scrollTarget]);

  const { connectionState } = useConnectionStore();
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [missionLocalValues, setMissionLocalValues] = useState<Record<string, string>>({});
  const [missionErrors, setMissionErrors] = useState<Record<string, string | null>>({});
  const activeVehicle = getActiveVehicle();
  const estimatedFlightTime = getEstimatedFlightTime();
  const estimatedRange = getEstimatedRange();
  const altitudeUnit = unitPreferences.altitude;
  const altitudeUnitLabel = UNIT_LABELS.altitude[altitudeUnit];
  const electricCapacityUnit = unitPreferences.electricCapacity;
  const speedUnit = unitPreferences.speed;
  const weightUnit = unitPreferences.weight;
  const dimensionUnit = unitPreferences.dimensions;
  const areaUnit = unitPreferences.area;

  // Auto-detect vehicle type from MAVLink connection (only once per connection session)
  // Uses module-level variable to survive component remounts
  useEffect(() => {
    // Create a unique session key based on connection
    const sessionKey = connectionState.isConnected ? `${connectionState.systemId}-${connectionState.mavType}` : null;

    // Only auto-detect if this is a new connection session we haven't handled
    if (connectionState.isConnected &&
        connectionState.mavType !== undefined &&
        activeVehicleId &&
        sessionKey !== lastAutoDetectSession) {
      const detectedType = mavTypeToVehicleType[connectionState.mavType];
      if (detectedType && activeVehicle && activeVehicle.type !== detectedType) {
        updateVehicle(activeVehicleId, { type: detectedType });
      }
      lastAutoDetectSession = sessionKey;
    }

    // Reset when disconnected
    if (!connectionState.isConnected) {
      lastAutoDetectSession = null;
    }
  }, [connectionState.isConnected, connectionState.mavType, connectionState.systemId, activeVehicleId, activeVehicle, updateVehicle]);

  // Get estimated cruise speed from settings store
  const { getCruiseSpeed } = useSettingsStore();
  const cruiseSpeed = getCruiseSpeed();

  // Estimate power draw (simplified)
  const estimatePower = () => {
    if (!activeVehicle) return 0;
    const weight = activeVehicle.weight || 1000;
    switch (activeVehicle.type) {
      case 'copter': return Math.round((weight / 1000) * 180);
      case 'plane':
      case 'vtol': return Math.round((weight / 1000) * 65);
      default: return Math.round((weight / 1000) * 100);
    }
  };
  const estimatedPower = estimatePower();

  // Check profile compatibility with connected board
  const profileCompatibility = checkProfileCompatibility(
    activeVehicle?.type,
    connectionState.fcVariant,
    connectionState.protocol
  );

  // Handler to create a new profile with the compatible type
  const handleCreateCompatibleProfile = (type: VehicleType) => {
    const boardId = connectionState.boardId || 'Unknown';
    const newVehicleData = {
      name: `${boardId} ${VEHICLE_TYPE_NAMES[type]}`,
      type,
      weight: type === 'copter' ? 500 : type === 'plane' ? 1500 : 1000,
      batteryCells: 4,
      batteryCapacity: type === 'copter' ? 1300 : type === 'plane' ? 3000 : 5000,
      // Board identification from current connection
      ...(connectionState.boardUid && { boardUid: connectionState.boardUid }),
      ...(connectionState.boardId && { boardId: connectionState.boardId }),
      lastConnected: new Date().toISOString(),
      // Copter-specific defaults
      ...(type === 'copter' && { frameSize: 127, motorCount: 4, motorKv: 2400, propSize: '5x4.5' }),  // 127mm = 5"
      // Plane-specific defaults
      ...(type === 'plane' && { wingspan: 1200, wingArea: 24 }),
      // Rover/boat defaults
      ...(type === 'rover' && { driveType: 'differential' as const }),
      ...(type === 'boat' && { hullType: 'displacement' as const }),
    };
    const newVehicleId = addVehicle(newVehicleData);
    setActiveVehicle(newVehicleId);
  };

  const getMissionDisplayValue = (field: string): string | number => {
    if (field in missionLocalValues) return missionLocalValues[field]!;
    const nativeValue = (missionDefaults as any)[field] as number;
    if (isMissionAltitudeField(field)) {
      return altitudeInputValueFromMeters(nativeValue, altitudeUnit);
    }
    return nativeValue;
  };

  const getMissionDisplayBound = (field: string, bound: 'min' | 'max'): string | undefined => {
    const value = MISSION_FIELD_RULES[field]?.[bound];
    if (value === undefined) return undefined;
    return isMissionAltitudeField(field)
      ? altitudeInputValueFromMeters(value, altitudeUnit)
      : String(value);
  };

  const getMissionDisplayStep = (field: string): string | undefined => {
    if (!isMissionAltitudeField(field)) return undefined;
    return altitudeInputStep(altitudeUnit);
  };

  const handleMissionChange = (field: string, rawValue: string) => {
    setMissionLocalValues(prev => ({ ...prev, [field]: rawValue }));
    const rules = MISSION_FIELD_RULES[field];
    if (rules) {
      const error = isMissionAltitudeField(field)
        ? validateAltitudeField(rawValue, rules, altitudeUnit)
        : validateField(rawValue, rules);
      setMissionErrors(prev => ({ ...prev, [field]: error }));
    }
  };

  const handleMissionBlur = (field: string) => {
    const raw = missionLocalValues[field];
    if (raw === undefined) return;

    const rules = MISSION_FIELD_RULES[field];
    const error = rules
      ? isMissionAltitudeField(field)
        ? validateAltitudeField(raw, rules, altitudeUnit)
        : validateField(raw, rules)
      : null;

    if (error) {
      setMissionLocalValues(prev => { const n = { ...prev }; delete n[field]; return n; });
      setMissionErrors(prev => ({ ...prev, [field]: null }));
      return;
    }

    if (isMissionAltitudeField(field)) {
      const displayValue = Number(raw);
      if (!Number.isFinite(displayValue)) {
        setMissionLocalValues(prev => { const n = { ...prev }; delete n[field]; return n; });
        setMissionErrors(prev => ({ ...prev, [field]: null }));
        return;
      }
      const currentDisplayValue = Number(altitudeInputValueFromMeters((missionDefaults as any)[field] as number, altitudeUnit));
      if (displayValue === currentDisplayValue) {
        setMissionLocalValues(prev => { const n = { ...prev }; delete n[field]; return n; });
        setMissionErrors(prev => ({ ...prev, [field]: null }));
        return;
      }
      updateMissionDefaults({ [field]: clampAltitudeMetersToRules(toMetersFromAltitudeUnit(displayValue, altitudeUnit), rules ?? {}) });
    } else {
      updateMissionDefaults({ [field]: Number(raw) });
    }
    setMissionLocalValues(prev => { const n = { ...prev }; delete n[field]; return n; });
    setMissionErrors(prev => ({ ...prev, [field]: null }));
  };

  return (
    <div className="h-full overflow-auto bg-surface-input">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-content">Settings</h1>
          <p className="text-content-secondary text-sm mt-1">
            Configure mission defaults and vehicle profiles
          </p>
        </div>

        {/* Profile Compatibility Warning */}
        {connectionState.isConnected && !profileCompatibility.compatible && activeVehicle && connectionState.fcVariant && (
          <ProfileCompatibilityBanner
            profileType={activeVehicle.type}
            fcVariant={connectionState.fcVariant}
            boardId={connectionState.boardId}
            supportedTypes={profileCompatibility.supportedTypes || []}
            onCreateNewProfile={handleCreateCompatibleProfile}
          />
        )}

        {/* ============================================ */}
        {/* SECTION: Vehicle & Status Info */}
        {/* ============================================ */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-5 bg-blue-500 rounded-full" />
            <h2 className="text-sm font-medium text-content uppercase tracking-wider">Vehicle & Status</h2>
          </div>

          {/* Top row - Active Vehicle + Performance + Weather */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* Active Vehicle Card - Enhanced */}
            <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 text-blue-400 flex-shrink-0">
                  {activeVehicle ? VEHICLE_ICONS[activeVehicle.type] : VEHICLE_ICONS.copter}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-medium text-content truncate">
                        {activeVehicle?.name || 'No vehicle'}
                      </div>
                      <div className="text-sm text-content-secondary flex items-center gap-2">
                        <span>{activeVehicle ? VEHICLE_TYPE_NAMES[activeVehicle.type] : ''}</span>
                        {activeVehicle?.boardId && (
                          <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded" title={activeVehicle.boardUid ? `UID: ${activeVehicle.boardUid}` : undefined}>
                            {activeVehicle.boardId}
                          </span>
                        )}
                      </div>
                    </div>
                    {activeVehicle && (
                      <button
                        onClick={() => setEditingVehicleId(activeVehicle.id)}
                        className="p-1.5 text-content-secondary hover:text-content hover:bg-surface-raised rounded transition-colors"
                        title="Edit vehicle"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {activeVehicle && (
                <div className="mt-4 pt-4 border-t border-subtle">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Type-specific primary spec */}
                    <div className="bg-black/20 rounded-lg p-2">
                      <div className="text-xs text-content-secondary">
                        {activeVehicle.type === 'copter' && 'Frame'}
                        {activeVehicle.type === 'plane' && 'Wingspan'}
                        {activeVehicle.type === 'vtol' && 'Wingspan'}
                        {activeVehicle.type === 'rover' && 'Drive'}
                        {activeVehicle.type === 'boat' && 'Hull'}
                        {activeVehicle.type === 'sub' && 'Depth'}
                      </div>
                      <div className="text-sm text-content font-medium">
                        {activeVehicle.type === 'copter' && `${fmtLength(activeVehicle.frameSize || 127, dimensionUnit)} ${activeVehicle.motorCount === 6 ? 'Hex' : activeVehicle.motorCount === 8 ? 'Octo' : 'Quad'}`}
                        {activeVehicle.type === 'plane' && fmtLength(activeVehicle.wingspan || 1200, dimensionUnit)}
                        {activeVehicle.type === 'vtol' && fmtLength(activeVehicle.wingspan || 1500, dimensionUnit)}
                        {activeVehicle.type === 'rover' && (activeVehicle.driveType === 'ackermann' ? 'Car' : activeVehicle.driveType === 'skid' ? 'Skid' : 'Tank')}
                        {activeVehicle.type === 'boat' && (activeVehicle.hullType ? `${activeVehicle.hullType.charAt(0).toUpperCase()}${activeVehicle.hullType.slice(1)}` : 'Displacement')}
                        {activeVehicle.type === 'sub' && formatAltitudeFromMeters(activeVehicle.maxDepth ?? 100, altitudeUnit)}
                      </div>
                    </div>
                    {/* Weight */}
                    <div className="bg-black/20 rounded-lg p-2">
                      <div className="text-xs text-content-secondary">Weight</div>
                      <div className="text-sm text-content font-medium">{fmtWeight(activeVehicle.weight, weightUnit)}</div>
                    </div>
                    {/* Battery */}
                    <div className="bg-black/20 rounded-lg p-2">
                      <div className="text-xs text-content-secondary">Battery</div>
                      <div className="text-sm text-content font-medium">{activeVehicle.batteryCells}S{activeVehicle.batteryChemistry && activeVehicle.batteryChemistry !== 'lipo' ? ` ${({ lihv: 'LiHV', lion: 'Li-Ion', life: 'LiFe' } as Record<string, string>)[activeVehicle.batteryChemistry] ?? ''}` : ''} {fmtCapacity(activeVehicle.batteryCapacity, electricCapacityUnit)}</div>
                    </div>
                    {/* Type-specific secondary spec */}
                    <div className="bg-black/20 rounded-lg p-2">
                      <div className="text-xs text-content-secondary">
                        {['copter', 'plane', 'vtol'].includes(activeVehicle.type) ? 'Est. Cruise' : 'Est. Speed'}
                      </div>
                      <div className="text-sm text-cyan-400 font-medium">
                        {formatSpeedFromMetersPerSecond(cruiseSpeed, speedUnit)}
                      </div>
                    </div>
                  </div>
                  {/* Board Stats (from STAT_* parameters) */}
                  {activeVehicle.boardStats && (activeVehicle.boardStats.totalFlightCount != null || activeVehicle.boardStats.totalFlightTime != null) && (
                    <div className="mt-3 pt-3 border-t border-subtle">
                      <div className="text-[10px] text-content-secondary uppercase tracking-wider mb-2">Board Stats</div>
                      <div className="grid grid-cols-3 gap-2">
                        {activeVehicle.boardStats.totalFlightCount != null && (
                          <div className="bg-black/20 rounded-lg p-2">
                            <div className="text-[10px] text-content-secondary">Flights</div>
                            <div className="text-xs text-content font-medium">{activeVehicle.boardStats.totalFlightCount}</div>
                          </div>
                        )}
                        {activeVehicle.boardStats.totalFlightTime != null && (
                          <div className="bg-black/20 rounded-lg p-2">
                            <div className="text-[10px] text-content-secondary">Flight Time</div>
                            <div className="text-xs text-content font-medium">{formatTime(activeVehicle.boardStats.totalFlightTime)}</div>
                          </div>
                        )}
                        {activeVehicle.boardStats.totalRunTime != null && (
                          <div className="bg-black/20 rounded-lg p-2">
                            <div className="text-[10px] text-content-secondary">Run Time</div>
                            <div className="text-xs text-content font-medium">{formatTime(activeVehicle.boardStats.totalRunTime)}</div>
                          </div>
                        )}
                        {activeVehicle.boardStats.totalDistance != null && (
                          <div className="bg-black/20 rounded-lg p-2">
                            <div className="text-[10px] text-content-secondary">Distance</div>
                            <div className="text-xs text-content font-medium">{formatDistance(activeVehicle.boardStats.totalDistance)}</div>
                          </div>
                        )}
                        {activeVehicle.boardStats.bootCount != null && (
                          <div className="bg-black/20 rounded-lg p-2">
                            <div className="text-[10px] text-content-secondary">Boots</div>
                            <div className="text-xs text-content font-medium">{activeVehicle.boardStats.bootCount}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Performance Gauges */}
            <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
              <div className="flex items-center justify-around mb-2">
                <CircularGauge
                  value={Math.round(estimatedFlightTime / 60)}
                  max={60}
                  label="Flight Time"
                  unit="min"
                  color="#3b82f6"
                  size={85}
                />
                <CircularGauge
                  value={Math.round(estimatedRange / 1000)}
                  max={50}
                  label="Range"
                  unit="km"
                  color="#10b981"
                  size={85}
                />
              </div>
              {/* Multi-level estimates table */}
              <div className="bg-black/20 rounded-lg overflow-hidden">
                <div className="grid grid-cols-3 text-[10px] text-content-secondary uppercase tracking-wider px-2 py-1.5 border-b border-subtle">
                  <span>Usage</span>
                  <span className="text-center">Time</span>
                  <span className="text-right">Range</span>
                </div>
                {[
                  { pct: 60, label: '60%', color: 'text-green-400', note: 'Safe' },
                  { pct: 80, label: '80%', color: 'text-blue-400', note: 'Normal' },
                  { pct: 95, label: '95%', color: 'text-red-400', note: 'Max' },
                ].map(({ pct, label, color, note }) => {
                  const scaledTime = Math.round(estimatedFlightTime * (pct / 80));
                  const scaledRange = Math.round(estimatedRange * (pct / 80));
                  return (
                    <div key={pct} className="grid grid-cols-3 px-2 py-1.5 text-xs border-b border-subtle last:border-0">
                      <span className={`${color} font-medium`}>{label} <span className="text-content-tertiary font-normal">{note}</span></span>
                      <span className="text-center text-content">{formatTime(scaledTime)}</span>
                      <span className="text-right text-content">{formatDistance(scaledRange)}</span>
                    </div>
                  );
                })}
              </div>
              {/* Approximation note */}
              <div className="bg-blue-500/10 rounded-lg p-2 flex items-start gap-2 mt-2">
                <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[11px] text-content-secondary leading-relaxed">
                  Rough estimates. Better profile = better predictions.
                </p>
              </div>
            </section>

            {/* Weather Widget */}
            <WeatherWidget vehicleType={activeVehicle?.type} />
          </div>

          {/* Stats + Tips row */}
          {connectionState.protocol === 'mavlink' && connectionState.isConnected ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ArduPilotFlightStats />
              <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4">
                <h3 className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-3">Tips & Recommendations</h3>
                <TipsSection vehicle={activeVehicle} />
              </section>
            </div>
          ) : (
            <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4">
              <h3 className="text-xs font-medium text-content-secondary uppercase tracking-wider mb-3">Tips & Recommendations</h3>
              <TipsSection vehicle={activeVehicle} />
            </section>
          )}
        </div>

        {/* ============================================ */}
        {/* SECTION: Configuration */}
        {/* ============================================ */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-5 bg-emerald-500 rounded-full" />
            <h2 className="text-sm font-medium text-content uppercase tracking-wider">Configuration</h2>
          </div>

          <UnitSelectionCard />

          {/* Experience Level & UI Visibility */}
          <div className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4 mb-4">
            {/* Preset row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <div>
                  <div className="text-sm font-medium text-content">Experience Level</div>
                  <div className="text-[11px] text-content-secondary">Presets control all options below</div>
                </div>
              </div>
              <div className="flex bg-surface-input rounded-lg border border-subtle overflow-hidden">
                <button
                  onClick={async () => {
                    const v = await window.electronAPI?.getAppVersion() || '0.0.0';
                    setExperienceLevel('beginner', v);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    experienceLevel === 'beginner'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-content-secondary hover:text-content'
                  }`}
                >
                  Beginner
                </button>
                <button
                  onClick={async () => {
                    const v = await window.electronAPI?.getAppVersion() || '0.0.0';
                    setExperienceLevel('advanced', v);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    experienceLevel === 'advanced'
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'text-content-secondary hover:text-content'
                  }`}
                >
                  Advanced
                </button>
              </div>
            </div>

            {/* Granular checkbox grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {([
                { key: 'showInfoCards' as const, label: 'Info Cards', desc: '"What are PIDs?" panels' },
                { key: 'showQuickPresets' as const, label: 'Quick Presets', desc: 'Tuning style selectors' },
                { key: 'showExplanationCards' as const, label: 'Explanation Cards', desc: '"What is X?" breakdowns' },
                { key: 'showSectionDescriptions' as const, label: 'Section Descriptions', desc: 'Header subtitle text' },
                { key: 'showTips' as const, label: 'Inline Tips', desc: 'Compact hint text' },
                { key: 'defaultAdvancedViews' as const, label: 'Default Advanced Views', desc: 'Start in advanced mode' },
              ] as const).map(({ key, label, desc }) => (
                <label key={key} className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={uiVisibility[key]}
                    onChange={(e) => setUiVisibility({ [key]: e.target.checked })}
                    className="mt-0.5 w-3.5 h-3.5 rounded border-border bg-surface-raised text-blue-500 focus:ring-blue-500/30 focus:ring-offset-0 cursor-pointer"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-content group-hover:text-content transition-colors">{label}</div>
                    <div className="text-[11px] text-content-tertiary">{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Mission Defaults Section */}
            <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
              <h2 className="text-sm font-medium text-content mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Mission Planning Defaults
              </h2>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1.5">
                    Safe Alt Buffer
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={getMissionDisplayValue('safeAltitudeBuffer')}
                      onChange={(e) => handleMissionChange('safeAltitudeBuffer', e.target.value)}
                      onBlur={() => handleMissionBlur('safeAltitudeBuffer')}
                      className={`w-full px-2 py-1.5 bg-surface-input border rounded text-content text-sm focus:outline-none ${
                        missionErrors.safeAltitudeBuffer ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-blue-500'
                      }`}
                      min={getMissionDisplayBound('safeAltitudeBuffer', 'min')}
                      max={getMissionDisplayBound('safeAltitudeBuffer', 'max')}
                      step={getMissionDisplayStep('safeAltitudeBuffer')}
                    />
                    <span className="text-content-secondary text-xs">{altitudeUnitLabel}</span>
                  </div>
                  {missionErrors.safeAltitudeBuffer
                    ? <div className="text-[10px] text-red-400 mt-1">{missionErrors.safeAltitudeBuffer}</div>
                    : <div className="text-[10px] text-content-tertiary mt-1">Above terrain for warnings</div>
                  }
                </div>

                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1.5">
                    Waypoint Alt
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={getMissionDisplayValue('defaultWaypointAltitude')}
                      onChange={(e) => handleMissionChange('defaultWaypointAltitude', e.target.value)}
                      onBlur={() => handleMissionBlur('defaultWaypointAltitude')}
                      className={`w-full px-2 py-1.5 bg-surface-input border rounded text-content text-sm focus:outline-none ${
                        missionErrors.defaultWaypointAltitude ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-blue-500'
                      }`}
                      min={getMissionDisplayBound('defaultWaypointAltitude', 'min')}
                      max={getMissionDisplayBound('defaultWaypointAltitude', 'max')}
                      step={getMissionDisplayStep('defaultWaypointAltitude')}
                    />
                    <span className="text-content-secondary text-xs">{altitudeUnitLabel}</span>
                  </div>
                  {missionErrors.defaultWaypointAltitude
                    ? <div className="text-[10px] text-red-400 mt-1">{missionErrors.defaultWaypointAltitude}</div>
                    : <div className="text-[10px] text-content-tertiary mt-1">Default for new waypoints</div>
                  }
                </div>

                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1.5">
                    Takeoff Alt
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={getMissionDisplayValue('defaultTakeoffAltitude')}
                      onChange={(e) => handleMissionChange('defaultTakeoffAltitude', e.target.value)}
                      onBlur={() => handleMissionBlur('defaultTakeoffAltitude')}
                      className={`w-full px-2 py-1.5 bg-surface-input border rounded text-content text-sm focus:outline-none ${
                        missionErrors.defaultTakeoffAltitude ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-blue-500'
                      }`}
                      min={getMissionDisplayBound('defaultTakeoffAltitude', 'min')}
                      max={getMissionDisplayBound('defaultTakeoffAltitude', 'max')}
                      step={getMissionDisplayStep('defaultTakeoffAltitude')}
                    />
                    <span className="text-content-secondary text-xs">{altitudeUnitLabel}</span>
                  </div>
                  {missionErrors.defaultTakeoffAltitude
                    ? <div className="text-[10px] text-red-400 mt-1">{missionErrors.defaultTakeoffAltitude}</div>
                    : <div className="text-[10px] text-content-tertiary mt-1">Altitude after launch</div>
                  }
                </div>

                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1.5">
                    Alt Reference
                  </label>
                  <select
                    value={missionDefaults.defaultAltitudeReference ?? 'relative'}
                    onChange={(e) => updateMissionDefaults({
                      defaultAltitudeReference: e.target.value as 'relative' | 'asl' | 'terrain',
                    })}
                    className="w-full px-2 py-1.5 bg-surface-input border border-border rounded text-content text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="relative">Relative to Home</option>
                    <option value="terrain">Above Terrain (AGL)</option>
                    <option value="asl">Above Sea Level</option>
                  </select>
                  <div className="text-[10px] text-content-tertiary mt-1">Default altitude reference</div>
                </div>
              </div>
            </section>

            {/* Survey Performance Section */}
            <section
              id="settings-survey-performance"
              className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5 transition-shadow"
            >
              <h2 className="text-sm font-medium text-content mb-1 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                Survey &amp; Map Performance
              </h2>
              <p className="text-[11px] text-content-tertiary mb-4">
                Guardrails that keep the map responsive with large imported boundaries and big missions. Applies everywhere.
              </p>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1.5">
                    Max editable vertices
                  </label>
                  <input
                    type="number"
                    value={surveyPerformance.maxEditableVertices}
                    onChange={(e) => {
                      const n = Math.round(Number(e.target.value));
                      if (Number.isFinite(n)) updateSurveyPerformance({ maxEditableVertices: Math.max(0, Math.min(5000, n)) });
                    }}
                    className="w-full px-2 py-1.5 bg-surface-input border border-border rounded text-content text-sm focus:outline-none focus:border-blue-500"
                    min="0"
                    max="5000"
                  />
                  <div className="text-[10px] text-content-tertiary mt-1">Above this, drag handles are hidden</div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1.5">
                    Max photo markers
                  </label>
                  <input
                    type="number"
                    value={surveyPerformance.maxPhotoMarkers}
                    onChange={(e) => {
                      const n = Math.round(Number(e.target.value));
                      if (Number.isFinite(n)) updateSurveyPerformance({ maxPhotoMarkers: Math.max(0, Math.min(50000, n)) });
                    }}
                    className="w-full px-2 py-1.5 bg-surface-input border border-border rounded text-content text-sm focus:outline-none focus:border-blue-500"
                    min="0"
                    max="50000"
                  />
                  <div className="text-[10px] text-content-tertiary mt-1">Above this, photo dots aren't drawn</div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1.5">
                    Max waypoint markers
                  </label>
                  <input
                    type="number"
                    value={surveyPerformance.maxWaypointMarkers}
                    onChange={(e) => {
                      const n = Math.round(Number(e.target.value));
                      if (Number.isFinite(n)) updateSurveyPerformance({ maxWaypointMarkers: Math.max(0, Math.min(50000, n)) });
                    }}
                    className="w-full px-2 py-1.5 bg-surface-input border border-border rounded text-content text-sm focus:outline-none focus:border-blue-500"
                    min="0"
                    max="50000"
                  />
                  <div className="text-[10px] text-content-tertiary mt-1">Markers thinned above this (path still drawn)</div>
                </div>
              </div>
            </section>

            {/* Vehicles Section */}
            <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-content flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Vehicle Profiles
                </h2>
                <button
                  onClick={() => setShowTemplatePicker(true)}
                  className="px-2.5 py-1 bg-emerald-600/80 hover:bg-emerald-500/80 text-white text-xs rounded-lg transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Vehicle
                </button>
              </div>

              <div className="space-y-2 max-h-[32rem] overflow-y-auto">
                {vehicles.map((vehicle) => (
                  <VehicleCard
                    key={vehicle.id}
                    vehicle={vehicle}
                    isActive={vehicle.id === activeVehicleId}
                    isEditing={vehicle.id === editingVehicleId}
                    onSelect={() => setActiveVehicle(vehicle.id)}
                    onEdit={() => setEditingVehicleId(vehicle.id)}
                    onSave={() => setEditingVehicleId(null)}
                    onUpdate={(updates) => updateVehicle(vehicle.id, updates)}
                    onDelete={() => removeVehicle(vehicle.id)}
                    canDelete={vehicles.length > 1}
                  />
                ))}
              </div>

              {showTemplatePicker && (
                <VehicleTemplatePicker
                  onClose={() => setShowTemplatePicker(false)}
                  onSelect={(tpl: VehicleTemplate) => {
                    const newId = addVehicle({
                      ...tpl.defaults,
                      name: tpl.name,
                      type: tpl.vehicleType,
                      templateSlug: tpl.slug,
                      weight: tpl.defaults.weight ?? 500,
                      batteryCells: tpl.defaults.batteryCells ?? 4,
                      batteryCapacity: tpl.defaults.batteryCapacity ?? 1500,
                    });
                    setShowTemplatePicker(false);
                    setEditingVehicleId(newId);
                    setActiveVehicle(newId);
                  }}
                  onImportFromConnected={() => {
                    const paramMap = new Map<string, number>();
                    for (const [k, v] of useParameterStore.getState().parameters) paramMap.set(k, v.value);
                    const inferred = inferProfileFromParams(paramMap);
                    if (!inferred) {
                      return;
                    }
                    const newId = addVehicle({
                      ...inferred.profile,
                      weight: inferred.profile.weight ?? 500,
                      batteryCells: inferred.profile.batteryCells ?? 4,
                      batteryCapacity: inferred.profile.batteryCapacity ?? 1500,
                    });
                    setShowTemplatePicker(false);
                    setEditingVehicleId(newId);
                    setActiveVehicle(newId);
                  }}
                />
              )}
            </section>
          </div>
        </div>

        {/* ============================================ */}
        {/* SECTION: Offline Maps */}
        {/* ============================================ */}
        <div className="mt-8 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-5 bg-emerald-500 rounded-full" />
            <h2 className="text-sm font-medium text-content uppercase tracking-wider">Offline Maps</h2>
          </div>
          <TileCacheCard />
        </div>

        {/* ============================================ */}
        {/* SECTION: Map Overlays */}
        {/* ============================================ */}
        <div className="mt-8 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-5 bg-emerald-500 rounded-full" />
            <h2 className="text-sm font-medium text-content uppercase tracking-wider">Map Overlays</h2>
          </div>
          <div className="bg-surface rounded-xl border border-subtle p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-content">Map Overlays</h3>
                <p className="text-xs text-content-secondary">API keys for airspace and airport data</p>
              </div>
            </div>

            <OpenAipKeyInput />
          </div>
        </div>

        {/* SECTION: Console */}
        {/* ============================================ */}
        <ConsoleSettingsSection />

        {/* SECTION: AI Analysis */}
        {/* ============================================ */}
        <AiAnalysisSection />

        {/* SECTION: Experimental Features */}
        {/* ============================================ */}
        <ExperimentalFeaturesSection />

        {/* SECTION: About */}
        {/* ============================================ */}
        <AboutSection />
      </div>
    </div>
  );
}

function OpenAipKeyInput() {
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.electronAPI?.getApiKey('openaip').then((result: { hasKey: boolean; key: string }) => {
      if (result?.hasKey) {
        setHasKey(true);
        setKey(result.key);
      }
    });
  }, []);

  const handleSave = async () => {
    await window.electronAPI?.setApiKey('openaip', key.trim());
    setHasKey(!!key.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <label className="block text-xs text-content-secondary mb-1.5">
        OpenAIP API Key
        <span className="text-content-tertiary ml-1">— free at</span>{' '}
        <a href="https://www.openaip.net" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
          openaip.net
        </a>
      </label>
      <div className="flex gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => { setKey(e.target.value); setSaved(false); }}
          placeholder={hasKey ? '••••••••••••••••' : 'Paste your API key'}
          className="flex-1 px-3 py-1.5 bg-surface-input border border-border rounded-lg text-sm text-content placeholder-content-tertiary focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleSave}
          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
      {hasKey && !saved && (
        <p className="text-xs text-emerald-400 mt-1">Key configured</p>
      )}
    </div>
  );
}

function ConsoleSettingsSection() {
  const showDebugLogs = useSettingsStore((s) => s.showDebugLogs);
  const setShowDebugLogs = useSettingsStore((s) => s.setShowDebugLogs);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-5 bg-content-secondary rounded-full" />
        <h2 className="text-sm font-medium text-content uppercase tracking-wider">Console</h2>
      </div>

      <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-surface-input rounded-lg p-3">
            <div className="flex-1 mr-3">
              <div className="text-sm text-content font-medium">Verbose Logging</div>
              <div className="text-xs text-content-secondary mt-0.5">
                Show debug and packet-level messages in the console. When off, only info, warnings, and errors are shown.
              </div>
            </div>
            <button
              onClick={() => setShowDebugLogs(!showDebugLogs)}
              className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${
                showDebugLogs ? 'bg-blue-600' : 'bg-surface-raised'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${
                showDebugLogs ? 'left-[18px]' : 'left-0.5'
              }`} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function AiAnalysisSection() {
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const setAiProvider = useSettingsStore((s) => s.setAiProvider);
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const providers = [
    { id: 'claude' as const, name: 'Claude', color: 'bg-orange-500' },
    { id: 'openai' as const, name: 'OpenAI', color: 'bg-emerald-500' },
    { id: 'gemini' as const, name: 'Gemini', color: 'bg-blue-500' },
  ];

  // Load existing key status on provider change
  useEffect(() => {
    if (!aiProvider) { setHasKey(false); setApiKey(''); return; }
    window.electronAPI?.getApiKey(`ai-${aiProvider}`).then((res) => {
      setHasKey(res.hasKey);
      setApiKey('');
    });
  }, [aiProvider]);

  const handleSaveKey = async () => {
    if (!aiProvider || !apiKey.trim()) return;
    setSaving(true);
    await window.electronAPI?.setApiKey(`ai-${aiProvider}`, apiKey.trim());
    setHasKey(true);
    setApiKey('');
    setSaving(false);
  };

  const handleRemoveKey = async () => {
    if (!aiProvider) return;
    await window.electronAPI?.setApiKey(`ai-${aiProvider}`, '');
    setHasKey(false);
    setAiProvider(null);
  };

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-5 bg-purple-500 rounded-full" />
        <h2 className="text-sm font-medium text-content uppercase tracking-wider">AI Flight Analysis</h2>
      </div>

      <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
        <div className="space-y-4">
          <p className="text-xs text-content-secondary">
            Enable AI-powered analysis of your flight logs. Your API key is encrypted and stored locally.
          </p>

          <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/20 rounded-lg p-3">
            <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-[11px] text-amber-300/80 leading-relaxed space-y-1">
              <p><strong className="text-amber-300">Experimental feature.</strong></p>
              <p>AI suggestions are not a substitute for your own judgement.</p>
              <p>Always verify recommendations against ArduPilot documentation and your vehicle's specific configuration before applying changes. Incorrect parameters can cause loss of control.</p>
            </div>
          </div>

          {/* Provider selection */}
          <div>
            <div className="text-xs text-content-secondary mb-2">Provider</div>
            <div className="flex gap-2">
              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setAiProvider(aiProvider === p.id ? null : p.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                    aiProvider === p.id
                      ? 'border-purple-500/50 bg-purple-500/10 text-content'
                      : 'border-subtle bg-surface-input text-content-secondary hover:text-content hover:border-border'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${aiProvider === p.id ? p.color : 'bg-surface-raised'}`} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* API key input */}
          {aiProvider && (
            <div>
              <div className="text-xs text-content-secondary mb-2">API Key</div>
              {hasKey ? (
                <div className="flex items-center gap-2 bg-surface-input rounded-lg p-3">
                  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="text-sm text-content flex-1">Key configured and encrypted</span>
                  <button
                    onClick={handleRemoveKey}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`Enter ${providers.find((p) => p.id === aiProvider)?.name} API key...`}
                    className="flex-1 bg-surface-input border border-subtle rounded-lg px-3 py-2 text-sm text-content placeholder-content-tertiary focus:outline-none focus:border-purple-500/50"
                  />
                  <button
                    onClick={handleSaveKey}
                    disabled={!apiKey.trim() || saving}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

    </div>
  );
}

function ExperimentalFeaturesSection() {
  const companionUnlocked = useSettingsStore((s) => s.companionUnlocked);
  const setCompanionUnlocked = useSettingsStore((s) => s.setCompanionUnlocked);
  const advancedCommandsUnlocked = useSettingsStore((s) => s.advancedCommandsUnlocked);
  const setAdvancedCommandsUnlocked = useSettingsStore((s) => s.setAdvancedCommandsUnlocked);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-5 bg-purple-500 rounded-full" />
        <h2 className="text-sm font-medium text-content uppercase tracking-wider">Experimental</h2>
      </div>

      <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
        <h2 className="text-sm font-medium text-content mb-4 flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          Experimental Features
        </h2>
        <p className="text-xs text-content-secondary mb-4">
          These features are under active development and may have rough edges. ArduPilot/MAVLink only.
        </p>

        <div className="space-y-3">
          {/* Companion Computer */}
          <div className="flex items-center justify-between bg-surface-input rounded-lg p-3">
            <div className="flex-1 mr-3">
              <div className="text-sm text-content font-medium">Companion Computer</div>
              <div className="text-xs text-content-secondary mt-0.5">
                Monitor and manage companion boards (Raspberry Pi, ESP32, Jetson) with remote terminal, metrics, and service control
              </div>
            </div>
            <button
              onClick={() => setCompanionUnlocked(!companionUnlocked)}
              className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${
                companionUnlocked ? 'bg-purple-600' : 'bg-surface-raised'
              }`}
            >
              <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${
                companionUnlocked ? 'left-[18px]' : 'left-0.5'
              }`} />
            </button>
          </div>

          {/* Advanced map commands (Orbit, Land + FC-side Lua install path) */}
          <div className="bg-surface-input rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="text-sm text-content font-medium">Advanced map commands</div>
                  <span className="px-1.5 py-0 text-[9px] font-bold tracking-wider rounded bg-rose-600/20 text-rose-400 border border-rose-600/40">
                    RISKY
                  </span>
                </div>
                <div className="text-xs text-content-secondary mt-0.5">
                  Unlocks <strong>Orbit</strong> and <strong>Land at point</strong> in the map command popup
                  (the popup defaults to <strong>Move</strong> only). Also enables the optional <strong>Lua script
                  installer</strong> for flight controllers that lack native CIRCLE mode - ArduDeck can write a
                  small script to the FC's SD card after explicit consent and source-code preview.
                  <span className="block mt-1 text-rose-400">
                    Triggers flight-mode changes and may modify parameters. Bench-test every command before flight.
                  </span>
                </div>
              </div>
              <button
                onClick={() => setAdvancedCommandsUnlocked(!advancedCommandsUnlocked)}
                className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${
                  advancedCommandsUnlocked ? 'bg-purple-600' : 'bg-surface-raised'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${
                  advancedCommandsUnlocked ? 'left-[18px]' : 'left-0.5'
                }`} />
              </button>
            </div>
            {advancedCommandsUnlocked && <ScriptInstallerActions />}
          </div>
        </div>
      </section>
    </div>
  );
}

function ScriptInstallerActions() {
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <div className="mt-3 pt-3 border-t border-subtle/50 flex items-center justify-between">
      <span className="text-[11px] text-content-tertiary">
        Manage and review ArduDeck-installed scripts on the connected vehicle
      </span>
      <button
        onClick={() => setModalOpen(true)}
        className="px-3 py-1.5 text-xs bg-purple-600/80 hover:bg-purple-600 text-white rounded"
      >
        Open installer…
      </button>
      <ScriptInstallModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function AboutSection() {
  const {
    currentVersion,
    status,
    canAutoUpdate,
    latestVersion,
    publishedAt,
    downloadProgress,
    bytesDownloaded,
    totalBytes,
    error,
    checkForUpdate,
    downloadUpdate,
    installUpdate,
    openReleaseUrl,
  } = useUpdateStore();

  const isChecking = status === 'checking';
  const showCheckButton = status === 'idle' || status === 'not-available' || status === 'error';

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-5 bg-content-secondary rounded-full" />
        <h2 className="text-sm font-medium text-content uppercase tracking-wider">About</h2>
      </div>

      <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-content">ArduDeck</h3>
            <p className="text-sm text-content-secondary mt-0.5">
              v{currentVersion || '...'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/rubenCodeforges/ardudeck"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs text-content-secondary hover:text-content border border-border hover:border-border rounded-lg transition-colors"
            >
              GitHub
            </a>

            {showCheckButton && (
              <button
                onClick={() => checkForUpdate()}
                disabled={isChecking}
                className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500/80 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Check for Updates
              </button>
            )}

            {isChecking && (
              <span className="px-3 py-1.5 text-xs text-content-secondary flex items-center gap-2">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking...
              </span>
            )}

            {status === 'available' && canAutoUpdate && (
              <button
                onClick={() => downloadUpdate()}
                className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500/80 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Download v{latestVersion}
              </button>
            )}

            {status === 'available' && !canAutoUpdate && (
              <button
                onClick={openReleaseUrl}
                className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500/80 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
              >
                View Release v{latestVersion}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            )}

            {status === 'downloaded' && (
              <button
                onClick={() => installUpdate()}
                className="px-3 py-1.5 bg-emerald-600/80 hover:bg-emerald-500/80 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Restart to Update
              </button>
            )}
          </div>
        </div>

        {/* Status details */}
        <div className="mt-4 pt-4 border-t border-subtle">
          {status === 'not-available' && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              You're up to date
            </div>
          )}

          {status === 'available' && (
            <div className="flex items-center justify-between bg-blue-500/10 rounded-lg p-3">
              <div>
                <p className="text-sm text-blue-300 font-medium">
                  v{latestVersion} is available
                </p>
                {publishedAt && (
                  <p className="text-xs text-content-secondary mt-0.5">
                    Released {new Date(publishedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          )}

          {status === 'downloading' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-content-secondary">
                <span>Downloading v{latestVersion}...</span>
                <span className="tabular-nums">
                  {totalBytes > 0
                    ? `${(bytesDownloaded / (1024 * 1024)).toFixed(1)} / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB`
                    : `${(bytesDownloaded / (1024 * 1024)).toFixed(1)} MB`}
                </span>
              </div>
              <div className="h-1.5 bg-surface-inset rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.round(downloadProgress)}%` }}
                />
              </div>
            </div>
          )}

          {status === 'downloaded' && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Update downloaded and ready to install
            </div>
          )}

          {status === 'error' && error && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="truncate">{error}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// Input field component for vehicle forms
/**
 * Vehicle profile values are stored in native units and converted only at the
 * editable field boundary.
 */
// ============================================
// Validation
// ============================================

interface FieldValidation {
  min?: number;
  max?: number;
  required?: boolean;
  integer?: boolean;
}

const VEHICLE_FIELD_RULES: Record<string, FieldValidation> = {
  name:             { required: true },
  weight:           { min: 1, max: 500_000, required: true, integer: true },
  batteryCapacity:  { min: 100, max: 100_000, required: true, integer: true },
  frameSize:        { min: 0, max: 10_000, integer: true },
  wingspan:         { min: 100, max: 10_000, integer: true },
  wingArea:         { min: 100, max: 100_000, integer: true },
  stallSpeed:       { min: 0.1, max: 100 },
  transitionSpeed:  { min: 1, max: 100 },
  wheelbase:        { min: 10, max: 5_000, integer: true },
  wheelDiameter:    { min: 10, max: 1_000, integer: true },
  maxSpeed:         { min: 0.1, max: 200 },
  hullLength:       { min: 50, max: 10_000, integer: true },
  displacement:     { min: 1, max: 500_000, integer: true },
  maxDepth:         { min: 1, max: 11_000 },
  motorKv:          { min: 100, max: 10_000, integer: true },
  escRating:        { min: 1, max: 500 },
  batteryDischarge: { min: 1, max: 200 },
};

const MISSION_FIELD_RULES: Record<string, FieldValidation> = {
  safeAltitudeBuffer:      { min: 0, max: 500, required: true, integer: true },
  defaultWaypointAltitude: { min: 0, max: 10_000, required: true, integer: true },
  defaultTakeoffAltitude:  { min: 0, max: 1_000, required: true, integer: true },
};

function validateField(value: string, rules: FieldValidation, isText?: boolean): string | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return rules.required ? 'Required' : null;
  }
  if (isText) return null;
  const num = Number(trimmed);
  if (isNaN(num)) return 'Invalid number';
  if (rules.min !== undefined && num < rules.min) return `Min: ${rules.min}`;
  if (rules.max !== undefined && num > rules.max) return `Max: ${rules.max}`;
  if (rules.integer && !Number.isInteger(num)) return 'Must be whole number';
  return null;
}

function validateAltitudeField(value: string, rules: FieldValidation, unit: AltitudeUnit): string | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return rules.required ? 'Required' : null;
  }
  const displayValue = Number(trimmed);
  if (!Number.isFinite(displayValue)) return 'Invalid number';
  if (rules.integer && unit === 'm' && !Number.isInteger(displayValue)) return 'Must be whole number';

  const displayMin = rules.min === undefined ? undefined : Number(altitudeInputValueFromMeters(rules.min, unit));
  const displayMax = rules.max === undefined ? undefined : Number(altitudeInputValueFromMeters(rules.max, unit));
  if (displayMin !== undefined && displayValue < displayMin) {
    return `Min: ${displayMin} ${UNIT_LABELS.altitude[unit]}`;
  }
  if (displayMax !== undefined && displayValue > displayMax) {
    return `Max: ${displayMax} ${UNIT_LABELS.altitude[unit]}`;
  }
  return null;
}

// Prop size input: text field with format validation + preset grid
function PropSizeInput({
  value,
  onChange,
  presets,
}: {
  value: string | undefined;
  onChange: (val: string | undefined) => void;
  presets: { size: string; label?: string }[];
}) {
  // customMode is pure UI state - no useEffect needed
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Detect if current stored value is a custom (non-preset) value
  const isCustomValue = !!value && !presets.some(p => p.size === value);
  const showCustomInput = customMode || isCustomValue;

  const validate = (v: string): string | null => {
    if (!v) return null;
    if (!/^\d+(?:\.\d+)?x\d+(?:\.\d+)?$/.test(v)) return 'Use DxP format (e.g. 10x5)';
    const parts = v.split('x').map(Number);
    const diam = parts[0];
    const pitch = parts[1];
    if (!diam || diam < 1 || diam > 40) return 'Diameter: 1-40"';
    if (!pitch || pitch < 1 || pitch > 20) return 'Pitch: 1-20"';
    return null;
  };

  const handleSelect = (val: string) => {
    if (val === '__custom__') {
      setCustomMode(true);
      setCustomValue('');
      setError(null);
    } else if (val === '') {
      setCustomMode(false);
      onChange(undefined);
    } else {
      setCustomMode(false);
      onChange(val);
    }
  };

  const handleCustom = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.x]/g, '');
    setCustomValue(cleaned);
    const err = validate(cleaned);
    setError(err);
    if (!err && cleaned) onChange(cleaned);
  };

  const handleCustomBlur = () => {
    // Just validate on blur - user exits custom mode via the dropdown
    if (customValue) {
      setError(validate(customValue));
    } else {
      setError(null);
    }
  };

  return (
    <div>
      <label className="block text-xs text-content-secondary mb-1">Propeller</label>
      <select
        value={showCustomInput ? '__custom__' : (value || '')}
        onChange={(e) => handleSelect(e.target.value)}
        className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-content text-sm focus:outline-none focus:border-blue-500"
      >
        <option value="">None</option>
        {presets.map((p) => (
          <option key={p.size} value={p.size}>{p.label || `${p.size}"`}</option>
        ))}
        <option value="__custom__">Custom size...</option>
      </select>
      {showCustomInput && (
        <input
          type="text"
          value={customMode ? customValue : (value || '')}
          onChange={(e) => handleCustom(e.target.value)}
          onBlur={handleCustomBlur}
          placeholder="DxP (e.g. 9.5x4.7)"
          autoFocus={customMode}
          className={`w-full mt-1.5 px-3 py-2 bg-surface-input border rounded-lg text-sm focus:outline-none ${
            error ? 'border-red-500/60 text-content' : 'border-border text-content focus:border-blue-500'
          }`}
        />
      )}
      {error && <div className="text-[10px] text-red-400 mt-0.5">{error}</div>}
    </div>
  );
}

function dimensionInputStep(unit: DimensionUnit): string {
  return String(1 / (10 ** UNIT_PRECISION.dimensions[unit]));
}

function clampDimensionMillimetersToRules(millimeters: number, rules: FieldValidation): number {
  let next = millimeters;
  if (rules.min !== undefined) next = Math.max(rules.min, next);
  if (rules.max !== undefined) next = Math.min(rules.max, next);
  return next;
}

function validateDimensionField(value: string, rules: FieldValidation, unit: DimensionUnit): string | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return rules.required ? 'Required' : null;
  }
  const displayValue = Number(trimmed);
  if (!Number.isFinite(displayValue)) return 'Must be a valid number';

  const millimeters = toMillimetersFromDimensionUnit(displayValue, unit);
  if (rules.min !== undefined && millimeters < rules.min) {
    return `Min: ${dimensionInputValueFromMillimeters(rules.min, unit)} ${UNIT_LABELS.dimensions[unit]}`;
  }
  if (rules.max !== undefined && millimeters > rules.max) {
    return `Max: ${dimensionInputValueFromMillimeters(rules.max, unit)} ${UNIT_LABELS.dimensions[unit]}`;
  }
  if (unit === 'mm' && rules.integer && !Number.isInteger(displayValue)) {
    return 'Must be a whole number';
  }
  return null;
}

function DimensionInputField({
  label,
  valueMillimeters,
  onCommit,
  unit,
  placeholderMillimeters,
  rules,
}: {
  label: string;
  valueMillimeters: number | undefined;
  onCommit: (millimeters: number | undefined) => void;
  unit: DimensionUnit;
  placeholderMillimeters?: number;
  rules: FieldValidation;
}) {
  const displayValue = dimensionInputValueFromMillimeters(valueMillimeters, unit);
  const [draft, setDraft] = useState(displayValue);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) setDraft(displayValue);
  }, [displayValue, focused]);

  const resetDraft = useCallback(() => {
    setDraft(dimensionInputValueFromMillimeters(valueMillimeters, unit));
    setError(null);
  }, [unit, valueMillimeters]);

  return (
    <div>
      <label className="block text-xs text-content-secondary mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={draft}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            setError(validateDimensionField(next, rules, unit));
          }}
          onBlur={() => {
            setFocused(false);
            const err = validateDimensionField(draft, rules, unit);
            if (draft.trim() === '' && !rules.required) {
              if (valueMillimeters !== undefined) onCommit(undefined);
              resetDraft();
              return;
            }
            if (draft.trim() === '' || err) {
              resetDraft();
              return;
            }
            const displayNumber = Number(draft);
            if (!Number.isFinite(displayNumber)) {
              resetDraft();
              return;
            }
            if (displayNumber === Number(displayValue)) {
              resetDraft();
              return;
            }
            const millimeters = Math.round(toMillimetersFromDimensionUnit(displayNumber, unit));
            onCommit(clampDimensionMillimetersToRules(millimeters, rules));
          }}
          placeholder={placeholderMillimeters !== undefined ? dimensionInputValueFromMillimeters(placeholderMillimeters, unit) : undefined}
          min={rules.min !== undefined ? dimensionInputValueFromMillimeters(rules.min, unit) : undefined}
          max={rules.max !== undefined ? dimensionInputValueFromMillimeters(rules.max, unit) : undefined}
          step={dimensionInputStep(unit)}
          className={`w-full px-3 py-2 pr-12 bg-surface-input border rounded-lg text-content text-sm focus:outline-none ${
            error ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-blue-500'
          }`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary text-xs pointer-events-none">
          {UNIT_LABELS.dimensions[unit]}
        </span>
      </div>
      {error && <div className="text-[10px] text-red-400 mt-0.5">{error}</div>}
    </div>
  );
}

function areaInputStep(unit: AreaUnit): string {
  return String(1 / (10 ** AREA_INPUT_PRECISION[unit]));
}

function clampAreaSquareCentimetersToRules(squareCentimeters: number, rules: FieldValidation): number {
  let next = squareCentimeters;
  if (rules.min !== undefined) next = Math.max(rules.min, next);
  if (rules.max !== undefined) next = Math.min(rules.max, next);
  return next;
}

function validateAreaSquareCentimetersField(value: string, rules: FieldValidation, unit: AreaUnit): string | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return rules.required ? 'Required' : null;
  }
  const displayValue = Number(trimmed);
  if (!Number.isFinite(displayValue)) return 'Must be a valid number';

  const squareCentimeters = toSquareCentimetersFromAreaUnit(displayValue, unit);
  if (rules.min !== undefined && squareCentimeters < rules.min) {
    return `Min: ${areaInputValueFromSquareCentimeters(rules.min, unit)} ${UNIT_LABELS.area[unit]}`;
  }
  if (rules.max !== undefined && squareCentimeters > rules.max) {
    return `Max: ${areaInputValueFromSquareCentimeters(rules.max, unit)} ${UNIT_LABELS.area[unit]}`;
  }
  return null;
}

function AreaInputField({
  label,
  valueSquareCentimeters,
  onCommit,
  unit,
  placeholderSquareCentimeters,
  rules,
}: {
  label: string;
  valueSquareCentimeters: number | undefined;
  onCommit: (squareCentimeters: number | undefined) => void;
  unit: AreaUnit;
  placeholderSquareCentimeters?: number;
  rules: FieldValidation;
}) {
  const displayValue = areaInputValueFromSquareCentimeters(valueSquareCentimeters, unit);
  const [draft, setDraft] = useState(displayValue);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) setDraft(displayValue);
  }, [displayValue, focused]);

  const resetDraft = useCallback(() => {
    setDraft(areaInputValueFromSquareCentimeters(valueSquareCentimeters, unit));
    setError(null);
  }, [unit, valueSquareCentimeters]);

  return (
    <div>
      <label className="block text-xs text-content-secondary mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={draft}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            setError(validateAreaSquareCentimetersField(next, rules, unit));
          }}
          onBlur={() => {
            setFocused(false);
            const err = validateAreaSquareCentimetersField(draft, rules, unit);
            if (draft.trim() === '' && !rules.required) {
              if (valueSquareCentimeters !== undefined) onCommit(undefined);
              resetDraft();
              return;
            }
            if (draft.trim() === '' || err) {
              resetDraft();
              return;
            }
            const displayNumber = Number(draft);
            if (!Number.isFinite(displayNumber)) {
              resetDraft();
              return;
            }
            if (displayNumber === Number(displayValue)) {
              resetDraft();
              return;
            }
            const squareCentimeters = Math.round(toSquareCentimetersFromAreaUnit(displayNumber, unit));
            onCommit(clampAreaSquareCentimetersToRules(squareCentimeters, rules));
          }}
          placeholder={placeholderSquareCentimeters !== undefined ? areaInputValueFromSquareCentimeters(placeholderSquareCentimeters, unit) : undefined}
          min={rules.min !== undefined ? areaInputValueFromSquareCentimeters(rules.min, unit) : undefined}
          max={rules.max !== undefined ? areaInputValueFromSquareCentimeters(rules.max, unit) : undefined}
          step={areaInputStep(unit)}
          className={`w-full px-3 py-2 pr-12 bg-surface-input border rounded-lg text-content text-sm focus:outline-none ${
            error ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-blue-500'
          }`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary text-xs pointer-events-none">
          {UNIT_LABELS.area[unit]}
        </span>
      </div>
      {error && <div className="text-[10px] text-red-400 mt-0.5">{error}</div>}
    </div>
  );
}

function VehicleInputField({
  label,
  value,
  onChange,
  unit,
  placeholder,
  type = 'number',
  min,
  max,
  step,
  error,
  onBlur,
}: {
  label: string;
  value: string | number | undefined;
  onChange: (val: string) => void;
  unit?: string;
  placeholder?: string;
  type?: 'text' | 'number';
  min?: number;
  max?: number;
  step?: number;
  error?: string | null;
  onBlur?: () => void;
}) {
  return (
    <div>
      <label className="block text-xs text-content-secondary mb-1">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          className={`w-full px-3 py-2 bg-surface-input border rounded-lg text-content text-sm focus:outline-none ${
            unit ? 'pr-12' : ''
          } ${
            error ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-blue-500'
          }`}
        />
        {unit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary text-xs pointer-events-none">{unit}</span>
        )}
      </div>
      {error && <div className="text-[10px] text-red-400 mt-0.5">{error}</div>}
    </div>
  );
}

function AltitudeInputField({
  label,
  valueMeters,
  onCommit,
  unit,
  placeholderMeters,
  rules,
}: {
  label: string;
  valueMeters: number | undefined;
  onCommit: (meters: number) => void;
  unit: AltitudeUnit;
  placeholderMeters?: number;
  rules: FieldValidation;
}) {
  const displayValue = altitudeInputValueFromMeters(valueMeters, unit);
  const [draft, setDraft] = useState(displayValue);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) setDraft(displayValue);
  }, [displayValue, focused]);

  const resetDraft = useCallback(() => {
    setDraft(altitudeInputValueFromMeters(valueMeters, unit));
    setError(null);
  }, [unit, valueMeters]);

  return (
    <div>
      <label className="block text-xs text-content-secondary mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={draft}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            setError(validateAltitudeField(next, rules, unit));
          }}
          onBlur={() => {
            setFocused(false);
            const err = validateAltitudeField(draft, rules, unit);
            if (draft.trim() === '' || err) {
              resetDraft();
              return;
            }
            const displayNumber = Number(draft);
            if (!Number.isFinite(displayNumber)) {
              resetDraft();
              return;
            }
            if (displayNumber === Number(displayValue)) {
              resetDraft();
              return;
            }
            onCommit(clampAltitudeMetersToRules(toMetersFromAltitudeUnit(displayNumber, unit), rules));
          }}
          placeholder={placeholderMeters !== undefined ? altitudeInputValueFromMeters(placeholderMeters, unit) : undefined}
          min={rules.min !== undefined ? altitudeInputValueFromMeters(rules.min, unit) : undefined}
          max={rules.max !== undefined ? altitudeInputValueFromMeters(rules.max, unit) : undefined}
          step={altitudeInputStep(unit)}
          className={`w-full px-3 py-2 pr-12 bg-surface-input border rounded-lg text-content text-sm focus:outline-none ${
            error ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-blue-500'
          }`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary text-xs pointer-events-none">
          {UNIT_LABELS.altitude[unit]}
        </span>
      </div>
      {error && <div className="text-[10px] text-red-400 mt-0.5">{error}</div>}
    </div>
  );
}

function weightInputStep(unit: WeightUnit): string {
  return String(1 / (10 ** UNIT_PRECISION.weight[unit]));
}

function clampWeightGramsToRules(grams: number, rules: FieldValidation): number {
  let next = grams;
  if (rules.min !== undefined) next = Math.max(rules.min, next);
  if (rules.max !== undefined) next = Math.min(rules.max, next);
  return next;
}

function validateWeightField(value: string, rules: FieldValidation, unit: WeightUnit): string | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return rules.required ? 'Required' : null;
  }
  const displayValue = Number(trimmed);
  if (!Number.isFinite(displayValue)) return 'Must be a valid number';

  const grams = toGramsFromWeightUnit(displayValue, unit);
  if (rules.min !== undefined && grams < rules.min) {
    return `Min: ${weightInputValueFromGrams(rules.min, unit)} ${UNIT_LABELS.weight[unit]}`;
  }
  if (rules.max !== undefined && grams > rules.max) {
    return `Max: ${weightInputValueFromGrams(rules.max, unit)} ${UNIT_LABELS.weight[unit]}`;
  }
  if (unit === 'g' && rules.integer && !Number.isInteger(displayValue)) {
    return 'Must be a whole number';
  }
  return null;
}

function WeightInputField({
  label,
  valueGrams,
  onCommit,
  unit,
  placeholderGrams,
  rules,
}: {
  label: string;
  valueGrams: number | undefined;
  onCommit: (grams: number | undefined) => void;
  unit: WeightUnit;
  placeholderGrams?: number;
  rules: FieldValidation;
}) {
  const displayValue = weightInputValueFromGrams(valueGrams, unit);
  const [draft, setDraft] = useState(displayValue);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) setDraft(displayValue);
  }, [displayValue, focused]);

  const resetDraft = useCallback(() => {
    setDraft(weightInputValueFromGrams(valueGrams, unit));
    setError(null);
  }, [unit, valueGrams]);

  return (
    <div>
      <label className="block text-xs text-content-secondary mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={draft}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            setError(validateWeightField(next, rules, unit));
          }}
          onBlur={() => {
            setFocused(false);
            const err = validateWeightField(draft, rules, unit);
            if (draft.trim() === '' && !rules.required) {
              if (valueGrams !== undefined) onCommit(undefined);
              resetDraft();
              return;
            }
            if (draft.trim() === '' || err) {
              resetDraft();
              return;
            }
            const displayNumber = Number(draft);
            if (!Number.isFinite(displayNumber)) {
              resetDraft();
              return;
            }
            if (displayNumber === Number(displayValue)) {
              resetDraft();
              return;
            }
            const grams = Math.round(toGramsFromWeightUnit(displayNumber, unit));
            onCommit(clampWeightGramsToRules(grams, rules));
          }}
          placeholder={placeholderGrams !== undefined ? weightInputValueFromGrams(placeholderGrams, unit) : undefined}
          min={rules.min !== undefined ? weightInputValueFromGrams(rules.min, unit) : undefined}
          max={rules.max !== undefined ? weightInputValueFromGrams(rules.max, unit) : undefined}
          step={weightInputStep(unit)}
          className={`w-full px-3 py-2 pr-12 bg-surface-input border rounded-lg text-content text-sm focus:outline-none ${
            error ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-blue-500'
          }`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary text-xs pointer-events-none">
          {UNIT_LABELS.weight[unit]}
        </span>
      </div>
      {error && <div className="text-[10px] text-red-400 mt-0.5">{error}</div>}
    </div>
  );
}

function capacityInputValueFromMah(mah: number | undefined, unit: ElectricCapacityUnit): string {
  const nativeValue = mah ?? 0;
  const decimals = UNIT_PRECISION.electricCapacity[unit];
  return String(Number(capacityValueFromMah(nativeValue, unit).toFixed(decimals)));
}

function capacityInputStep(unit: ElectricCapacityUnit): string {
  return unit === 'ah' ? '0.01' : '1';
}

function validateCapacityField(value: string, rules: FieldValidation, unit: ElectricCapacityUnit): string | null {
  if (value.trim() === '') {
    return rules.required ? 'Required' : null;
  }

  const displayValue = Number(value);
  if (!Number.isFinite(displayValue)) return 'Must be a valid number';

  const mah = toMahFromCapacityUnit(displayValue, unit);
  if (rules.min !== undefined && mah < rules.min) {
    return `Min: ${capacityInputValueFromMah(rules.min, unit)} ${UNIT_LABELS.electricCapacity[unit]}`;
  }
  if (rules.max !== undefined && mah > rules.max) {
    return `Max: ${capacityInputValueFromMah(rules.max, unit)} ${UNIT_LABELS.electricCapacity[unit]}`;
  }
  if (unit === 'mah' && rules.integer && !Number.isInteger(displayValue)) {
    return 'Must be a whole number';
  }
  return null;
}

function CapacityInputField({
  label,
  valueMah,
  onCommit,
  unit,
  placeholderMah,
  rules,
}: {
  label: string;
  valueMah: number | undefined;
  onCommit: (mah: number) => void;
  unit: ElectricCapacityUnit;
  placeholderMah?: number;
  rules: FieldValidation;
}) {
  const displayValue = capacityInputValueFromMah(valueMah, unit);
  const [draft, setDraft] = useState(displayValue);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) setDraft(displayValue);
  }, [displayValue, focused]);

  const resetDraft = useCallback(() => {
    setDraft(capacityInputValueFromMah(valueMah, unit));
    setError(null);
  }, [unit, valueMah]);

  return (
    <div>
      <label className="block text-xs text-content-secondary mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={draft}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            setError(validateCapacityField(next, rules, unit));
          }}
          onBlur={() => {
            setFocused(false);
            const err = validateCapacityField(draft, rules, unit);
            if (draft.trim() === '' || err) {
              resetDraft();
              return;
            }
            const displayNumber = Number(draft);
            if (!Number.isFinite(displayNumber)) {
              resetDraft();
              return;
            }
            if (displayNumber === Number(displayValue)) {
              resetDraft();
              return;
            }
            onCommit(Math.round(toMahFromCapacityUnit(displayNumber, unit)));
          }}
          placeholder={placeholderMah !== undefined ? capacityInputValueFromMah(placeholderMah, unit) : undefined}
          min={rules.min !== undefined ? capacityInputValueFromMah(rules.min, unit) : undefined}
          max={rules.max !== undefined ? capacityInputValueFromMah(rules.max, unit) : undefined}
          step={capacityInputStep(unit)}
          className={`w-full px-3 py-2 pr-12 bg-surface-input border rounded-lg text-content text-sm focus:outline-none ${
            error ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-blue-500'
          }`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary text-xs pointer-events-none">
          {UNIT_LABELS.electricCapacity[unit]}
        </span>
      </div>
      {error && <div className="text-[10px] text-red-400 mt-0.5">{error}</div>}
    </div>
  );
}

function SpeedInputField({
  label,
  valueMps,
  onCommit,
  unit,
  placeholderMps,
  rules,
}: {
  label?: string;
  valueMps: number | undefined;
  onCommit: (mps: number | undefined) => void;
  unit: SpeedUnit;
  placeholderMps?: number;
  rules: FieldValidation;
}) {
  const displayValue = speedInputValueFromMetersPerSecond(valueMps, unit);
  const [draft, setDraft] = useState(displayValue);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focused) setDraft(displayValue);
  }, [displayValue, focused]);

  const resetDraft = useCallback(() => {
    setDraft(speedInputValueFromMetersPerSecond(valueMps, unit));
    setError(null);
  }, [unit, valueMps]);

  return (
    <div>
      {label && <label className="block text-xs text-content-secondary mb-1">{label}</label>}
      <div className="relative">
        <input
          type="number"
          value={draft}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            setError(validateSpeedField(next, rules, unit));
          }}
          onBlur={() => {
            setFocused(false);
            if (draft.trim() === '') {
              if (rules.required) {
                resetDraft();
                return;
              }
              if (valueMps !== undefined) onCommit(undefined);
              resetDraft();
              return;
            }
            const err = validateSpeedField(draft, rules, unit);
            if (err) {
              resetDraft();
              return;
            }
            const displayNumber = Number(draft);
            if (!Number.isFinite(displayNumber)) {
              resetDraft();
              return;
            }
            if (displayNumber === Number(displayValue)) {
              resetDraft();
              return;
            }
            onCommit(clampSpeedMetersPerSecondToRules(toMetersPerSecondFromSpeedUnit(displayNumber, unit), rules));
          }}
          placeholder={placeholderMps !== undefined ? speedInputValueFromMetersPerSecond(placeholderMps, unit) : undefined}
          min={rules.min !== undefined ? speedInputValueFromMetersPerSecond(rules.min, unit) : undefined}
          max={rules.max !== undefined ? speedInputValueFromMetersPerSecond(rules.max, unit) : undefined}
          step={speedInputStep(unit)}
          className={`w-full px-3 py-2 pr-12 bg-surface-input border rounded-lg text-content text-sm focus:outline-none ${
            error ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-blue-500'
          }`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-secondary text-xs pointer-events-none">
          {UNIT_LABELS.speed[unit]}
        </span>
      </div>
      {error && <div className="text-[10px] text-red-400 mt-0.5">{error}</div>}
    </div>
  );
}

// Select field component for vehicle forms
function VehicleSelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | number | undefined;
  onChange: (val: string) => void;
  options: { value: string | number; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs text-content-secondary mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-content text-sm focus:outline-none focus:border-blue-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

/**
 * Hook for managing local draft state + validation for vehicle edit form.
 * Fields are validated on change (visual feedback) and committed on blur.
 * Invalid values revert to the last valid store value on blur.
 */
function useVehicleForm(vehicle: VehicleProfile, onUpdate: (updates: Partial<VehicleProfile>) => void) {
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  // Clear local state when vehicle type changes (fields appear/disappear)
  useEffect(() => {
    setLocalValues({});
    setErrors({});
  }, [vehicle.type]);

  const getDisplayValue = useCallback((field: string): string | number | undefined => {
    if (field in localValues) return localValues[field];
    return (vehicle as any)[field];
  }, [localValues, vehicle]);

  const handleChange = useCallback((field: string, rawValue: string, isText?: boolean) => {
    setLocalValues(prev => ({ ...prev, [field]: rawValue }));
    const rules = VEHICLE_FIELD_RULES[field];
    if (rules) {
      setErrors(prev => ({ ...prev, [field]: validateField(rawValue, rules, isText) }));
    }
  }, []);

  const handleBlur = useCallback((field: string, isText?: boolean) => {
    const raw = localValues[field];
    if (raw === undefined) return; // wasn't edited

    const rules = VEHICLE_FIELD_RULES[field];
    const error = rules ? validateField(raw, rules, isText) : null;

    if (error) {
      // Revert to store value
      setLocalValues(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
      setErrors(prev => ({ ...prev, [field]: null }));
      return;
    }

    // Commit valid value
    if (isText) {
      const trimmed = raw.trim();
      onUpdate({ [field]: trimmed || undefined } as Partial<VehicleProfile>);
    } else if (raw.trim() === '') {
      onUpdate({ [field]: undefined } as Partial<VehicleProfile>);
    } else {
      onUpdate({ [field]: Number(raw) } as Partial<VehicleProfile>);
    }

    setLocalValues(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setErrors(prev => ({ ...prev, [field]: null }));
  }, [localValues, onUpdate]);

  const getError = useCallback((field: string): string | null => {
    return errors[field] ?? null;
  }, [errors]);

  return { getDisplayValue, handleChange, handleBlur, getError };
}

/**
 * Vehicle Edit Modal - Vehicle-type-specific fields
 */
function VehicleEditModal({
  vehicle,
  onUpdate,
  onClose,
}: {
  vehicle: VehicleProfile;
  onUpdate: (updates: Partial<VehicleProfile>) => void;
  onClose: () => void;
}) {
  const { getDisplayValue, handleChange, handleBlur, getError } = useVehicleForm(vehicle, onUpdate);
  const { unitPreferences } = useSettingsStore();
  const altitudeUnit = unitPreferences.altitude;
  const electricCapacityUnit = unitPreferences.electricCapacity;
  const speedUnit = unitPreferences.speed;
  const weightUnit = unitPreferences.weight;
  const dimensionUnit = unitPreferences.dimensions;
  const areaUnit = unitPreferences.area;

  const isCopter = vehicle.type === 'copter';
  const isPlane = vehicle.type === 'plane';
  const isVtol = vehicle.type === 'vtol';
  const isRover = vehicle.type === 'rover';
  const isBoat = vehicle.type === 'boat';
  const isSub = vehicle.type === 'sub';

  const nameValue = (getDisplayValue('name') as string) ?? '';
  const nameError = getError('name');

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-raised rounded-xl border border-border w-full max-w-lg mx-4 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 text-blue-400">
              {VEHICLE_ICONS[vehicle.type]}
            </div>
            <h2 className="text-lg font-semibold text-content">Edit {VEHICLE_TYPE_NAMES[vehicle.type]}</h2>
          </div>
          <button onClick={onClose} className="text-content-secondary hover:text-content">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Basic Info - Common to all */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-content mb-1.5">Vehicle Name</label>
              <input
                type="text"
                value={nameValue}
                onChange={(e) => handleChange('name', e.target.value.slice(0, 50), true)}
                onBlur={() => handleBlur('name', true)}
                placeholder="My Vehicle"
                className={`w-full px-3 py-2 bg-surface-input border rounded-lg text-content focus:outline-none ${
                  nameError ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-blue-500'
                }`}
              />
              {nameError && <div className="text-[10px] text-red-400 mt-0.5">{nameError}</div>}
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-content mb-1.5">Vehicle Type</label>
              <select
                value={vehicle.type}
                onChange={(e) => onUpdate({ type: e.target.value as VehicleType })}
                className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-content focus:outline-none focus:border-blue-500"
              >
                {Object.entries(VEHICLE_TYPE_NAMES).map(([key, name]) => (
                  <option key={key} value={key}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ========== CONFIG SPECIFIERS (wing shape / VTOL style / motor arrangement) ========== */}
          <ConfigSelectors vehicle={vehicle} onUpdate={onUpdate} />

          {/* ========== COPTER-SPECIFIC ========== */}
          {isCopter && (
            <div>
              <h3 className="text-sm font-medium text-content-secondary mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Airframe
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <DimensionInputField
                  label="Frame Size"
                  valueMillimeters={vehicle.frameSize}
                  onCommit={(millimeters) => onUpdate({ frameSize: millimeters })}
                  unit={dimensionUnit}
                  placeholderMillimeters={127}
                  rules={VEHICLE_FIELD_RULES.frameSize!}
                />
                <VehicleSelectField
                  label="Motor Count"
                  value={vehicle.motorCount || 4}
                  onChange={(v) => onUpdate({ motorCount: Number(v) })}
                  options={[
                    { value: 3, label: 'Tricopter (3)' },
                    { value: 4, label: 'Quadcopter (4)' },
                    { value: 6, label: 'Hexacopter (6)' },
                    { value: 8, label: 'Octocopter (8)' },
                  ]}
                />
                <WeightInputField
                  label="All-Up Weight"
                  valueGrams={vehicle.weight}
                  onCommit={(grams) => { if (grams !== undefined) onUpdate({ weight: grams }); }}
                  unit={weightUnit}
                  placeholderGrams={600}
                  rules={VEHICLE_FIELD_RULES.weight!}
                />
                <PropSizeInput
                  value={vehicle.propSize}
                  onChange={(v) => onUpdate({ propSize: v })}
                  presets={[
                    { size: '3x3' }, { size: '4x4.5' }, { size: '5x3' },
                    { size: '5x4.5' }, { size: '6x4' }, { size: '7x3.5' },
                    { size: '7x4' }, { size: '8x4' }, { size: '9x4.5' },
                    { size: '10x4.5' },
                  ]}
                />
              </div>
            </div>
          )}

          {/* ========== PLANE-SPECIFIC ========== */}
          {isPlane && (
            <div>
              <h3 className="text-sm font-medium text-content-secondary mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Airframe
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <DimensionInputField
                  label="Wingspan"
                  valueMillimeters={vehicle.wingspan}
                  onCommit={(millimeters) => onUpdate({ wingspan: millimeters })}
                  unit={dimensionUnit}
                  placeholderMillimeters={1200}
                  rules={VEHICLE_FIELD_RULES.wingspan!}
                />
                <WeightInputField
                  label="All-Up Weight"
                  valueGrams={vehicle.weight}
                  onCommit={(grams) => { if (grams !== undefined) onUpdate({ weight: grams }); }}
                  unit={weightUnit}
                  placeholderGrams={1500}
                  rules={VEHICLE_FIELD_RULES.weight!}
                />
                <AreaInputField
                  label="Wing Area"
                  valueSquareCentimeters={vehicle.wingArea}
                  onCommit={(squareCentimeters) => onUpdate({ wingArea: squareCentimeters })}
                  unit={areaUnit}
                  placeholderSquareCentimeters={2400}
                  rules={VEHICLE_FIELD_RULES.wingArea!}
                />
                <div>
                  <div className="flex items-center justify-between mb-1 min-h-[18px]">
                    <label className="text-xs text-content-secondary">Stall Speed</label>
                    <StallSpeedCalcButton
                      vehicle={vehicle}
                      onCompute={(mps) => onUpdate({ stallSpeed: mps })}
                    />
                  </div>
                  <SpeedInputField
                    label=""
                    valueMps={vehicle.stallSpeed}
                    onCommit={(mps) => onUpdate({ stallSpeed: mps })}
                    unit={speedUnit}
                    placeholderMps={8}
                    rules={VEHICLE_FIELD_RULES.stallSpeed!}
                  />
                </div>
                <PropSizeInput
                  value={vehicle.propSize}
                  onChange={(v) => onUpdate({ propSize: v })}
                  presets={[
                    { size: '8x4' }, { size: '8x6' }, { size: '9x6' },
                    { size: '10x5' }, { size: '10x7' }, { size: '11x7' },
                    { size: '12x6' }, { size: '13x6.5' }, { size: '14x7' },
                    { size: '16x8' }, { size: '18x8' },
                  ]}
                />
              </div>
            </div>
          )}

          {/* ========== VTOL-SPECIFIC ========== */}
          {isVtol && (
            <div>
              <h3 className="text-sm font-medium text-content-secondary mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                VTOL Airframe
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <DimensionInputField
                  label="Wingspan"
                  valueMillimeters={vehicle.wingspan}
                  onCommit={(millimeters) => onUpdate({ wingspan: millimeters })}
                  unit={dimensionUnit}
                  placeholderMillimeters={1500}
                  rules={VEHICLE_FIELD_RULES.wingspan!}
                />
                <VehicleSelectField
                  label="VTOL Motors"
                  value={vehicle.vtolMotorCount || 4}
                  onChange={(v) => onUpdate({ vtolMotorCount: Number(v) })}
                  options={[
                    { value: 2, label: 'Bicopter (2)' },
                    { value: 4, label: 'Quadplane (4)' },
                    { value: 6, label: 'Hexaplane (6)' },
                  ]}
                />
                <WeightInputField
                  label="All-Up Weight"
                  valueGrams={vehicle.weight}
                  onCommit={(grams) => { if (grams !== undefined) onUpdate({ weight: grams }); }}
                  unit={weightUnit}
                  placeholderGrams={3000}
                  rules={VEHICLE_FIELD_RULES.weight!}
                />
                <SpeedInputField
                  label="Transition Speed"
                  valueMps={vehicle.transitionSpeed}
                  onCommit={(mps) => onUpdate({ transitionSpeed: mps })}
                  unit={speedUnit}
                  placeholderMps={15}
                  rules={VEHICLE_FIELD_RULES.transitionSpeed!}
                />
                <PropSizeInput
                  value={vehicle.propSize}
                  onChange={(v) => onUpdate({ propSize: v })}
                  presets={[
                    { size: '8x6' }, { size: '10x5' }, { size: '10x7' },
                    { size: '12x6' }, { size: '14x7' }, { size: '16x8' },
                    { size: '18x8' },
                  ]}
                />
              </div>
            </div>
          )}

          {/* ========== ROVER-SPECIFIC ========== */}
          {isRover && (
            <div>
              <h3 className="text-sm font-medium text-content-secondary mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Chassis
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <VehicleSelectField
                  label="Drive Type"
                  value={vehicle.driveType || 'differential'}
                  onChange={(v) => onUpdate({ driveType: v as 'differential' | 'ackermann' | 'skid' })}
                  options={[
                    { value: 'differential', label: 'Differential (tank)' },
                    { value: 'ackermann', label: 'Ackermann (car)' },
                    { value: 'skid', label: 'Skid Steer' },
                  ]}
                />
                <WeightInputField
                  label="Total Weight"
                  valueGrams={vehicle.weight}
                  onCommit={(grams) => { if (grams !== undefined) onUpdate({ weight: grams }); }}
                  unit={weightUnit}
                  placeholderGrams={2000}
                  rules={VEHICLE_FIELD_RULES.weight!}
                />
                <DimensionInputField
                  label="Wheelbase"
                  valueMillimeters={vehicle.wheelbase}
                  onCommit={(millimeters) => onUpdate({ wheelbase: millimeters })}
                  unit={dimensionUnit}
                  placeholderMillimeters={300}
                  rules={VEHICLE_FIELD_RULES.wheelbase!}
                />
                <DimensionInputField
                  label="Wheel Diameter"
                  valueMillimeters={vehicle.wheelDiameter}
                  onCommit={(millimeters) => onUpdate({ wheelDiameter: millimeters })}
                  unit={dimensionUnit}
                  placeholderMillimeters={100}
                  rules={VEHICLE_FIELD_RULES.wheelDiameter!}
                />
                <SpeedInputField
                  label="Max Speed"
                  valueMps={vehicle.maxSpeed}
                  onCommit={(mps) => onUpdate({ maxSpeed: mps })}
                  unit={speedUnit}
                  placeholderMps={5}
                  rules={VEHICLE_FIELD_RULES.maxSpeed!}
                />
              </div>
            </div>
          )}

          {/* ========== BOAT-SPECIFIC ========== */}
          {isBoat && (
            <div>
              <h3 className="text-sm font-medium text-content-secondary mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Hull
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <VehicleSelectField
                  label="Hull Type"
                  value={vehicle.hullType || 'displacement'}
                  onChange={(v) => onUpdate({ hullType: v as 'displacement' | 'planing' | 'catamaran' | 'pontoon' })}
                  options={[
                    { value: 'displacement', label: 'Displacement' },
                    { value: 'planing', label: 'Planing' },
                    { value: 'catamaran', label: 'Catamaran' },
                    { value: 'pontoon', label: 'Pontoon' },
                  ]}
                />
                <VehicleSelectField
                  label="Propulsion"
                  value={vehicle.propellerType || 'prop'}
                  onChange={(v) => onUpdate({ propellerType: v as 'prop' | 'jet' | 'paddle' })}
                  options={[
                    { value: 'prop', label: 'Propeller' },
                    { value: 'jet', label: 'Water Jet' },
                    { value: 'paddle', label: 'Paddle Wheel' },
                  ]}
                />
                <DimensionInputField
                  label="Hull Length"
                  valueMillimeters={vehicle.hullLength}
                  onCommit={(millimeters) => onUpdate({ hullLength: millimeters })}
                  unit={dimensionUnit}
                  placeholderMillimeters={600}
                  rules={VEHICLE_FIELD_RULES.hullLength!}
                />
                <WeightInputField
                  label="Total Weight"
                  valueGrams={vehicle.weight}
                  onCommit={(grams) => { if (grams !== undefined) onUpdate({ weight: grams }); }}
                  unit={weightUnit}
                  placeholderGrams={3000}
                  rules={VEHICLE_FIELD_RULES.weight!}
                />
                <WeightInputField
                  label="Displacement"
                  valueGrams={vehicle.displacement}
                  onCommit={(grams) => onUpdate({ displacement: grams })}
                  unit={weightUnit}
                  placeholderGrams={3500}
                  rules={VEHICLE_FIELD_RULES.displacement!}
                />
                <SpeedInputField
                  label="Max Speed"
                  valueMps={vehicle.maxSpeed}
                  onCommit={(mps) => onUpdate({ maxSpeed: mps })}
                  unit={speedUnit}
                  placeholderMps={3}
                  rules={VEHICLE_FIELD_RULES.maxSpeed!}
                />
              </div>
            </div>
          )}

          {/* ========== SUB-SPECIFIC ========== */}
          {isSub && (
            <div>
              <h3 className="text-sm font-medium text-content-secondary mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Hull & Thrusters
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <DimensionInputField
                  label="Hull Length"
                  valueMillimeters={vehicle.hullLength}
                  onCommit={(millimeters) => onUpdate({ hullLength: millimeters })}
                  unit={dimensionUnit}
                  placeholderMillimeters={500}
                  rules={VEHICLE_FIELD_RULES.hullLength!}
                />
                <VehicleSelectField
                  label="Thruster Count"
                  value={vehicle.thrusterCount || 4}
                  onChange={(v) => onUpdate({ thrusterCount: Number(v) })}
                  options={[
                    { value: 2, label: '2 Thrusters' },
                    { value: 4, label: '4 Thrusters' },
                    { value: 6, label: '6 Thrusters' },
                    { value: 8, label: '8 Thrusters' },
                  ]}
                />
                <WeightInputField
                  label="Dry Weight"
                  valueGrams={vehicle.weight}
                  onCommit={(grams) => { if (grams !== undefined) onUpdate({ weight: grams }); }}
                  unit={weightUnit}
                  placeholderGrams={5000}
                  rules={VEHICLE_FIELD_RULES.weight!}
                />
                <AltitudeInputField
                  label="Max Depth Rating"
                  valueMeters={vehicle.maxDepth}
                  onCommit={(meters) => onUpdate({ maxDepth: meters })}
                  unit={altitudeUnit}
                  placeholderMeters={100}
                  rules={VEHICLE_FIELD_RULES.maxDepth!}
                />
                <VehicleSelectField
                  label="Buoyancy"
                  value={vehicle.buoyancy || 'neutral'}
                  onChange={(v) => onUpdate({ buoyancy: v as 'positive' | 'neutral' | 'negative' })}
                  options={[
                    { value: 'positive', label: 'Positive (floats)' },
                    { value: 'neutral', label: 'Neutral' },
                    { value: 'negative', label: 'Negative (sinks)' },
                  ]}
                />
                <SpeedInputField
                  label="Max Speed"
                  valueMps={vehicle.maxSpeed}
                  onCommit={(mps) => onUpdate({ maxSpeed: mps })}
                  unit={speedUnit}
                  placeholderMps={2}
                  rules={VEHICLE_FIELD_RULES.maxSpeed!}
                />
              </div>
            </div>
          )}

          {/* Battery - Common to all */}
          <div>
            <h3 className="text-sm font-medium text-content-secondary mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Battery
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <VehicleSelectField
                label="Chemistry"
                value={vehicle.batteryChemistry || 'lipo'}
                onChange={(v) => onUpdate({ batteryChemistry: v as VehicleProfile['batteryChemistry'] })}
                options={[
                  { value: 'lipo', label: 'LiPo (3.7V)' },
                  { value: 'lihv', label: 'LiHV (3.8V)' },
                  { value: 'lion', label: 'Li-Ion (3.6V)' },
                  { value: 'life', label: 'LiFePO4 (3.3V)' },
                ]}
              />
              <VehicleSelectField
                label="Cell Count"
                value={vehicle.batteryCells || 4}
                onChange={(v) => onUpdate({ batteryCells: Number(v) })}
                options={[
                  { value: 2, label: '2S' },
                  { value: 3, label: '3S' },
                  { value: 4, label: '4S' },
                  { value: 5, label: '5S' },
                  { value: 6, label: '6S' },
                  { value: 7, label: '7S' },
                  { value: 8, label: '8S' },
                  { value: 10, label: '10S' },
                  { value: 12, label: '12S' },
                  { value: 14, label: '14S' },
                ]}
              />
              <CapacityInputField
                label="Capacity"
                valueMah={vehicle.batteryCapacity}
                onCommit={(mah) => onUpdate({ batteryCapacity: mah })}
                unit={electricCapacityUnit}
                placeholderMah={1500}
                rules={VEHICLE_FIELD_RULES.batteryCapacity!}
              />
            </div>
          </div>

          {/* Advanced - Vehicle-type specific */}
          <details className="group">
            <summary className="text-sm font-medium text-content-secondary cursor-pointer hover:text-content flex items-center gap-2">
              <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Advanced (optional)
            </summary>
            <div className="mt-3 space-y-3">
              {/* Copter Advanced */}
              {isCopter && (
                <div className="grid grid-cols-2 gap-3">
                  <VehicleInputField
                    label="Motor KV"
                    value={getDisplayValue('motorKv')}
                    onChange={(v) => handleChange('motorKv', v)}
                    onBlur={() => handleBlur('motorKv')}
                    error={getError('motorKv')}
                    placeholder="2400"
                  />
                  <VehicleInputField
                    label="ESC Rating"
                    value={getDisplayValue('escRating')}
                    onChange={(v) => handleChange('escRating', v)}
                    onBlur={() => handleBlur('escRating')}
                    error={getError('escRating')}
                    unit="A"
                    placeholder="30"
                  />
                  <VehicleInputField
                    label="Battery C-Rating"
                    value={getDisplayValue('batteryDischarge')}
                    onChange={(v) => handleChange('batteryDischarge', v)}
                    onBlur={() => handleBlur('batteryDischarge')}
                    error={getError('batteryDischarge')}
                    unit="C"
                    placeholder="75"
                  />
                </div>
              )}

              {/* Plane/VTOL Advanced */}
              {(isPlane || isVtol) && (
                <div className="grid grid-cols-2 gap-3">
                  <VehicleInputField
                    label="Motor KV"
                    value={getDisplayValue('motorKv')}
                    onChange={(v) => handleChange('motorKv', v)}
                    onBlur={() => handleBlur('motorKv')}
                    error={getError('motorKv')}
                    placeholder="1000"
                  />
                  <VehicleInputField
                    label="ESC Rating"
                    value={getDisplayValue('escRating')}
                    onChange={(v) => handleChange('escRating', v)}
                    onBlur={() => handleBlur('escRating')}
                    error={getError('escRating')}
                    unit="A"
                    placeholder="40"
                  />
                </div>
              )}

              {/* Rover/Boat/Sub Advanced - Common motor info */}
              {(isRover || isBoat || isSub) && (
                <div className="grid grid-cols-2 gap-3">
                  <VehicleInputField
                    label="Motor KV"
                    value={getDisplayValue('motorKv')}
                    onChange={(v) => handleChange('motorKv', v)}
                    onBlur={() => handleBlur('motorKv')}
                    error={getError('motorKv')}
                    placeholder="1200"
                  />
                  <VehicleInputField
                    label="ESC Rating"
                    value={getDisplayValue('escRating')}
                    onChange={(v) => handleChange('escRating', v)}
                    onBlur={() => handleBlur('escRating')}
                    error={getError('escRating')}
                    unit="A"
                    placeholder="30"
                  />
                </div>
              )}

              {/* Notes - Common to all */}
              <div>
                <label className="block text-xs text-content-secondary mb-1">Notes</label>
                <textarea
                  value={vehicle.notes || ''}
                  onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
                  placeholder="Additional notes about this vehicle..."
                  rows={2}
                  className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-content text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>
          </details>

          {/* ========== PHYSICS (SITL fidelity) ========== */}
          <PhysicsAdvanced vehicle={vehicle} onUpdate={onUpdate} />

          {/* ========== PARAMS PREVIEW + APPLY ========== */}
          <ParamsPreview vehicle={vehicle} onBeforeApply={onClose} />

          {/* ========== AUTO-APPLY TOGGLE ========== */}
          <label className="flex items-start gap-2 text-sm text-content-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={vehicle.autoApplyOnSitl ?? false}
              onChange={(e) => onUpdate({ autoApplyOnSitl: e.target.checked })}
              className="mt-1"
            />
            <span>
              <span className="text-content">Auto-apply to SITL on start</span>
              <span className="block text-xs text-content-tertiary mt-0.5">
                When you launch SITL, this profile's params are reapplied automatically.
              </span>
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Vehicle Card Component
 */
interface VehicleCardProps {
  vehicle: VehicleProfile;
  isActive: boolean;
  isEditing: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onSave: () => void;
  onUpdate: (updates: Partial<VehicleProfile>) => void;
  onDelete: () => void;
  canDelete: boolean;
}

function VehicleCard({
  vehicle,
  isActive,
  isEditing,
  onSelect,
  onEdit,
  onSave,
  onUpdate,
  onDelete,
  canDelete,
}: VehicleCardProps) {
  const { unitPreferences } = useSettingsStore();
  const altitudeUnit = unitPreferences.altitude;
  const electricCapacityUnit = unitPreferences.electricCapacity;
  const weightUnit = unitPreferences.weight;
  const dimensionUnit = unitPreferences.dimensions;
  // Build vehicle-specific info string
  const getVehicleSpecs = () => {
    const parts: string[] = [];
    const chemLabel = vehicle.batteryChemistry && vehicle.batteryChemistry !== 'lipo'
      ? ` ${({ lihv: 'LiHV', lion: 'Li-Ion', life: 'LiFe' } as Record<string, string>)[vehicle.batteryChemistry] ?? ''}`
      : '';
    const batteryStr = `${vehicle.batteryCells}S${chemLabel} ${fmtCapacity(vehicle.batteryCapacity, electricCapacityUnit)}`;

    switch (vehicle.type) {
      case 'copter':
        if (vehicle.frameSize) parts.push(fmtLength(vehicle.frameSize, dimensionUnit));
        if (vehicle.motorCount) {
          const motorNames: Record<number, string> = { 3: 'Tri', 4: 'Quad', 6: 'Hex', 8: 'Octo' };
          parts.push(motorNames[vehicle.motorCount] || `${vehicle.motorCount}M`);
        }
        parts.push(batteryStr);
        parts.push(fmtWeight(vehicle.weight, weightUnit));
        break;
      case 'plane':
        if (vehicle.wingspan) parts.push(`${fmtLength(vehicle.wingspan, dimensionUnit)} span`);
        parts.push(batteryStr);
        parts.push(fmtWeight(vehicle.weight, weightUnit));
        break;
      case 'vtol':
        if (vehicle.wingspan) parts.push(fmtLength(vehicle.wingspan, dimensionUnit));
        if (vehicle.vtolMotorCount) parts.push(`${vehicle.vtolMotorCount} VTOL motors`);
        parts.push(batteryStr);
        break;
      case 'rover':
        if (vehicle.driveType) {
          const driveNames: Record<string, string> = { differential: 'Tank', ackermann: 'Car', skid: 'Skid' };
          parts.push(driveNames[vehicle.driveType] || vehicle.driveType);
        }
        if (vehicle.wheelDiameter) parts.push(`${fmtLength(vehicle.wheelDiameter, dimensionUnit)} wheels`);
        parts.push(batteryStr);
        break;
      case 'boat':
        if (vehicle.hullType) {
          parts.push(vehicle.hullType.charAt(0).toUpperCase() + vehicle.hullType.slice(1));
        }
        if (vehicle.hullLength) parts.push(fmtLength(vehicle.hullLength, dimensionUnit));
        parts.push(batteryStr);
        break;
      case 'sub':
        if (vehicle.thrusterCount) parts.push(`${vehicle.thrusterCount}T`);
        if (vehicle.maxDepth) parts.push(`${formatAltitudeFromMeters(vehicle.maxDepth, altitudeUnit)} rated`);
        parts.push(batteryStr);
        break;
      default:
        parts.push(batteryStr);
        parts.push(fmtWeight(vehicle.weight, weightUnit));
    }

    return parts.join(' • ');
  };

  return (
    <>
      {isEditing && (
        <VehicleEditModal vehicle={vehicle} onUpdate={onUpdate} onClose={onSave} />
      )}
      <div
        className={`bg-surface-input rounded-lg border p-3 transition-colors cursor-pointer ${
          isActive ? 'border-emerald-500/50 bg-emerald-900/10' : 'border-subtle hover:border-border'
        }`}
        onClick={onSelect}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 ${isActive ? 'text-emerald-400' : 'text-content-secondary'}`}>
              {VEHICLE_ICONS[vehicle.type]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-content font-medium text-sm">{vehicle.name}</span>
                {isActive && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">Active</span>
                )}
                {vehicle.boardUid && (
                  <span className="text-[10px] text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded" title={`Board UID: ${vehicle.boardUid}`}>
                    {vehicle.boardId || vehicle.boardName || vehicle.boardUid.slice(0, 8)}
                  </span>
                )}
              </div>
              <div className="text-content-secondary text-xs">
                {getVehicleSpecs()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <ApplyProfileButton profile={vehicle} />
            <button
              onClick={async () => {
                const tpl = getTemplate(vehicle.templateSlug) ?? defaultTemplateForType(vehicle.type);
                await saveParmToFile(vehicle, tpl, { includeSim: false });
              }}
              className="p-1.5 text-content-secondary hover:text-content transition-colors"
              title="Export .parm file"
            >
              <Download className="w-4 h-4" />
            </button>
            <button onClick={onEdit} className="p-1.5 text-content-secondary hover:text-content transition-colors" title="Edit">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            {canDelete && (
              <button onClick={onDelete} className="p-1.5 text-content-secondary hover:text-red-400 transition-colors" title="Delete">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <TemplateChip slug={vehicle.templateSlug} />
          <DriftBadge profile={vehicle} />
          <SnapshotList profile={vehicle} />
        </div>
      </div>
    </>
  );
}
