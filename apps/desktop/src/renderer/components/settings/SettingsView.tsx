import { useState, useEffect } from 'react';
import { useSettingsStore, type VehicleProfile, type VehicleType } from '../../stores/settings-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useUpdateStore } from '../../stores/update-store';

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
  6: 'rover',     // MAV_TYPE_GCS
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
          <p className="text-sm text-gray-300 mt-1">
            Your current profile is configured for <span className="font-medium text-amber-400">{VEHICLE_TYPE_NAMES[profileType]}</span>,
            but you're connected to a <span className="font-medium text-blue-400">{FIRMWARE_NAMES[fcVariant] || fcVariant}</span> board
            {boardId && <span className="text-gray-400"> ({boardId})</span>}.
          </p>
          <p className="text-sm text-gray-400 mt-2">
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
  const percentage = Math.min(100, (value / max) * 100);
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
            className="text-gray-700/50"
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
          <span className="text-xl font-bold text-white">{value}</span>
          <span className="text-xs text-gray-400">{unit}</span>
        </div>
      </div>
      <span className="mt-2 text-sm text-gray-400">{label}</span>
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
    <div className="bg-gray-800/30 rounded-lg p-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <div className="text-lg font-semibold text-white">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
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
  const { gps } = useTelemetryStore();
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
      <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-xl border border-gray-700/50 p-4 h-full">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
          <span className="text-sm font-medium text-gray-400">Weather</span>
        </div>
        <div className="text-center py-6">
          <svg className="w-12 h-12 text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <div className="text-gray-500 text-sm">Getting location...</div>
          <div className="text-gray-600 text-xs mt-1">Connect vehicle or allow location access</div>
        </div>
      </div>
    );
  }

  if (loading && !weather) {
    return (
      <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-xl border border-gray-700/50 p-4 h-full">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
          <span className="text-sm font-medium text-gray-400">Weather</span>
        </div>
        <div className="text-center py-6">
          <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-2" />
          <div className="text-gray-400 text-sm">Loading weather...</div>
        </div>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-xl border border-gray-700/50 p-4 h-full">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
          </svg>
          <span className="text-sm font-medium text-gray-400">Weather</span>
        </div>
        <div className="text-center py-6">
          <div className="text-gray-500 text-sm">Unavailable</div>
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
    if (isBad) return 'from-red-900/50 via-red-800/30 to-gray-900/60';
    if (isCaution) return 'from-amber-900/50 via-amber-800/30 to-gray-900/60';
    if (weather.condition === 'Clear') return 'from-blue-900/50 via-cyan-900/30 to-gray-900/60';
    if (weather.condition === 'Partly Cloudy') return 'from-slate-800/50 via-blue-900/30 to-gray-900/60';
    return 'from-gray-800/60 via-gray-800/40 to-gray-900/60';
  };

  const getBorderColor = () => {
    if (isBad) return 'border-red-500/40';
    if (isCaution) return 'border-amber-500/40';
    if (weather.condition === 'Clear') return 'border-blue-500/40';
    return 'border-gray-600/50';
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
            <div className="text-2xl font-bold text-white">{weather.temp}°C</div>
            <div className="text-sm text-gray-400">{weather.condition}</div>
          </div>
        </div>
        <div className="text-right">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium border ${getStatusColor()}`}>
            {isBad ? 'No Go' : isCaution ? 'Caution' : 'Good'}
          </span>
          <div className="text-[10px] text-gray-500 mt-1 flex items-center justify-end gap-1">
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
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
            <div>
              {isMaritime ? (
                <>
                  <div className="text-lg font-semibold text-white">{kmhToKnots(weather.windSpeed)} <span className="text-sm font-normal text-gray-400">kts</span></div>
                  <div className="text-xs text-gray-500">Wind from {getWindDirection(weather.windDir)}</div>
                </>
              ) : (
                <>
                  <div className="text-lg font-semibold text-white">{weather.windSpeed} <span className="text-sm font-normal text-gray-400">km/h</span></div>
                  <div className="text-xs text-gray-500">Wind from {getWindDirection(weather.windDir)}</div>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            {isMaritime ? (
              <>
                <div className={`text-lg font-semibold ${weather.windGusts > weather.windSpeed * 1.3 ? 'text-amber-400' : 'text-gray-300'}`}>
                  {kmhToKnots(weather.windGusts)} <span className="text-sm font-normal text-gray-400">kts</span>
                </div>
                <div className="text-xs text-gray-500">Gusts</div>
              </>
            ) : (
              <>
                <div className={`text-lg font-semibold ${weather.windGusts > weather.windSpeed * 1.3 ? 'text-amber-400' : 'text-gray-300'}`}>
                  {weather.windGusts} <span className="text-sm font-normal text-gray-400">km/h</span>
                </div>
                <div className="text-xs text-gray-500">Gusts</div>
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
                <div className={`text-lg font-semibold ${(weather.waveHeight || 0) > 1.5 ? 'text-amber-400' : 'text-white'}`}>
                  {weather.waveHeight?.toFixed(1) || '—'} <span className="text-sm font-normal text-gray-400">m</span>
                </div>
                <div className="text-xs text-gray-500">Wave Height</div>
              </div>
            </div>
            {weather.swellHeight !== undefined && (
              <div className="text-right">
                <div className={`text-lg font-semibold ${weather.swellHeight > 2 ? 'text-amber-400' : 'text-gray-300'}`}>
                  {weather.swellHeight?.toFixed(1)} <span className="text-sm font-normal text-gray-400">m</span>
                </div>
                <div className="text-xs text-gray-500">
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
              <div className={`text-sm font-semibold ${weather.visibility < 5 ? 'text-amber-400' : 'text-white'}`}>
                {weather.visibility}km
              </div>
              <div className="text-[10px] text-gray-500 uppercase">Visibility</div>
            </div>
            <div className="bg-black/20 rounded-lg py-2 px-1">
              <div className="text-sm font-semibold text-white">{weather.pressure}</div>
              <div className="text-[10px] text-gray-500 uppercase">hPa</div>
            </div>
            <div className="bg-black/20 rounded-lg py-2 px-1">
              <div className="text-sm font-semibold text-white">{weather.temp}°</div>
              <div className="text-[10px] text-gray-500 uppercase">Air Temp</div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-black/20 rounded-lg py-2 px-1">
              <div className={`text-sm font-semibold ${weather.visibility < 5 ? 'text-amber-400' : 'text-white'}`}>
                {weather.visibility}km
              </div>
              <div className="text-[10px] text-gray-500 uppercase">Visibility</div>
            </div>
            <div className="bg-black/20 rounded-lg py-2 px-1">
              <div className="text-sm font-semibold text-white">{weather.cloudCover}%</div>
              <div className="text-[10px] text-gray-500 uppercase">Clouds</div>
            </div>
            <div className="bg-black/20 rounded-lg py-2 px-1">
              <div className="text-sm font-semibold text-white">{weather.pressure}</div>
              <div className="text-[10px] text-gray-500 uppercase">hPa</div>
            </div>
          </>
        )}
      </div>
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
          <span className="text-sm text-gray-300">{tip.message}</span>
        </div>
      ))}
    </div>
  );
}

// Format time helper
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins} min`;
}

// Format distance helper
function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

/**
 * Settings View - App-level configuration with cool visualizations
 */
export function SettingsView() {
  const {
    missionDefaults,
    vehicles,
    activeVehicleId,
    flightStats,
    updateMissionDefaults,
    addVehicle,
    updateVehicle,
    removeVehicle,
    setActiveVehicle,
    getActiveVehicle,
    getEstimatedFlightTime,
    getEstimatedRange,
  } = useSettingsStore();

  const { connectionState } = useConnectionStore();
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const activeVehicle = getActiveVehicle();
  const estimatedFlightTime = getEstimatedFlightTime();
  const estimatedRange = getEstimatedRange();

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

  return (
    <div className="h-full overflow-auto bg-gray-900/30">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white">Settings</h1>
          <p className="text-gray-400 text-sm mt-1">
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
            <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wider">Vehicle & Status</h2>
          </div>

          {/* Top row - Active Vehicle + Performance + Weather */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* Active Vehicle Card - Enhanced */}
            <section className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-xl border border-gray-700/50 p-5">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 text-blue-400 flex-shrink-0">
                  {activeVehicle ? VEHICLE_ICONS[activeVehicle.type] : VEHICLE_ICONS.copter}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-medium text-white truncate">
                        {activeVehicle?.name || 'No vehicle'}
                      </div>
                      <div className="text-sm text-gray-400">
                        {activeVehicle ? VEHICLE_TYPE_NAMES[activeVehicle.type] : ''}
                      </div>
                    </div>
                    {activeVehicle && (
                      <button
                        onClick={() => setEditingVehicleId(activeVehicle.id)}
                        className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-colors"
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
                <div className="mt-4 pt-4 border-t border-gray-700/50">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Type-specific primary spec */}
                    <div className="bg-black/20 rounded-lg p-2">
                      <div className="text-xs text-gray-500">
                        {activeVehicle.type === 'copter' && 'Frame'}
                        {activeVehicle.type === 'plane' && 'Wingspan'}
                        {activeVehicle.type === 'vtol' && 'Wingspan'}
                        {activeVehicle.type === 'rover' && 'Drive'}
                        {activeVehicle.type === 'boat' && 'Hull'}
                        {activeVehicle.type === 'sub' && 'Depth'}
                      </div>
                      <div className="text-sm text-white font-medium">
                        {activeVehicle.type === 'copter' && `${activeVehicle.frameSize || 127}mm ${activeVehicle.motorCount === 6 ? 'Hex' : activeVehicle.motorCount === 8 ? 'Octo' : 'Quad'}`}
                        {activeVehicle.type === 'plane' && `${activeVehicle.wingspan || 1200}mm`}
                        {activeVehicle.type === 'vtol' && `${activeVehicle.wingspan || 1500}mm`}
                        {activeVehicle.type === 'rover' && (activeVehicle.driveType === 'ackermann' ? 'Car' : activeVehicle.driveType === 'skid' ? 'Skid' : 'Tank')}
                        {activeVehicle.type === 'boat' && (activeVehicle.hullType ? `${activeVehicle.hullType.charAt(0).toUpperCase()}${activeVehicle.hullType.slice(1)}` : 'Displacement')}
                        {activeVehicle.type === 'sub' && `${activeVehicle.maxDepth || 100}m`}
                      </div>
                    </div>
                    {/* Weight */}
                    <div className="bg-black/20 rounded-lg p-2">
                      <div className="text-xs text-gray-500">Weight</div>
                      <div className="text-sm text-white font-medium">{activeVehicle.weight}g</div>
                    </div>
                    {/* Battery */}
                    <div className="bg-black/20 rounded-lg p-2">
                      <div className="text-xs text-gray-500">Battery</div>
                      <div className="text-sm text-white font-medium">{activeVehicle.batteryCells}S {activeVehicle.batteryCapacity}mAh</div>
                    </div>
                    {/* Type-specific secondary spec */}
                    <div className="bg-black/20 rounded-lg p-2">
                      <div className="text-xs text-gray-500">
                        {['copter', 'plane', 'vtol'].includes(activeVehicle.type) ? 'Est. Cruise' : 'Est. Speed'}
                      </div>
                      <div className="text-sm text-cyan-400 font-medium">
                        {activeVehicle.type === 'boat'
                          ? `${(cruiseSpeed * 1.944).toFixed(1)} kts`
                          : `${cruiseSpeed.toFixed(1)} m/s`}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Performance Gauges */}
            <section className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-xl border border-gray-700/50 p-5">
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
              <div className="text-center text-xs text-gray-500 mb-2">Based on 80% battery usage</div>
              {/* Approximation note */}
              <div className="bg-blue-500/10 rounded-lg p-2 flex items-start gap-2">
                <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Rough estimates. Better profile = better predictions.
                </p>
              </div>
            </section>

            {/* Weather Widget */}
            <WeatherWidget vehicleType={activeVehicle?.type} />
          </div>

          {/* Stats + Tips row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Quick Stats - 2x2 grid */}
            <section className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-xl border border-gray-700/50 p-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Flight Statistics</h3>
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                  value={formatTime(flightStats.totalFlightTimeSeconds)}
                  label="Flight Time"
                  color="bg-blue-500/20 text-blue-400"
                />
                <StatCard
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
                  value={formatDistance(flightStats.totalDistanceMeters)}
                  label="Distance"
                  color="bg-emerald-500/20 text-emerald-400"
                />
                <StatCard
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
                  value={flightStats.totalMissions.toString()}
                  label="Missions"
                  color="bg-purple-500/20 text-purple-400"
                />
                <StatCard
                  icon={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                  value={flightStats.lastFlightDate ? new Date(flightStats.lastFlightDate).toLocaleDateString() : 'Never'}
                  label="Last Flight"
                  color="bg-amber-500/20 text-amber-400"
                />
              </div>
            </section>

            {/* Tips Section */}
            <section className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-xl border border-gray-700/50 p-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Tips & Recommendations</h3>
              <TipsSection vehicle={activeVehicle} />
            </section>
          </div>
        </div>

        {/* ============================================ */}
        {/* SECTION: Configuration */}
        {/* ============================================ */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-5 bg-emerald-500 rounded-full" />
            <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wider">Configuration</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Mission Defaults Section */}
            <section className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-xl border border-gray-700/50 p-5">
              <h2 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Mission Planning Defaults
              </h2>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Safe Alt Buffer
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={missionDefaults.safeAltitudeBuffer}
                      onChange={(e) => updateMissionDefaults({
                        safeAltitudeBuffer: Math.max(0, Number(e.target.value))
                      })}
                      className="w-full px-2 py-1.5 bg-gray-900/50 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                      min="0"
                      max="500"
                    />
                    <span className="text-gray-500 text-xs">m</span>
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1">Above terrain for warnings</div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Waypoint Alt
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={missionDefaults.defaultWaypointAltitude}
                      onChange={(e) => updateMissionDefaults({
                        defaultWaypointAltitude: Math.max(0, Number(e.target.value))
                      })}
                      className="w-full px-2 py-1.5 bg-gray-900/50 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                      min="0"
                      max="10000"
                    />
                    <span className="text-gray-500 text-xs">m</span>
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1">Default for new waypoints</div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Takeoff Alt
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={missionDefaults.defaultTakeoffAltitude}
                      onChange={(e) => updateMissionDefaults({
                        defaultTakeoffAltitude: Math.max(0, Number(e.target.value))
                      })}
                      className="w-full px-2 py-1.5 bg-gray-900/50 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                      min="0"
                      max="1000"
                    />
                    <span className="text-gray-500 text-xs">m</span>
                  </div>
                  <div className="text-[10px] text-gray-600 mt-1">Altitude after launch</div>
                </div>
              </div>
            </section>

            {/* Vehicles Section */}
            <section className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-xl border border-gray-700/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-white flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Vehicle Profiles
                </h2>
                <button
                  onClick={() => {
                    addVehicle({
                      name: `Vehicle ${vehicles.length + 1}`,
                      type: 'copter',
                      frameSize: 127,  // 5" = 127mm
                      weight: 600,
                      batteryCells: 4,
                      batteryCapacity: 1500,
                    });
                  }}
                  className="px-2.5 py-1 bg-emerald-600/80 hover:bg-emerald-500/80 text-white text-xs rounded-lg transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Vehicle
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
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
            </section>
          </div>
        </div>

        {/* ============================================ */}
        {/* SECTION: About */}
        {/* ============================================ */}
        <AboutSection />
      </div>
    </div>
  );
}

function AboutSection() {
  const {
    currentVersion,
    status,
    latestVersion,
    publishedAt,
    downloadProgress,
    bytesDownloaded,
    totalBytes,
    error,
    checkForUpdate,
    downloadUpdate,
    installUpdate,
  } = useUpdateStore();

  const isChecking = status === 'checking';
  const showCheckButton = status === 'idle' || status === 'not-available' || status === 'error';

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1.5 h-5 bg-gray-500 rounded-full" />
        <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wider">About</h2>
      </div>

      <section className="bg-gradient-to-br from-gray-800/60 to-gray-900/60 rounded-xl border border-gray-700/50 p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">ArduDeck</h3>
            <p className="text-sm text-gray-400 mt-0.5">
              v{currentVersion || '...'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/rubenCodeforges/ardudeck"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors"
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
              <span className="px-3 py-1.5 text-xs text-gray-400 flex items-center gap-2">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking...
              </span>
            )}

            {status === 'available' && (
              <button
                onClick={() => downloadUpdate()}
                className="px-3 py-1.5 bg-blue-600/80 hover:bg-blue-500/80 text-white text-xs font-medium rounded-lg transition-colors"
              >
                Download v{latestVersion}
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
        <div className="mt-4 pt-4 border-t border-gray-700/50">
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
                  <p className="text-xs text-gray-400 mt-0.5">
                    Released {new Date(publishedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          )}

          {status === 'downloading' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Downloading v{latestVersion}...</span>
                <span className="tabular-nums">
                  {totalBytes > 0
                    ? `${(bytesDownloaded / (1024 * 1024)).toFixed(1)} / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB`
                    : `${(bytesDownloaded / (1024 * 1024)).toFixed(1)} MB`}
                </span>
              </div>
              <div className="h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
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
 * Frame size input with mm/inches toggle
 * Stores value in mm internally for consistency
 * Common frame sizes: 127mm (5"), 178mm (7"), 254mm (10"), 320mm, 450mm
 */
function FrameSizeInput({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (mm: number | undefined) => void;
}) {
  const [unit, setUnit] = useState<'mm' | 'in'>('mm');

  // Convert stored mm to display value
  const displayValue = value !== undefined
    ? unit === 'mm'
      ? value
      : Math.round(value / 25.4 * 10) / 10  // mm to inches, 1 decimal
    : '';

  // Handle input and convert to mm for storage
  const handleChange = (inputVal: string) => {
    if (inputVal === '') {
      onChange(undefined);
      return;
    }
    const numVal = parseFloat(inputVal);
    if (isNaN(numVal) || numVal < 0) return;

    // Convert to mm for storage
    const mmValue = unit === 'mm' ? Math.round(numVal) : Math.round(numVal * 25.4);
    onChange(mmValue);
  };

  // Common presets for quick selection
  const presets = [
    { mm: 127, label: '5"' },
    { mm: 178, label: '7"' },
    { mm: 254, label: '10"' },
    { mm: 320, label: '320' },
    { mm: 450, label: '450' },
  ];

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">Frame Size (diagonal)</label>
      <div className="flex items-center">
        <input
          type="number"
          value={displayValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={unit === 'mm' ? '450' : '5'}
          min={0}
          step={unit === 'mm' ? 10 : 0.5}
          className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-l-lg border-r-0 text-white text-sm focus:outline-none focus:border-blue-500 focus:z-10"
        />
        <button
          type="button"
          onClick={() => setUnit(unit === 'mm' ? 'in' : 'mm')}
          className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-r-lg text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors min-w-[40px]"
          title="Toggle between mm and inches"
        >
          {unit}
        </button>
      </div>
      {/* Quick presets */}
      <div className="flex gap-1 mt-1.5">
        {presets.map((p) => (
          <button
            key={p.mm}
            type="button"
            onClick={() => onChange(p.mm)}
            className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
              value === p.mm
                ? 'bg-blue-600/50 text-blue-300'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {/* Show conversion */}
      {value !== undefined && value > 0 && (
        <div className="text-[10px] text-gray-500 mt-1">
          {unit === 'mm'
            ? `≈ ${(value / 25.4).toFixed(1)}" prop diagonal`
            : `= ${value}mm motor-to-motor`
          }
        </div>
      )}
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
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
        />
        {unit && <span className="text-gray-500 text-sm w-8">{unit}</span>}
      </div>
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
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
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
  const isCopter = vehicle.type === 'copter';
  const isPlane = vehicle.type === 'plane';
  const isVtol = vehicle.type === 'vtol';
  const isRover = vehicle.type === 'rover';
  const isBoat = vehicle.type === 'boat';
  const isSub = vehicle.type === 'sub';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg mx-4 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 text-blue-400">
              {VEHICLE_ICONS[vehicle.type]}
            </div>
            <h2 className="text-lg font-semibold text-white">Edit {VEHICLE_TYPE_NAMES[vehicle.type]}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
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
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Vehicle Name</label>
              <input
                type="text"
                value={vehicle.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder="My Vehicle"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Vehicle Type</label>
              <select
                value={vehicle.type}
                onChange={(e) => onUpdate({ type: e.target.value as VehicleType })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                {Object.entries(VEHICLE_TYPE_NAMES).map(([key, name]) => (
                  <option key={key} value={key}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ========== COPTER-SPECIFIC ========== */}
          {isCopter && (
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Airframe
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <FrameSizeInput
                  value={vehicle.frameSize}
                  onChange={(mm) => onUpdate({ frameSize: mm })}
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
                <VehicleInputField
                  label="All-Up Weight"
                  value={vehicle.weight}
                  onChange={(v) => onUpdate({ weight: Math.max(0, Number(v)) })}
                  unit="g"
                  placeholder="600"
                />
                <VehicleInputField
                  label="Prop Size"
                  value={vehicle.propSize}
                  onChange={(v) => onUpdate({ propSize: v || undefined })}
                  type="text"
                  placeholder="5x4.5"
                />
              </div>
            </div>
          )}

          {/* ========== PLANE-SPECIFIC ========== */}
          {isPlane && (
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Airframe
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <VehicleInputField
                  label="Wingspan"
                  value={vehicle.wingspan}
                  onChange={(v) => onUpdate({ wingspan: Math.max(0, Number(v)) })}
                  unit="mm"
                  placeholder="1200"
                />
                <VehicleInputField
                  label="Wing Area"
                  value={vehicle.wingArea}
                  onChange={(v) => onUpdate({ wingArea: v ? Number(v) : undefined })}
                  unit="cm²"
                  placeholder="2400"
                />
                <VehicleInputField
                  label="All-Up Weight"
                  value={vehicle.weight}
                  onChange={(v) => onUpdate({ weight: Math.max(0, Number(v)) })}
                  unit="g"
                  placeholder="1500"
                />
                <VehicleInputField
                  label="Stall Speed (if known)"
                  value={vehicle.stallSpeed}
                  onChange={(v) => onUpdate({ stallSpeed: v ? Number(v) : undefined })}
                  unit="m/s"
                  placeholder="8"
                />
              </div>
            </div>
          )}

          {/* ========== VTOL-SPECIFIC ========== */}
          {isVtol && (
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                VTOL Airframe
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <VehicleInputField
                  label="Wingspan"
                  value={vehicle.wingspan}
                  onChange={(v) => onUpdate({ wingspan: Math.max(0, Number(v)) })}
                  unit="mm"
                  placeholder="1500"
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
                <VehicleInputField
                  label="All-Up Weight"
                  value={vehicle.weight}
                  onChange={(v) => onUpdate({ weight: Math.max(0, Number(v)) })}
                  unit="g"
                  placeholder="3000"
                />
                <VehicleInputField
                  label="Transition Speed"
                  value={vehicle.transitionSpeed}
                  onChange={(v) => onUpdate({ transitionSpeed: v ? Number(v) : undefined })}
                  unit="m/s"
                  placeholder="15"
                />
              </div>
            </div>
          )}

          {/* ========== ROVER-SPECIFIC ========== */}
          {isRover && (
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
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
                <VehicleInputField
                  label="Total Weight"
                  value={vehicle.weight}
                  onChange={(v) => onUpdate({ weight: Math.max(0, Number(v)) })}
                  unit="g"
                  placeholder="2000"
                />
                <VehicleInputField
                  label="Wheelbase"
                  value={vehicle.wheelbase}
                  onChange={(v) => onUpdate({ wheelbase: v ? Number(v) : undefined })}
                  unit="mm"
                  placeholder="300"
                />
                <VehicleInputField
                  label="Wheel Diameter"
                  value={vehicle.wheelDiameter}
                  onChange={(v) => onUpdate({ wheelDiameter: v ? Number(v) : undefined })}
                  unit="mm"
                  placeholder="100"
                />
                <VehicleInputField
                  label="Max Speed (if known)"
                  value={vehicle.maxSpeed}
                  onChange={(v) => onUpdate({ maxSpeed: v ? Number(v) : undefined })}
                  unit="m/s"
                  placeholder="5"
                />
              </div>
            </div>
          )}

          {/* ========== BOAT-SPECIFIC ========== */}
          {isBoat && (
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
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
                <VehicleInputField
                  label="Hull Length"
                  value={vehicle.hullLength}
                  onChange={(v) => onUpdate({ hullLength: v ? Number(v) : undefined })}
                  unit="mm"
                  placeholder="600"
                />
                <VehicleInputField
                  label="Total Weight"
                  value={vehicle.weight}
                  onChange={(v) => onUpdate({ weight: Math.max(0, Number(v)) })}
                  unit="g"
                  placeholder="3000"
                />
                <VehicleInputField
                  label="Displacement"
                  value={vehicle.displacement}
                  onChange={(v) => onUpdate({ displacement: v ? Number(v) : undefined })}
                  unit="g"
                  placeholder="3500"
                />
                <VehicleInputField
                  label="Max Speed (if known)"
                  value={vehicle.maxSpeed}
                  onChange={(v) => onUpdate({ maxSpeed: v ? Number(v) : undefined })}
                  unit="m/s"
                  placeholder="3"
                />
              </div>
            </div>
          )}

          {/* ========== SUB-SPECIFIC ========== */}
          {isSub && (
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Hull & Thrusters
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <VehicleInputField
                  label="Hull Length"
                  value={vehicle.hullLength}
                  onChange={(v) => onUpdate({ hullLength: v ? Number(v) : undefined })}
                  unit="mm"
                  placeholder="500"
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
                <VehicleInputField
                  label="Total Weight (dry)"
                  value={vehicle.weight}
                  onChange={(v) => onUpdate({ weight: Math.max(0, Number(v)) })}
                  unit="g"
                  placeholder="5000"
                />
                <VehicleInputField
                  label="Max Depth Rating"
                  value={vehicle.maxDepth}
                  onChange={(v) => onUpdate({ maxDepth: v ? Number(v) : undefined })}
                  unit="m"
                  placeholder="100"
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
                <VehicleInputField
                  label="Max Speed (if known)"
                  value={vehicle.maxSpeed}
                  onChange={(v) => onUpdate({ maxSpeed: v ? Number(v) : undefined })}
                  unit="m/s"
                  placeholder="2"
                />
              </div>
            </div>
          )}

          {/* Battery - Common to all */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Battery
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <VehicleSelectField
                label="Cell Count"
                value={vehicle.batteryCells || 4}
                onChange={(v) => onUpdate({ batteryCells: Number(v) })}
                options={[
                  { value: 2, label: '2S (7.4V)' },
                  { value: 3, label: '3S (11.1V)' },
                  { value: 4, label: '4S (14.8V)' },
                  { value: 5, label: '5S (18.5V)' },
                  { value: 6, label: '6S (22.2V)' },
                  { value: 8, label: '8S (29.6V)' },
                  { value: 12, label: '12S (44.4V)' },
                  { value: 14, label: '14S (51.8V)' },
                ]}
              />
              <VehicleInputField
                label="Capacity"
                value={vehicle.batteryCapacity}
                onChange={(v) => onUpdate({ batteryCapacity: Math.max(0, Number(v)) })}
                unit="mAh"
                placeholder="1500"
              />
            </div>
          </div>

          {/* Advanced - Vehicle-type specific */}
          <details className="group">
            <summary className="text-sm font-medium text-gray-500 cursor-pointer hover:text-gray-300 flex items-center gap-2">
              <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Advanced (optional)
            </summary>
            <div className="mt-3 space-y-3">
              {/* Copter Advanced */}
              {isCopter && (
                <div className="grid grid-cols-3 gap-3">
                  <VehicleInputField
                    label="Motor KV"
                    value={vehicle.motorKv}
                    onChange={(v) => onUpdate({ motorKv: v ? Number(v) : undefined })}
                    placeholder="2400"
                  />
                  <VehicleInputField
                    label="ESC Rating"
                    value={vehicle.escRating}
                    onChange={(v) => onUpdate({ escRating: v ? Number(v) : undefined })}
                    unit="A"
                    placeholder="30"
                  />
                  <VehicleInputField
                    label="Battery C-Rating"
                    value={vehicle.batteryDischarge}
                    onChange={(v) => onUpdate({ batteryDischarge: v ? Number(v) : undefined })}
                    unit="C"
                    placeholder="75"
                  />
                </div>
              )}

              {/* Plane/VTOL Advanced */}
              {(isPlane || isVtol) && (
                <div className="grid grid-cols-3 gap-3">
                  <VehicleInputField
                    label="Motor KV"
                    value={vehicle.motorKv}
                    onChange={(v) => onUpdate({ motorKv: v ? Number(v) : undefined })}
                    placeholder="1000"
                  />
                  <VehicleInputField
                    label="ESC Rating"
                    value={vehicle.escRating}
                    onChange={(v) => onUpdate({ escRating: v ? Number(v) : undefined })}
                    unit="A"
                    placeholder="40"
                  />
                  <VehicleInputField
                    label="Prop Size"
                    value={vehicle.propSize}
                    onChange={(v) => onUpdate({ propSize: v || undefined })}
                    type="text"
                    placeholder="10x6"
                  />
                </div>
              )}

              {/* Rover/Boat/Sub Advanced - Common motor info */}
              {(isRover || isBoat || isSub) && (
                <div className="grid grid-cols-2 gap-3">
                  <VehicleInputField
                    label="Motor KV"
                    value={vehicle.motorKv}
                    onChange={(v) => onUpdate({ motorKv: v ? Number(v) : undefined })}
                    placeholder="1200"
                  />
                  <VehicleInputField
                    label="ESC Rating"
                    value={vehicle.escRating}
                    onChange={(v) => onUpdate({ escRating: v ? Number(v) : undefined })}
                    unit="A"
                    placeholder="30"
                  />
                </div>
              )}

              {/* Notes - Common to all */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Notes</label>
                <textarea
                  value={vehicle.notes || ''}
                  onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
                  placeholder="Additional notes about this vehicle..."
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>
          </details>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
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
  // Build vehicle-specific info string
  const getVehicleSpecs = () => {
    const parts: string[] = [];
    const batteryStr = `${vehicle.batteryCells}S ${vehicle.batteryCapacity}mAh`;

    switch (vehicle.type) {
      case 'copter':
        if (vehicle.frameSize) parts.push(`${vehicle.frameSize}mm`);
        if (vehicle.motorCount) {
          const motorNames: Record<number, string> = { 3: 'Tri', 4: 'Quad', 6: 'Hex', 8: 'Octo' };
          parts.push(motorNames[vehicle.motorCount] || `${vehicle.motorCount}M`);
        }
        parts.push(batteryStr);
        parts.push(`${vehicle.weight}g`);
        break;
      case 'plane':
        if (vehicle.wingspan) parts.push(`${vehicle.wingspan}mm span`);
        parts.push(batteryStr);
        parts.push(`${vehicle.weight}g`);
        break;
      case 'vtol':
        if (vehicle.wingspan) parts.push(`${vehicle.wingspan}mm`);
        if (vehicle.vtolMotorCount) parts.push(`${vehicle.vtolMotorCount} VTOL motors`);
        parts.push(batteryStr);
        break;
      case 'rover':
        if (vehicle.driveType) {
          const driveNames: Record<string, string> = { differential: 'Tank', ackermann: 'Car', skid: 'Skid' };
          parts.push(driveNames[vehicle.driveType] || vehicle.driveType);
        }
        if (vehicle.wheelDiameter) parts.push(`${vehicle.wheelDiameter}mm wheels`);
        parts.push(batteryStr);
        break;
      case 'boat':
        if (vehicle.hullType) {
          parts.push(vehicle.hullType.charAt(0).toUpperCase() + vehicle.hullType.slice(1));
        }
        if (vehicle.hullLength) parts.push(`${vehicle.hullLength}mm`);
        parts.push(batteryStr);
        break;
      case 'sub':
        if (vehicle.thrusterCount) parts.push(`${vehicle.thrusterCount}T`);
        if (vehicle.maxDepth) parts.push(`${vehicle.maxDepth}m rated`);
        parts.push(batteryStr);
        break;
      default:
        parts.push(batteryStr);
        parts.push(`${vehicle.weight}g`);
    }

    return parts.join(' • ');
  };

  return (
    <>
      {isEditing && (
        <VehicleEditModal vehicle={vehicle} onUpdate={onUpdate} onClose={onSave} />
      )}
      <div
        className={`bg-gray-900/50 rounded-lg border p-3 transition-colors cursor-pointer ${
          isActive ? 'border-emerald-500/50 bg-emerald-900/10' : 'border-gray-700/50 hover:border-gray-600/50'
        }`}
        onClick={onSelect}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 ${isActive ? 'text-emerald-400' : 'text-gray-500'}`}>
              {VEHICLE_ICONS[vehicle.type]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-medium text-sm">{vehicle.name}</span>
                {isActive && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">Active</span>
                )}
              </div>
              <div className="text-gray-500 text-xs">
                {getVehicleSpecs()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-white transition-colors" title="Edit">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            {canDelete && (
              <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-400 transition-colors" title="Delete">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
