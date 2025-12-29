import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { AttitudeIndicator } from './AttitudePanel';

// Map layer definitions
const MAP_LAYERS = {
  osm: {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
  },
  terrain: {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17,
  },
  dark: {
    name: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    maxZoom: 19,
  },
} as const;

type LayerKey = keyof typeof MAP_LAYERS;

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate bearing between two points
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

// Calculate point at distance and bearing from origin
function calculateDestination(lat: number, lon: number, bearing: number, distance: number): [number, number] {
  const R = 6371000;
  const bearingRad = bearing * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;

  const lat2 = Math.asin(
    Math.sin(latRad) * Math.cos(distance / R) +
    Math.cos(latRad) * Math.sin(distance / R) * Math.cos(bearingRad)
  );
  const lon2 = lonRad + Math.atan2(
    Math.sin(bearingRad) * Math.sin(distance / R) * Math.cos(latRad),
    Math.cos(distance / R) - Math.sin(latRad) * Math.sin(lat2)
  );

  return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}

// Custom vehicle marker icon (arrow pointing in heading direction)
function createVehicleIcon(heading: number, armed: boolean): L.DivIcon {
  const fillColor = armed ? '#f97316' : '#22d3ee'; // Orange when armed, cyan when disarmed
  const strokeColor = armed ? '#7c2d12' : '#0e7490'; // Dark orange / dark cyan outlines

  return L.divIcon({
    className: 'vehicle-marker',
    html: `
      <div style="transform: rotate(${heading}deg); width: 48px; height: 48px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
        <svg viewBox="0 0 24 24">
          <!-- Dark outline for contrast -->
          <path d="M12 2L4 20l8-4 8 4L12 2z" fill="none" stroke="#000" stroke-width="3" stroke-linejoin="round"/>
          <!-- White outline -->
          <path d="M12 2L4 20l8-4 8 4L12 2z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
          <!-- Colored fill -->
          <path d="M12 2L4 20l8-4 8 4L12 2z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1" stroke-linejoin="round"/>
        </svg>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

// Home marker icon
const homeIcon = L.divIcon({
  className: 'home-marker',
  html: `
    <div style="width: 32px; height: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
      <svg viewBox="0 0 24 24">
        <!-- Dark outline for contrast -->
        <path d="M12 2L2 12h3v8h6v-6h2v6h6v-8h3L12 2z" fill="none" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>
        <!-- White outline -->
        <path d="M12 2L2 12h3v8h6v-6h2v6h6v-8h3L12 2z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
        <!-- Green fill -->
        <path d="M12 2L2 12h3v8h6v-6h2v6h6v-8h3L12 2z" fill="#22c55e" stroke="#166534" stroke-width="0.5" stroke-linejoin="round"/>
      </svg>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

// Component to handle map updates and resize
function MapController({
  position,
  followVehicle,
  containerRef,
}: {
  position: [number, number];
  followVehicle: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const map = useMap();

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [map, containerRef]);

  // Follow vehicle
  useEffect(() => {
    if (followVehicle) {
      map.setView(position, map.getZoom(), { animate: true, duration: 0.5 });
    }
  }, [position, followVehicle, map]);

  return null;
}

// Heading line component
function HeadingLine({
  position,
  heading,
  length = 100,
  armed,
}: {
  position: [number, number];
  heading: number;
  length?: number;
  armed: boolean;
}) {
  const endPoint = calculateDestination(position[0], position[1], heading, length);
  const lineColor = armed ? '#f97316' : '#22d3ee'; // Match vehicle colors

  return (
    <>
      {/* Dark outline for contrast */}
      <Polyline
        positions={[position, endPoint]}
        pathOptions={{
          color: '#000',
          weight: 6,
          opacity: 0.6,
        }}
      />
      {/* White outline */}
      <Polyline
        positions={[position, endPoint]}
        pathOptions={{
          color: '#fff',
          weight: 4,
          opacity: 0.9,
        }}
      />
      {/* Main colored line */}
      <Polyline
        positions={[position, endPoint]}
        pathOptions={{
          color: lineColor,
          weight: 3,
          opacity: 1,
        }}
      />
    </>
  );
}

// Home line component (line from vehicle to home)
function HomeLine({
  vehiclePosition,
  homePosition,
}: {
  vehiclePosition: [number, number];
  homePosition: [number, number];
}) {
  return (
    <Polyline
      positions={[vehiclePosition, homePosition]}
      pathOptions={{
        color: '#10b981',
        weight: 1,
        opacity: 0.5,
        dashArray: '3, 6',
      }}
    />
  );
}

// Layer switcher component
function LayerSwitcher({
  currentLayer,
  onLayerChange,
}: {
  currentLayer: LayerKey;
  onLayerChange: (layer: LayerKey) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-1 text-xs rounded bg-gray-800/90 text-gray-300 hover:bg-gray-700/90 shadow-lg transition-colors flex items-center gap-1"
        title="Change map layer"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        {MAP_LAYERS[currentLayer].name}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700/50 rounded shadow-xl z-[1000] py-1 min-w-[100px]">
            {(Object.keys(MAP_LAYERS) as LayerKey[]).map((key) => (
              <button
                key={key}
                onClick={() => {
                  onLayerChange(key);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                  currentLayer === key
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700/50'
                }`}
              >
                {MAP_LAYERS[key].name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Compass overlay
function CompassOverlay({ heading }: { heading: number }) {
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000]">
      <div className="relative w-16 h-16">
        {/* Compass ring */}
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle cx="50" cy="50" r="45" fill="rgba(17, 24, 39, 0.8)" stroke="#374151" strokeWidth="2" />
          {/* Cardinal directions */}
          <text x="50" y="18" textAnchor="middle" fill="#f3f4f6" fontSize="12" fontWeight="bold">N</text>
          <text x="85" y="54" textAnchor="middle" fill="#9ca3af" fontSize="10">E</text>
          <text x="50" y="90" textAnchor="middle" fill="#9ca3af" fontSize="10">S</text>
          <text x="15" y="54" textAnchor="middle" fill="#9ca3af" fontSize="10">W</text>
          {/* Tick marks */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line
              key={deg}
              x1="50"
              y1="8"
              x2="50"
              y2={deg % 90 === 0 ? "14" : "11"}
              stroke={deg === 0 ? "#ef4444" : "#6b7280"}
              strokeWidth={deg % 90 === 0 ? "2" : "1"}
              transform={`rotate(${deg} 50 50)`}
            />
          ))}
          {/* Heading indicator (aircraft nose) */}
          <g transform={`rotate(${heading} 50 50)`}>
            <polygon points="50,20 45,35 55,35" fill="#3b82f6" stroke="white" strokeWidth="0.5" />
          </g>
        </svg>
        {/* Digital heading */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white text-xs font-mono font-bold">{Math.round(heading)}°</span>
        </div>
      </div>
    </div>
  );
}

// Format distance for display
function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(2)}km`;
}

export function MapPanel() {
  const { gps, position, vfrHud, flight, attitude } = useTelemetryStore();
  const [followVehicle, setFollowVehicle] = useState(true);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [homePosition, setHomePosition] = useState<[number, number] | null>(null);
  const [currentLayer, setCurrentLayer] = useState<LayerKey>('osm');
  const [showHeadingLine, setShowHeadingLine] = useState(true);
  const [showCompass, setShowCompass] = useState(true);
  const [showAttitude, setShowAttitude] = useState(true);
  const [headingLineLength, setHeadingLineLength] = useState(100); // meters
  const lastUpdateRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Default position (London) - used when no GPS
  const defaultPosition: [number, number] = [51.505, -0.09];

  // Get current position from GPS data
  const hasValidGps = gps.fixType >= 2 && gps.lat !== 0 && gps.lon !== 0;
  const gpsPosition: [number, number] | null = hasValidGps
    ? [gps.lat, gps.lon]
    : null;

  // Vehicle display position - use GPS if available, otherwise use default or last known
  const vehiclePosition: [number, number] = gpsPosition || homePosition || defaultPosition;

  // Calculate distance and bearing to home
  const homeStats = useMemo(() => {
    if (!homePosition) return null;
    const distance = calculateDistance(
      vehiclePosition[0], vehiclePosition[1],
      homePosition[0], homePosition[1]
    );
    const bearing = calculateBearing(
      vehiclePosition[0], vehiclePosition[1],
      homePosition[0], homePosition[1]
    );
    return { distance, bearing };
  }, [vehiclePosition, homePosition]);

  // Update trail with position history (only when GPS is valid)
  useEffect(() => {
    if (gpsPosition && hasValidGps) {
      const now = Date.now();
      if (now - lastUpdateRef.current > 500) {
        lastUpdateRef.current = now;
        setTrail(prev => {
          const newTrail = [...prev, gpsPosition];
          if (newTrail.length > 500) {
            return newTrail.slice(-500);
          }
          return newTrail;
        });

        if (!homePosition) {
          setHomePosition(gpsPosition);
        }
      }
    }
  }, [gpsPosition, hasValidGps, homePosition]);

  const clearTrail = useCallback(() => {
    setTrail([]);
  }, []);

  const setHome = useCallback(() => {
    if (gpsPosition) {
      setHomePosition(gpsPosition);
    }
  }, [gpsPosition]);

  const layer = MAP_LAYERS[currentLayer];

  return (
    <div ref={containerRef} className="h-full w-full flex flex-col bg-gray-900 relative">
      {/* Top toolbar */}
      <div className="absolute top-2 right-2 z-[1000] flex flex-col gap-1">
        <LayerSwitcher currentLayer={currentLayer} onLayerChange={setCurrentLayer} />
        <button
          onClick={() => setFollowVehicle(!followVehicle)}
          className={`px-2 py-1 text-xs rounded shadow-lg transition-colors ${
            followVehicle
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
          }`}
          title={followVehicle ? 'Following vehicle' : 'Free camera'}
        >
          {followVehicle ? 'Following' : 'Free'}
        </button>
        <button
          onClick={() => setShowHeadingLine(!showHeadingLine)}
          className={`px-2 py-1 text-xs rounded shadow-lg transition-colors ${
            showHeadingLine
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
          }`}
          title="Toggle heading line"
        >
          HDG Line
        </button>
        <button
          onClick={() => setShowCompass(!showCompass)}
          className={`px-2 py-1 text-xs rounded shadow-lg transition-colors ${
            showCompass
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
          }`}
          title="Toggle compass"
        >
          Compass
        </button>
        <button
          onClick={() => setShowAttitude(!showAttitude)}
          className={`px-2 py-1 text-xs rounded shadow-lg transition-colors ${
            showAttitude
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
          }`}
          title="Toggle attitude indicator"
        >
          Attitude
        </button>
        <button
          onClick={clearTrail}
          className="px-2 py-1 text-xs rounded bg-gray-800/90 text-gray-300 hover:bg-gray-700/90 shadow-lg transition-colors"
          title="Clear flight trail"
        >
          Clear Trail
        </button>
        <button
          onClick={setHome}
          disabled={!hasValidGps}
          className="px-2 py-1 text-xs rounded bg-gray-800/90 text-gray-300 hover:bg-gray-700/90 shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Set home to current position"
        >
          Set Home
        </button>
      </div>

      {/* Compass overlay */}
      {showCompass && <CompassOverlay heading={vfrHud.heading} />}

      {/* Attitude indicator overlay (nav ball) */}
      {showAttitude && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000]">
          {/* Dark background circle */}
          <div className="absolute inset-[-4px] rounded-full bg-gray-900/80 shadow-xl" />
          <div className="relative">
            <AttitudeIndicator
              roll={attitude.roll}
              pitch={attitude.pitch}
              heading={vfrHud.heading}
              size={140}
            />
          </div>
        </div>
      )}

      {/* GPS status overlay */}
      {!hasValidGps && (
        <div className="absolute top-2 left-2 z-[1000] px-2 py-1 bg-yellow-600/90 text-white text-xs rounded shadow-lg">
          No GPS fix
        </div>
      )}

      {/* Stats overlay */}
      <div className="absolute bottom-2 left-2 z-[1000] bg-gray-900/90 backdrop-blur-sm rounded px-3 py-2 text-xs text-gray-300 space-y-1 min-w-[130px]">
        <div className="flex justify-between">
          <span className="text-gray-500">Alt</span>
          <span className="font-mono text-white">{position.relativeAlt.toFixed(1)}<span className="text-gray-500 ml-0.5">m</span></span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Spd</span>
          <span className="font-mono text-white">{vfrHud.groundspeed.toFixed(1)}<span className="text-gray-500 ml-0.5">m/s</span></span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Hdg</span>
          <span className="font-mono text-white">{vfrHud.heading.toFixed(0)}<span className="text-gray-500 ml-0.5">°</span></span>
        </div>
        {homeStats && (
          <>
            <div className="border-t border-gray-700 my-1" />
            <div className="flex justify-between">
              <span className="text-gray-500">Home</span>
              <span className="font-mono text-emerald-400">{formatDistance(homeStats.distance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Brng</span>
              <span className="font-mono text-emerald-400">{homeStats.bearing.toFixed(0)}<span className="text-gray-500 ml-0.5">°</span></span>
            </div>
          </>
        )}
        {hasValidGps && (
          <>
            <div className="border-t border-gray-700 my-1" />
            <div className="text-[10px] text-gray-500 font-mono">
              {gps.lat.toFixed(6)}, {gps.lon.toFixed(6)}
            </div>
          </>
        )}
      </div>

      {/* Armed status indicator */}
      <div className={`absolute bottom-2 right-2 z-[1000] px-2 py-1 rounded shadow-lg text-xs font-bold ${
        flight.armed ? 'bg-red-600 text-white' : 'bg-gray-800/90 text-gray-400'
      }`}>
        {flight.armed ? 'ARMED' : 'DISARMED'}
      </div>

      {/* Map container */}
      <MapContainer
        center={vehiclePosition}
        zoom={17}
        className="h-full w-full"
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          key={currentLayer}
          url={layer.url}
          maxZoom={layer.maxZoom}
        />

        {/* Map controller for resize handling and following */}
        <MapController
          position={vehiclePosition}
          followVehicle={followVehicle}
          containerRef={containerRef}
        />

        {/* Flight trail */}
        {trail.length > 1 && (
          <>
            {/* Dark outline for contrast */}
            <Polyline
              positions={trail}
              pathOptions={{
                color: '#000',
                weight: 5,
                opacity: 0.4,
              }}
            />
            {/* Main trail */}
            <Polyline
              positions={trail}
              pathOptions={{
                color: '#a855f7', // Purple for trail
                weight: 3,
                opacity: 0.9,
              }}
            />
          </>
        )}

        {/* Home to vehicle line */}
        {homePosition && homeStats && homeStats.distance > 5 && (
          <HomeLine vehiclePosition={vehiclePosition} homePosition={homePosition} />
        )}

        {/* Heading line */}
        {showHeadingLine && (
          <HeadingLine
            position={vehiclePosition}
            heading={vfrHud.heading}
            length={headingLineLength}
            armed={flight.armed}
          />
        )}

        {/* Home marker */}
        {homePosition && (
          <Marker position={homePosition} icon={homeIcon} />
        )}

        {/* Vehicle marker - always show */}
        <Marker
          position={vehiclePosition}
          icon={createVehicleIcon(vfrHud.heading, flight.armed)}
        />
      </MapContainer>
    </div>
  );
}
