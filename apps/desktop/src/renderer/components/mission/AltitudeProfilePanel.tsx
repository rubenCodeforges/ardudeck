import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useMissionStore } from '../../stores/mission-store';
import { useSettingsStore } from '../../stores/settings-store';
import { commandHasLocation, MAV_CMD, type MissionItem } from '../../../shared/mission-types';
import { getElevations, interpolatePathPoints } from '../../utils/elevation-api';

// Terrain data point
interface TerrainPoint {
  distance: number;
  elevation: number;
}

// Calculate distance between two coordinates using Haversine formula
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Get color for waypoint based on command type
function getWaypointColor(cmd: number): string {
  switch (cmd) {
    case MAV_CMD.NAV_TAKEOFF:
      return '#22c55e'; // Green
    case MAV_CMD.NAV_LAND:
      return '#ef4444'; // Red
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      return '#f97316'; // Orange
    case MAV_CMD.NAV_LOITER_UNLIM:
    case MAV_CMD.NAV_LOITER_TIME:
    case MAV_CMD.NAV_LOITER_TURNS:
      return '#a855f7'; // Purple
    case MAV_CMD.NAV_SPLINE_WAYPOINT:
      return '#06b6d4'; // Cyan
    default:
      return '#3b82f6'; // Blue
  }
}

interface ProfilePoint {
  wp: MissionItem;
  distance: number; // Cumulative distance in meters
  altitude: number;
}

interface AltitudeProfilePanelProps {
  readOnly?: boolean;
}

export function AltitudeProfilePanel({ readOnly = false }: AltitudeProfilePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 150 });

  // Drag state (disabled in readOnly mode)
  const [draggingSeq, setDraggingSeq] = useState<number | null>(null);
  const [dragAltitude, setDragAltitude] = useState<number | null>(null);

  // Terrain state
  const [terrainData, setTerrainData] = useState<TerrainPoint[]>([]);
  const [terrainLoading, setTerrainLoading] = useState(false);
  const [waypointElevations, setWaypointElevations] = useState<Map<number, number>>(new Map());

  const { missionItems, selectedSeq, currentSeq, setSelectedSeq, updateWaypoint, setHasTerrainCollisions } = useMissionStore();
  const { missionDefaults } = useSettingsStore();
  const safeAltitudeBuffer = missionDefaults.safeAltitudeBuffer;

  // Filter to only items with locations
  const waypoints = useMemo(
    () => missionItems.filter(item => commandHasLocation(item.command)),
    [missionItems]
  );

  // Calculate cumulative distances and build profile points
  const profileData = useMemo((): ProfilePoint[] => {
    if (waypoints.length === 0) return [];

    const points: ProfilePoint[] = [];
    let cumulativeDistance = 0;

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];

      if (i > 0) {
        const prev = waypoints[i - 1];
        const segmentDist = haversineDistance(
          prev.latitude,
          prev.longitude,
          wp.latitude,
          wp.longitude
        );
        cumulativeDistance += segmentDist;
      }

      points.push({
        wp,
        distance: cumulativeDistance,
        altitude: wp.altitude,
      });
    }

    return points;
  }, [waypoints]);

  // Fetch terrain data when waypoints change
  useEffect(() => {
    if (waypoints.length < 2) {
      setTerrainData([]);
      setWaypointElevations(new Map());
      return;
    }

    const fetchTerrain = async () => {
      setTerrainLoading(true);

      try {
        // Interpolate points along the path for terrain sampling
        const pathPoints = interpolatePathPoints(
          waypoints.map(wp => ({ lat: wp.latitude, lon: wp.longitude })),
          40 // Number of terrain samples
        );

        // Also get elevation at each waypoint
        const allPoints = [
          ...pathPoints.map(p => ({ lat: p.lat, lon: p.lon })),
          ...waypoints.map(wp => ({ lat: wp.latitude, lon: wp.longitude })),
        ];

        const elevations = await getElevations(allPoints);

        // Split results
        const terrainElevations = elevations.slice(0, pathPoints.length);
        const wpElevations = elevations.slice(pathPoints.length);

        // Build terrain data
        const terrain: TerrainPoint[] = pathPoints
          .map((p, i) => ({
            distance: p.distance,
            elevation: terrainElevations[i] ?? 0,
          }))
          .filter(t => t.elevation !== null);

        setTerrainData(terrain);

        // Build waypoint elevations map
        const wpElevMap = new Map<number, number>();
        waypoints.forEach((wp, i) => {
          const elev = wpElevations[i];
          if (elev !== null && elev !== undefined) {
            wpElevMap.set(wp.seq, elev);
          }
        });
        setWaypointElevations(wpElevMap);
      } catch (error) {
        console.warn('Failed to fetch terrain data:', error);
      } finally {
        setTerrainLoading(false);
      }
    };

    // Debounce terrain fetch
    const timeoutId = setTimeout(fetchTerrain, 500);
    return () => clearTimeout(timeoutId);
  }, [waypoints]);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Chart margins and dimensions
  const margin = { top: 20, right: 40, bottom: 30, left: 50 };
  const chartWidth = Math.max(100, dimensions.width - margin.left - margin.right);
  const chartHeight = Math.max(50, dimensions.height - margin.top - margin.bottom);

  // Calculate scales (including terrain in range)
  const { xScale, yScale, yScaleInverse, xTicks, yTicks, minAlt, maxAlt } = useMemo(() => {
    if (profileData.length === 0) {
      return {
        xScale: (_: number) => 0,
        yScale: (_: number) => chartHeight,
        yScaleInverse: (_: number) => 0,
        xTicks: [],
        yTicks: [],
        minAlt: 0,
        maxAlt: 100,
      };
    }

    const maxDistance = Math.max(...profileData.map(p => p.distance), 100);
    const flightAltitudes = profileData.map(p => p.altitude);
    const terrainAltitudes = terrainData.map(t => t.elevation);

    // Include both flight path and terrain in altitude range
    const allAltitudes = [...flightAltitudes, ...terrainAltitudes];
    const minAltVal = Math.min(...allAltitudes, 0);
    const maxAltVal = Math.max(...allAltitudes, 100);
    const altPadding = (maxAltVal - minAltVal) * 0.1 || 10;
    const yRange = maxAltVal - minAltVal + 2 * altPadding;

    const xScaleFn = (d: number) => (d / maxDistance) * chartWidth;
    const yScaleFn = (alt: number) =>
      chartHeight - ((alt - (minAltVal - altPadding)) / yRange) * chartHeight;

    // Inverse scale: convert Y position back to altitude
    const yScaleInverseFn = (y: number) =>
      (minAltVal - altPadding) + ((chartHeight - y) / chartHeight) * yRange;

    // Generate tick values
    const xTickCount = Math.min(5, Math.floor(chartWidth / 80));
    const yTickCount = Math.min(5, Math.floor(chartHeight / 30));

    const xTickVals: number[] = [];
    for (let i = 0; i <= xTickCount; i++) {
      xTickVals.push((maxDistance / xTickCount) * i);
    }

    const yTickVals: number[] = [];
    for (let i = 0; i <= yTickCount; i++) {
      yTickVals.push(minAltVal - altPadding + (yRange / yTickCount) * i);
    }

    return {
      xScale: xScaleFn,
      yScale: yScaleFn,
      yScaleInverse: yScaleInverseFn,
      xTicks: xTickVals,
      yTicks: yTickVals,
      minAlt: minAltVal - altPadding,
      maxAlt: maxAltVal + altPadding,
    };
  }, [profileData, terrainData, chartWidth, chartHeight]);

  // Get display altitude for a point (use drag altitude if dragging this point)
  const getDisplayAltitude = useCallback((p: ProfilePoint): number => {
    if (draggingSeq === p.wp.seq && dragAltitude !== null) {
      return dragAltitude;
    }
    return p.altitude;
  }, [draggingSeq, dragAltitude]);

  // Build path for the altitude line (updates during drag)
  const pathD = useMemo(() => {
    if (profileData.length < 2) return '';

    return profileData
      .map((p, i) => {
        const x = xScale(p.distance);
        const y = yScale(getDisplayAltitude(p));
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [profileData, xScale, yScale, getDisplayAltitude]);

  // Build area path (filled area under the line)
  const areaD = useMemo(() => {
    if (profileData.length < 2) return '';

    const linePath = profileData
      .map((p, i) => {
        const x = xScale(p.distance);
        const y = yScale(getDisplayAltitude(p));
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

    const lastX = xScale(profileData[profileData.length - 1].distance);
    const firstX = xScale(profileData[0].distance);
    const bottomY = chartHeight;

    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [profileData, xScale, yScale, chartHeight, getDisplayAltitude]);

  // Build terrain profile path (filled area)
  const terrainPathD = useMemo(() => {
    if (terrainData.length < 2) return '';

    const linePath = terrainData
      .map((t, i) => {
        const x = xScale(t.distance);
        const y = yScale(t.elevation);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

    const lastX = xScale(terrainData[terrainData.length - 1].distance);
    const firstX = xScale(terrainData[0].distance);
    const bottomY = chartHeight;

    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [terrainData, xScale, yScale, chartHeight]);

  // Build safe altitude line path (terrain + buffer)
  const safeAltitudePathD = useMemo(() => {
    if (terrainData.length < 2) return '';

    return terrainData
      .map((t, i) => {
        const x = xScale(t.distance);
        const y = yScale(t.elevation + safeAltitudeBuffer);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [terrainData, xScale, yScale]);

  // Helper to get terrain elevation at a distance (interpolated)
  const getTerrainAtDistance = useCallback((dist: number): number => {
    if (terrainData.length === 0) return 0;
    if (dist <= terrainData[0].distance) return terrainData[0].elevation;
    if (dist >= terrainData[terrainData.length - 1].distance) {
      return terrainData[terrainData.length - 1].elevation;
    }

    for (let j = 0; j < terrainData.length - 1; j++) {
      if (terrainData[j].distance <= dist && terrainData[j + 1].distance >= dist) {
        const t = (dist - terrainData[j].distance) / (terrainData[j + 1].distance - terrainData[j].distance);
        return terrainData[j].elevation + t * (terrainData[j + 1].elevation - terrainData[j].elevation);
      }
    }
    return terrainData[terrainData.length - 1].elevation;
  }, [terrainData]);

  // Check for collision segments (where flight path intersects terrain)
  // Sample along the path, not just at waypoints
  const collisionSegments = useMemo(() => {
    if (terrainData.length === 0 || profileData.length < 2) return [];

    const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

    // Check each flight path segment against terrain with fine sampling
    for (let i = 0; i < profileData.length - 1; i++) {
      const p1 = profileData[i];
      const p2 = profileData[i + 1];
      const alt1 = getDisplayAltitude(p1);
      const alt2 = getDisplayAltitude(p2);
      const dist1 = p1.distance;
      const dist2 = p2.distance;

      // Sample along this segment
      const numSamples = 20;
      let inCollision = false;
      let collisionStartX = 0;
      let collisionStartY = 0;

      for (let s = 0; s <= numSamples; s++) {
        const t = s / numSamples;
        const dist = dist1 + t * (dist2 - dist1);
        const flightAlt = alt1 + t * (alt2 - alt1);
        const terrainAlt = getTerrainAtDistance(dist);
        const safeAlt = terrainAlt + safeAltitudeBuffer;

        const isColliding = flightAlt < safeAlt;

        if (isColliding && !inCollision) {
          // Start of collision segment
          inCollision = true;
          collisionStartX = xScale(dist);
          collisionStartY = yScale(flightAlt);
        } else if (!isColliding && inCollision) {
          // End of collision segment
          inCollision = false;
          segments.push({
            x1: collisionStartX,
            y1: collisionStartY,
            x2: xScale(dist),
            y2: yScale(flightAlt),
          });
        }
      }

      // If still in collision at end of segment, close it
      if (inCollision) {
        segments.push({
          x1: collisionStartX,
          y1: collisionStartY,
          x2: xScale(dist2),
          y2: yScale(alt2),
        });
      }
    }

    return segments;
  }, [profileData, terrainData, xScale, yScale, getDisplayAltitude, getTerrainAtDistance]);

  // Update store with collision status
  useEffect(() => {
    const hasCollisions = collisionSegments.length > 0;
    setHasTerrainCollisions(hasCollisions);
  }, [collisionSegments.length, setHasTerrainCollisions]);

  // Get mouse Y position relative to chart area
  const getChartY = useCallback((e: MouseEvent | React.MouseEvent): number => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    return e.clientY - rect.top - margin.top;
  }, [margin.top]);

  // Start dragging a waypoint (disabled in readOnly mode)
  const handleDragStart = useCallback((seq: number, e: React.MouseEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingSeq(seq);
    setSelectedSeq(seq);

    const wp = waypoints.find(w => w.seq === seq);
    if (wp) {
      setDragAltitude(wp.altitude);
    }
  }, [waypoints, setSelectedSeq, readOnly]);

  // Handle mouse move during drag
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingSeq === null) return;

    const y = getChartY(e);
    const newAlt = yScaleInverse(y);
    // Clamp altitude to reasonable range (0-10000m for high-altitude missions)
    const clampedAlt = Math.max(0, Math.min(10000, Math.round(newAlt)));
    setDragAltitude(clampedAlt);
  }, [draggingSeq, getChartY, yScaleInverse]);

  // End drag and commit change
  const handleMouseUp = useCallback(() => {
    if (draggingSeq !== null && dragAltitude !== null) {
      updateWaypoint(draggingSeq, { altitude: dragAltitude });
    }
    setDraggingSeq(null);
    setDragAltitude(null);
  }, [draggingSeq, dragAltitude, updateWaypoint]);

  // Attach global mouse handlers when dragging
  useEffect(() => {
    if (draggingSeq !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingSeq, handleMouseMove, handleMouseUp]);

  const handleWaypointClick = (seq: number) => {
    if (draggingSeq === null) {
      setSelectedSeq(seq);
    }
  };

  // Format distance for display
  const formatDistance = (meters: number): string => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)}km`;
    }
    return `${Math.round(meters)}m`;
  };

  return (
    <div ref={containerRef} className="h-full w-full bg-gray-900/50 overflow-hidden relative">
      {waypoints.length === 0 ? (
        <div className="h-full flex items-center justify-center text-gray-500 text-sm">
          {readOnly ? 'No mission loaded' : 'No waypoints to display'}
        </div>
      ) : (
        <>
        {/* Legend and status */}
        <div className="absolute top-1 right-2 flex items-center gap-3 text-[10px] pointer-events-none">
          {terrainLoading && (
            <span className="text-blue-400">Loading terrain...</span>
          )}
          {terrainData.length > 0 && !terrainLoading && (
            <>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-green-500/60" />
                <span className="text-gray-500">Terrain</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-amber-500" style={{ borderStyle: 'dashed' }} />
                <span className="text-gray-500">Safe +{safeAltitudeBuffer}m</span>
              </span>
            </>
          )}
          {collisionSegments.length > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Collision!
            </span>
          )}
          {!readOnly && <span className="text-gray-500">Drag points to edit</span>}
        </div>
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className={`select-none ${!readOnly && draggingSeq !== null ? 'cursor-ns-resize' : ''}`}
        >
          <g transform={`translate(${margin.left}, ${margin.top})`}>
            {/* Grid lines */}
            {yTicks.map((tick, i) => (
              <line
                key={`y-grid-${i}`}
                x1={0}
                x2={chartWidth}
                y1={yScale(tick)}
                y2={yScale(tick)}
                stroke="#374151"
                strokeWidth={1}
                strokeDasharray="2,2"
              />
            ))}

            {/* Zero altitude line (if visible) */}
            {yTicks.some(t => t <= 0) && yTicks.some(t => t >= 0) && (
              <line
                x1={0}
                x2={chartWidth}
                y1={yScale(0)}
                y2={yScale(0)}
                stroke="#4b5563"
                strokeWidth={1}
              />
            )}

            {/* Terrain profile (green filled area) */}
            {terrainPathD && (
              <path
                d={terrainPathD}
                fill="url(#terrainGradient)"
                opacity={0.6}
              />
            )}

            {/* Safe altitude line (terrain + buffer) */}
            {safeAltitudePathD && (
              <path
                d={safeAltitudePathD}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={1}
                strokeDasharray="4,4"
                opacity={0.7}
              />
            )}

            {/* Collision warning segments (red overlay on path) */}
            {collisionSegments.map((seg, i) => (
              <line
                key={`collision-${i}`}
                x1={seg.x1}
                y1={seg.y1}
                x2={seg.x2}
                y2={seg.y2}
                stroke="#ef4444"
                strokeWidth={4}
                strokeLinecap="round"
                opacity={0.8}
              />
            ))}

            {/* Area fill under flight path line */}
            <path
              d={areaD}
              fill="url(#altitudeGradient)"
              opacity={0.3}
            />

            {/* Altitude line */}
            <path
              d={pathD}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeLinejoin="round"
            />

            {/* Waypoint markers */}
            {profileData.map((p, i) => {
              const x = xScale(p.distance);
              const isDragging = draggingSeq === p.wp.seq;
              const displayAlt = isDragging && dragAltitude !== null ? dragAltitude : p.altitude;
              const y = yScale(displayAlt);
              const isSelected = p.wp.seq === selectedSeq;
              const isCurrent = p.wp.seq === currentSeq;
              const color = isCurrent ? '#f97316' : getWaypointColor(p.wp.command); // Orange for current

              // Calculate AGL (Above Ground Level)
              const groundElevation = waypointElevations.get(p.wp.seq);
              const agl = groundElevation !== undefined ? displayAlt - groundElevation : null;
              const isBelowSafe = agl !== null && agl < safeAltitudeBuffer;

              return (
                <g
                  key={p.wp.seq}
                  onClick={() => handleWaypointClick(p.wp.seq)}
                  onMouseDown={(e) => !readOnly && handleDragStart(p.wp.seq, e)}
                  className={readOnly ? 'cursor-default' : isDragging ? 'cursor-ns-resize' : 'cursor-grab'}
                >
                  {/* Vertical line to point */}
                  <line
                    x1={x}
                    x2={x}
                    y1={y}
                    y2={chartHeight}
                    stroke={isDragging ? '#fbbf24' : isBelowSafe ? '#ef4444' : color}
                    strokeWidth={isDragging ? 2 : 1}
                    strokeDasharray={isDragging ? undefined : '2,2'}
                    opacity={isDragging ? 0.8 : 0.5}
                  />

                  {/* Point circle */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isDragging ? 10 : isCurrent ? 9 : isSelected ? 8 : 6}
                    fill={isDragging ? '#fbbf24' : isBelowSafe ? '#ef4444' : color}
                    stroke={isDragging ? 'white' : isCurrent ? '#fbbf24' : isSelected ? 'white' : isBelowSafe ? '#fca5a5' : 'rgba(255,255,255,0.5)'}
                    strokeWidth={isDragging || isCurrent || isSelected ? 2 : 1}
                  />

                  {/* Waypoint number */}
                  <text
                    x={x}
                    y={y - (isDragging ? 16 : isCurrent ? 14 : 12)}
                    textAnchor="middle"
                    fill={isDragging ? '#fbbf24' : isCurrent ? '#f97316' : isBelowSafe ? '#ef4444' : '#d1d5db'}
                    fontSize={isDragging ? 11 : isCurrent ? 11 : 10}
                    fontWeight={isDragging || isCurrent || isSelected ? 'bold' : 'normal'}
                  >
                    {i + 1}
                  </text>

                  {/* Altitude label with AGL (show when dragging, selected, current, or first/last) */}
                  {(isDragging || isSelected || isCurrent || i === 0 || i === profileData.length - 1) && (
                    <text
                      x={x}
                      y={y + (y < chartHeight / 2 ? 20 : -20)}
                      textAnchor="middle"
                      fill={isDragging ? '#fbbf24' : isCurrent ? '#f97316' : isBelowSafe ? '#ef4444' : '#9ca3af'}
                      fontSize={isDragging || isCurrent ? 11 : 9}
                      fontWeight={isDragging || isCurrent ? 'bold' : 'normal'}
                    >
                      {Math.round(displayAlt)}m
                      {agl !== null && (
                        <tspan fill={isBelowSafe ? '#ef4444' : '#22c55e'} fontSize={8}>
                          {' '}({Math.round(agl)} AGL)
                        </tspan>
                      )}
                    </text>
                  )}

                  {/* Hover/drag hit area (larger invisible circle for easier interaction) */}
                  <circle
                    cx={x}
                    cy={y}
                    r={15}
                    fill="transparent"
                  />
                </g>
              );
            })}

            {/* X-axis */}
            <line
              x1={0}
              x2={chartWidth}
              y1={chartHeight}
              y2={chartHeight}
              stroke="#4b5563"
              strokeWidth={1}
            />

            {/* Y-axis */}
            <line
              x1={0}
              x2={0}
              y1={0}
              y2={chartHeight}
              stroke="#4b5563"
              strokeWidth={1}
            />

            {/* X-axis ticks and labels */}
            {xTicks.map((tick, i) => (
              <g key={`x-tick-${i}`} transform={`translate(${xScale(tick)}, ${chartHeight})`}>
                <line y1={0} y2={4} stroke="#6b7280" strokeWidth={1} />
                <text
                  y={16}
                  textAnchor="middle"
                  fill="#9ca3af"
                  fontSize={9}
                >
                  {formatDistance(tick)}
                </text>
              </g>
            ))}

            {/* Y-axis ticks and labels */}
            {yTicks.map((tick, i) => (
              <g key={`y-tick-${i}`} transform={`translate(0, ${yScale(tick)})`}>
                <line x1={-4} x2={0} stroke="#6b7280" strokeWidth={1} />
                <text
                  x={-8}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="#9ca3af"
                  fontSize={9}
                >
                  {Math.round(tick)}
                </text>
              </g>
            ))}

            {/* Axis labels */}
            <text
              x={chartWidth / 2}
              y={chartHeight + 26}
              textAnchor="middle"
              fill="#6b7280"
              fontSize={10}
            >
              Distance
            </text>

            <text
              x={-chartHeight / 2}
              y={-35}
              textAnchor="middle"
              fill="#6b7280"
              fontSize={10}
              transform="rotate(-90)"
            >
              Altitude (m)
            </text>

            {/* Gradient definitions */}
            <defs>
              <linearGradient id="altitudeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="terrainGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#15803d" stopOpacity={0.8} />
              </linearGradient>
            </defs>
          </g>
        </svg>
        </>
      )}
    </div>
  );
}
