import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useMissionStore } from '../../stores/mission-store';
import { useSettingsStore } from '../../stores/settings-store';
import { commandHasLocation, hasValidCoordinates, MAV_CMD, type MissionItem } from '../../../shared/mission-types';
import { getElevations, interpolatePathPoints } from '../../utils/elevation-api';
import { AutoAdjustAltitudeDialog } from './AutoAdjustAltitudeDialog';
import type { PlanResult, PlannerWaypoint } from './terrain-altitude-planner';
import {
  altitudeValueFromMeters,
  formatAltitudeFromMeters,
  formatDistanceFromMeters,
  UNIT_LABELS,
} from '../../../shared/user-units.js';
import {
  DEFAULT_LABEL_WIDTH_PX,
  decimateForDrawing,
  drawStride,
  labelStride,
  nearestIndexByX,
  shouldShowInteractiveDots,
} from './altitude-profile-density';

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
    case MAV_CMD.NAV_VTOL_TAKEOFF:
      return '#22c55e'; // Green - takeoff
    case MAV_CMD.NAV_LAND:
    case MAV_CMD.NAV_VTOL_LAND:
      return '#ef4444'; // Red - land
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      return '#f97316'; // Orange - RTL
    case MAV_CMD.NAV_LOITER_UNLIM:
    case MAV_CMD.NAV_LOITER_TIME:
    case MAV_CMD.NAV_LOITER_TURNS:
    case MAV_CMD.NAV_LOITER_TO_ALT:
      return '#a855f7'; // Purple - loiter
    case MAV_CMD.NAV_SPLINE_WAYPOINT:
      return '#06b6d4'; // Cyan - spline
    default:
      return '#3b82f6'; // Blue
  }
}

interface ProfilePoint {
  wp: MissionItem;
  distance: number; // Cumulative distance in meters
  altitude: number;
}

// Min/max via a single loop. `Math.min(...arr)` / `Math.max(...arr)` spread the
// array as call arguments, which throws RangeError ("too many arguments") on
// large arrays — a 20k+ survey would crash the whole panel (black screen).
function minMax(values: number[]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
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

  const { missionItems, selectedSeq, currentSeq, setSelectedSeq, updateWaypoint, setHasTerrainCollisions, applyTerrainPlan } = useMissionStore();
  const [autoAdjustOpen, setAutoAdjustOpen] = useState(false);
  const { missionDefaults } = useSettingsStore();
  const safeAltitudeBuffer = missionDefaults.safeAltitudeBuffer;
  const maxWaypointMarkers = useSettingsStore((s) => s.surveyPerformance.maxWaypointMarkers);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);

  // Filter to items with location AND valid coordinates. Takeoff uses (0,0)
  // as a "take off from current position" sentinel; including it would make
  // the profile span ~5000km through Null Island.
  const waypoints = useMemo(
    () => missionItems.filter(
      item => commandHasLocation(item.command) && hasValidCoordinates(item.latitude, item.longitude),
    ),
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
        const prev = waypoints[i - 1]!;
        const segmentDist = haversineDistance(
          prev.latitude,
          prev.longitude,
          wp!.latitude,
          wp!.longitude
        );
        cumulativeDistance += segmentDist;
      }

      points.push({
        wp: wp!,
        distance: cumulativeDistance,
        altitude: wp!.altitude,
      });
    }

    return points;
  }, [waypoints]);

  // Decimated profile for rendering. The chart draws one interactive <g> (line +
  // circles) per point and runs collision sampling per point; at 20k+ that is
  // tens of thousands of SVG nodes and millions of ops, which blacks out the
  // panel. We thin to maxWaypointMarkers with a plain stride (kept selection-
  // independent so it doesn't refetch terrain on every click). For normal
  // missions (<= cap) this is exactly profileData, so behavior is unchanged.
  const displayProfile = useMemo(() => {
    if (profileData.length <= maxWaypointMarkers) return profileData;
    const stride = Math.ceil(profileData.length / maxWaypointMarkers);
    return profileData.filter((_, i) => i % stride === 0 || i === profileData.length - 1);
  }, [profileData, maxWaypointMarkers]);

  // Per-point interactive dots (drag-to-edit) only materialize when there are
  // few enough points to actually grab one; above the threshold the chart is
  // lines-only with a nearest-point hover readout.
  const showDots = shouldShowInteractiveDots(displayProfile.length);

  // Nearest-point hover readout for lines-only mode (index into displayProfile).
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

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

        // Also get elevation at each displayed waypoint (decimated set — fetching
        // an elevation for all 20k+ would be a huge IPC payload and main-process
        // fetch; only the drawn dots need an AGL readout).
        const allPoints = [
          ...pathPoints.map(p => ({ lat: p.lat, lon: p.lon })),
          ...displayProfile.map(p => ({ lat: p.wp.latitude, lon: p.wp.longitude })),
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
        displayProfile.forEach((p, i) => {
          const elev = wpElevations[i];
          if (elev !== null && elev !== undefined) {
            wpElevMap.set(p.wp.seq, elev);
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
  }, [waypoints, displayProfile]);

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

  // Drawing-only thinning: at most ~one vertex per pixel column for the line,
  // area, and collision paths. Identical to displayProfile (same reference)
  // whenever everything already fits, so small missions are untouched.
  const renderProfile = useMemo(
    () => decimateForDrawing(displayProfile, drawStride(displayProfile.length, chartWidth)),
    [displayProfile, chartWidth],
  );

  // Label every Nth dot so waypoint numbers never overlap.
  const numberStride = useMemo(
    () => labelStride(displayProfile.length, chartWidth, DEFAULT_LABEL_WIDTH_PX),
    [displayProfile.length, chartWidth],
  );

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

    // Distance is cumulative/monotonic, so the last point is the max — no need
    // to spread the (potentially huge) array into Math.max.
    const lastDist = profileData[profileData.length - 1]?.distance ?? 0;
    const maxDistance = Math.max(lastDist, 100);

    // Include both flight path and terrain in altitude range, via a loop (never
    // a spread — see minMax).
    const flight = minMax(displayProfile.map(p => p.altitude));
    const terr = minMax(terrainData.map(t => t.elevation));
    const minAltVal = Math.min(flight.min, terr.min, 0);
    const maxAltVal = Math.max(flight.max, terr.max, 100);
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
  }, [profileData, displayProfile, terrainData, chartWidth, chartHeight]);

  // Get display altitude for a point (use drag altitude if dragging this point)
  const getDisplayAltitude = useCallback((p: ProfilePoint): number => {
    if (draggingSeq === p.wp.seq && dragAltitude !== null) {
      return dragAltitude;
    }
    return p.altitude;
  }, [draggingSeq, dragAltitude]);

  // Build path for the altitude line (updates during drag)
  const pathD = useMemo(() => {
    if (renderProfile.length < 2) return '';

    return renderProfile
      .map((p, i) => {
        const x = xScale(p.distance);
        const y = yScale(getDisplayAltitude(p));
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [renderProfile, xScale, yScale, getDisplayAltitude]);

  // Build area path (filled area under the line)
  const areaD = useMemo(() => {
    if (renderProfile.length < 2) return '';

    const linePath = renderProfile
      .map((p, i) => {
        const x = xScale(p.distance);
        const y = yScale(getDisplayAltitude(p));
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

    const lastX = xScale(renderProfile[renderProfile.length - 1]!.distance);
    const firstX = xScale(renderProfile[0]!.distance);
    const bottomY = chartHeight;

    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [renderProfile, xScale, yScale, chartHeight, getDisplayAltitude]);

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

    const lastX = xScale(terrainData[terrainData.length - 1]!.distance);
    const firstX = xScale(terrainData[0]!.distance);
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
    if (dist <= terrainData[0]!.distance) return terrainData[0]!.elevation;
    if (dist >= terrainData[terrainData.length - 1]!.distance) {
      return terrainData[terrainData.length - 1]!.elevation;
    }

    for (let j = 0; j < terrainData.length - 1; j++) {
      if (terrainData[j]!.distance <= dist && terrainData[j + 1]!.distance >= dist) {
        const t = (dist - terrainData[j]!.distance) / (terrainData[j + 1]!.distance - terrainData[j]!.distance);
        return terrainData[j]!.elevation + t * (terrainData[j + 1]!.elevation - terrainData[j]!.elevation);
      }
    }
    return terrainData[terrainData.length - 1]!.elevation;
  }, [terrainData]);

  // Check for collision segments (where flight path intersects terrain)
  // Sample along the path, not just at waypoints
  const collisionSegments = useMemo(() => {
    if (terrainData.length === 0 || renderProfile.length < 2) return [];

    const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

    // Check each flight path segment against terrain with fine sampling
    for (let i = 0; i < renderProfile.length - 1; i++) {
      const p1 = renderProfile[i]!;
      const p2 = renderProfile[i + 1]!;
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
  }, [renderProfile, terrainData, xScale, yScale, getDisplayAltitude, getTerrainAtDistance]);

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

  // X pixel position of every displayed point, for nearest-point hover lookup
  // in lines-only mode (single svg listener instead of per-dot DOM events).
  const displayXs = useMemo(
    () => (showDots ? [] : displayProfile.map(p => xScale(p.distance))),
    [showDots, displayProfile, xScale],
  );

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (showDots || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - margin.left;
    const idx = nearestIndexByX(displayXs, x);
    setHoverIdx(idx >= 0 ? idx : null);
  }, [showDots, displayXs, margin.left]);

  const handleSvgMouseLeave = useCallback(() => setHoverIdx(null), []);

  const handleSvgClick = useCallback(() => {
    if (showDots || hoverIdx === null) return;
    const p = displayProfile[hoverIdx];
    if (p) setSelectedSeq(p.wp.seq);
  }, [showDots, hoverIdx, displayProfile, setSelectedSeq]);

  // In lines-only mode we still mark the selected and active waypoints (the
  // dots that would normally carry that state are not rendered).
  const selectedPoint = useMemo(
    () => (showDots || selectedSeq === null ? null : displayProfile.find(p => p.wp.seq === selectedSeq) ?? null),
    [showDots, displayProfile, selectedSeq],
  );
  const currentPoint = useMemo(
    () => (showDots || currentSeq === null ? null : displayProfile.find(p => p.wp.seq === currentSeq) ?? null),
    [showDots, displayProfile, currentSeq],
  );

  // Build planner waypoints (seq + lat/lon/alt) for the auto-adjust dialog.
  // Exclude waypoints with (0,0) coords — ArduPilot's NAV_TAKEOFF uses
  // lat=0/lon=0 as a "take off from current position" sentinel, and sampling
  // a segment to Null Island would produce ~800k terrain samples.
  const plannerWaypoints: PlannerWaypoint[] = useMemo(
    () => waypoints
      .filter(wp => hasValidCoordinates(wp.latitude, wp.longitude))
      .map(wp => ({
        seq: wp.seq,
        latitude: wp.latitude,
        longitude: wp.longitude,
        altitude: wp.altitude,
      })),
    [waypoints],
  );

  const handleApplyPlan = useCallback((plan: PlanResult) => {
    applyTerrainPlan({
      raisedAltitudes: plan.raisedAltitudes,
      inserts: plan.inserts,
    });
  }, [applyTerrainPlan]);

  return (
    <div ref={containerRef} data-tour="mission-altitude-panel" className="h-full w-full bg-surface overflow-hidden relative">
      {waypoints.length === 0 ? (
        <div className="h-full flex items-center justify-center text-content-secondary text-sm">
          {readOnly ? 'No mission loaded' : 'No waypoints to display'}
        </div>
      ) : (
        <>
        {/* Legend and status */}
        <div className="absolute top-1 right-2 flex items-center gap-3 text-[10px]">
          {terrainLoading && (
            <span className="text-blue-400 pointer-events-none">Loading terrain...</span>
          )}
          {terrainData.length > 0 && !terrainLoading && (
            <>
              <span className="flex items-center gap-1 pointer-events-none">
                <span className="w-2 h-2 rounded-sm bg-green-500/60" />
                <span className="text-content-secondary">Terrain</span>
              </span>
              <span className="flex items-center gap-1 pointer-events-none">
                <span className="w-3 h-0.5 bg-amber-500" style={{ borderStyle: 'dashed' }} />
                <span className="text-content-secondary">Safe +{formatAltitudeFromMeters(safeAltitudeBuffer, altitudeUnit)}</span>
              </span>
            </>
          )}
          {collisionSegments.length > 0 && (
            <span className="flex items-center gap-1 text-red-400 pointer-events-none">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Collision!
            </span>
          )}
          {!readOnly && terrainData.length > 0 && !terrainLoading && collisionSegments.length > 0 && (
            <button
              onClick={() => setAutoAdjustOpen(true)}
              className="px-2 py-0.5 text-[10px] font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded transition-colors"
              title={`Keep flight path ${formatAltitudeFromMeters(safeAltitudeBuffer, altitudeUnit)} above terrain`}
            >
              Auto Adjust...
            </button>
          )}
          {!readOnly && showDots && <span className="text-content-secondary pointer-events-none">Drag points to edit</span>}
          {!showDots && <span className="text-content-secondary pointer-events-none">Hover to inspect, click to select</span>}
        </div>
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          onMouseMove={showDots ? undefined : handleSvgMouseMove}
          onMouseLeave={showDots ? undefined : handleSvgMouseLeave}
          onClick={showDots ? undefined : handleSvgClick}
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
                stroke="var(--border-subtle)"
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
                stroke="var(--border-default)"
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

            {/* Waypoint markers (interactive dots only at editable point counts) */}
            {showDots && displayProfile.map((p, i) => {
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
                    stroke={isDragging ? 'var(--bg-base)' : isCurrent ? '#fbbf24' : isSelected ? 'var(--bg-base)' : isBelowSafe ? '#fca5a5' : 'var(--border-default)'}
                    strokeWidth={isDragging || isCurrent || isSelected ? 2 : 1}
                  />

                  {/* Waypoint number (density-limited so labels never overlap) */}
                  {(i % numberStride === 0 || isDragging || isSelected || isCurrent || i === displayProfile.length - 1) && (
                    <text
                      x={x}
                      y={y - (isDragging ? 16 : isCurrent ? 14 : 12)}
                      textAnchor="middle"
                      fill={isDragging ? '#fbbf24' : isCurrent ? '#f97316' : isBelowSafe ? '#ef4444' : 'var(--text-primary)'}
                      fontSize={isDragging ? 11 : isCurrent ? 11 : 10}
                      fontWeight={isDragging || isCurrent || isSelected ? 'bold' : 'normal'}
                    >
                      {i + 1}
                    </text>
                  )}

                  {/* Altitude label with AGL (show when dragging, selected, current, or first/last) */}
                  {(isDragging || isSelected || isCurrent || i === 0 || i === displayProfile.length - 1) && (
                    <text
                      x={x}
                      y={y + (y < chartHeight / 2 ? 20 : -20)}
                      textAnchor="middle"
                      fill={isDragging ? '#fbbf24' : isCurrent ? '#f97316' : isBelowSafe ? '#ef4444' : 'var(--text-secondary)'}
                      fontSize={isDragging || isCurrent ? 11 : 9}
                      fontWeight={isDragging || isCurrent ? 'bold' : 'normal'}
                    >
                      {formatAltitudeFromMeters(displayAlt, altitudeUnit)}
                      {agl !== null && (
                        <tspan fill={isBelowSafe ? '#ef4444' : '#22c55e'} fontSize={8}>
                          {' '}({formatAltitudeFromMeters(agl, altitudeUnit)} AGL)
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

            {/* Lines-only mode: selected / current markers and nearest-point hover readout */}
            {!showDots && currentPoint && (
              <circle
                cx={xScale(currentPoint.distance)}
                cy={yScale(currentPoint.altitude)}
                r={5}
                fill="#f97316"
                stroke="#fbbf24"
                strokeWidth={2}
              />
            )}
            {!showDots && selectedPoint && (
              <circle
                cx={xScale(selectedPoint.distance)}
                cy={yScale(selectedPoint.altitude)}
                r={5}
                fill={getWaypointColor(selectedPoint.wp.command)}
                stroke="var(--bg-base)"
                strokeWidth={2}
              />
            )}
            {!showDots && hoverIdx !== null && (() => {
              const p = displayProfile[hoverIdx];
              if (!p) return null;
              const x = xScale(p.distance);
              const y = yScale(p.altitude);
              const groundElevation = waypointElevations.get(p.wp.seq);
              const agl = groundElevation !== undefined ? p.altitude - groundElevation : null;
              const isBelowSafe = agl !== null && agl < safeAltitudeBuffer;
              // Keep the readout inside the chart near the edges
              const labelX = Math.max(40, Math.min(chartWidth - 40, x));
              const labelY = y < 24 ? y + 24 : y - 12;
              return (
                <g pointerEvents="none">
                  <line
                    x1={x}
                    x2={x}
                    y1={0}
                    y2={chartHeight}
                    stroke="var(--border-default)"
                    strokeWidth={1}
                    strokeDasharray="3,3"
                    opacity={0.7}
                  />
                  <circle cx={x} cy={y} r={4} fill={getWaypointColor(p.wp.command)} stroke="var(--bg-base)" strokeWidth={1.5} />
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    fill={isBelowSafe ? '#ef4444' : 'var(--text-primary)'}
                    fontSize={10}
                    fontWeight="bold"
                  >
                    WP {p.wp.seq}: {formatAltitudeFromMeters(p.altitude, altitudeUnit)}
                    {agl !== null && (
                      <tspan fill={isBelowSafe ? '#ef4444' : '#22c55e'} fontSize={8}>
                        {' '}({formatAltitudeFromMeters(agl, altitudeUnit)} AGL)
                      </tspan>
                    )}
                  </text>
                </g>
              );
            })()}

            {/* X-axis */}
            <line
              x1={0}
              x2={chartWidth}
              y1={chartHeight}
              y2={chartHeight}
              stroke="var(--border-default)"
              strokeWidth={1}
            />

            {/* Y-axis */}
            <line
              x1={0}
              x2={0}
              y1={0}
              y2={chartHeight}
              stroke="var(--border-default)"
              strokeWidth={1}
            />

            {/* X-axis ticks and labels */}
            {xTicks.map((tick, i) => (
              <g key={`x-tick-${i}`} transform={`translate(${xScale(tick)}, ${chartHeight})`}>
                <line y1={0} y2={4} stroke="var(--text-tertiary)" strokeWidth={1} />
                <text
                  y={16}
                  textAnchor="middle"
                  fill="var(--text-secondary)"
                  fontSize={9}
                >
                  {formatDistanceFromMeters(tick, distanceUnit)}
                </text>
              </g>
            ))}

            {/* Y-axis ticks and labels */}
            {yTicks.map((tick, i) => (
              <g key={`y-tick-${i}`} transform={`translate(0, ${yScale(tick)})`}>
                <line x1={-4} x2={0} stroke="var(--text-tertiary)" strokeWidth={1} />
                <text
                  x={-8}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="var(--text-secondary)"
                  fontSize={9}
                >
                  {Number(altitudeValueFromMeters(tick, altitudeUnit).toFixed(altitudeUnit === 'km' ? 2 : 0))}
                </text>
              </g>
            ))}

            {/* Axis labels */}
            <text
              x={chartWidth / 2}
              y={chartHeight + 26}
              textAnchor="middle"
              fill="var(--text-tertiary)"
              fontSize={10}
            >
              Distance
            </text>

            <text
              x={-chartHeight / 2}
              y={-35}
              textAnchor="middle"
              fill="var(--text-tertiary)"
              fontSize={10}
              transform="rotate(-90)"
            >
              Altitude ({UNIT_LABELS.altitude[altitudeUnit]})
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

      {autoAdjustOpen && (
        <AutoAdjustAltitudeDialog
          waypoints={plannerWaypoints}
          safeBuffer={safeAltitudeBuffer}
          onApply={handleApplyPlan}
          onClose={() => setAutoAdjustOpen(false)}
        />
      )}
    </div>
  );
}
