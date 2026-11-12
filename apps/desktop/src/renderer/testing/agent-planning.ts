import type { FenceProposal, MissionProposal } from '@ardudeck/module-sdk';
import { useMissionStore } from '../stores/mission-store';
import { useSurveyStore } from '../stores/survey-store';
import { useFenceStore } from '../stores/fence-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { useNavigationStore } from '../stores/navigation-store';
import { proposeFence, proposeMission, proposeSurvey } from '../modules/module-proposal-registry';
import { applyFenceProposal, applyMissionProposal, type ProposedCommand } from '../modules/proposal-apply';
import { summariseFence } from '../modules/module-fence-write';
import { ALL_CAMERA_PRESETS } from '../components/survey/camera-presets';
import { polygonArea } from '../components/survey/geo-math';
import { calculateAltitudeForGSD, estimateBatteryCount } from '../components/survey/survey-stats';
import type { SurveyConfig, SurveyPattern } from '../components/survey/survey-types';
import { listSurveyGenerators, generatorDisplayName, generatorDescription, getSurveyGenerator } from '../components/survey/generator-registry';
import { splitLargestSurveyIntoFlights, switchSurveysToFcTerrain, enableSdMissionStorage } from '../components/mission/mission-fit-actions';
import { MAV_CMD, commandHasLocation, hasValidCoordinates, mavFrameToAltFrame } from '../../shared/mission-types';
import { useSettingsStore, type VehicleProfile } from '../stores/settings-store';
import { computeMissionBriefing } from '../utils/flight-briefing';
import { getElevation } from '../utils/elevation-api';
import { useGuideStore, GUIDE_ROLES, minGuidePoints, type GuideRole } from '../stores/guide-store';
import { bufferPolygonLatLng } from '../components/survey/geo-math';
import { t } from '../../shared/i18n/index.js';

const AGENT_SLUG = 'mcp-agent';
const agentName = (): string => t('modules:moduleProposal.agentName');

const COMMAND_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(MAV_CMD).map(([k, v]) => [v, k]),
);

export const SURVEY_PATTERNS: SurveyPattern[] = ['grid', 'crosshatch', 'circular', 'spiral', 'perimeter-fill', 'corridor', 'panorama'];

/** SurveyConfig fields an agent may set through `advanced`, the same ones the survey panel exposes. */
const ADVANCED_KEYS = [
  'altitudeReference', 'margin', 'overshoot', 'leadIn', 'cameraOffOutside', 'tieLineEvery', 'gridMode',
  'groundPattern', 'spiralDirection', 'perimeterPasses', 'crossGridAltitudeOffset', 'corridorStrips',
  'corridorSectionLengthM', 'corridorMode', 'corridorSideOffset', 'corridorMargin', 'corridorBranchStrips',
  'maxTurnAngle', 'airframe', 'launch', 'start', 'finish', 'stripOrder', 'flipLegs', 'invertPath',
  'panoramaSide', 'panoramaStandoff',
] as const;

/** What propose_survey can take: patterns, cameras, generators (module engines included) and the panel's current settings. */
export function listSurveyOptions(): unknown {
  const { polygon: _p, ...current } = { polygon: null, ...useSurveyStore.getState().config };
  return {
    patterns: SURVEY_PATTERNS,
    altitudeReferences: ['relative', 'asl', 'terrain'],
    cameras: ALL_CAMERA_PRESETS.map((c) => c.name),
    generators: listSurveyGenerators().map((g) => ({
      id: g.id,
      name: generatorDisplayName(g),
      description: generatorDescription(g),
      capabilities: g.capabilities,
      configFields: g.configFields ?? [],
    })),
    advancedKeys: ADVANCED_KEYS,
    currentPanelConfig: current,
  };
}
export const MISSION_COMMANDS: ProposedCommand[] = ['waypoint', 'takeoff', 'land', 'loiter_time'];

/** The plan in the mission planner (not necessarily what the vehicle holds). */
export function getMission(): unknown {
  const ms = useMissionStore.getState();
  const fence = summariseFence(useFenceStore.getState());
  return {
    home: ms.homePosition,
    dirty: ms.isDirty,
    groups: ms.groups.map((g) => ({ id: g.id, name: g.name, kind: g.kind, items: ms.missionItems.filter((i) => i.groupId === g.id).length })),
    items: ms.missionItems.map((i) => ({
      seq: i.seq,
      command: COMMAND_NAMES[i.command] ?? i.command,
      lat: i.latitude,
      lng: i.longitude,
      altitude: i.altitude,
      frame: i.frame,
      param1: i.param1,
      groupId: i.groupId,
    })),
    fence,
  };
}

function refuseWhileArmed(): { ok: false; reason: string } | null {
  return useTelemetryStore.getState().flight.armed ? { ok: false, reason: t('modules:moduleProposal.agentArmed') } : null;
}

interface AgentMissionItem {
  lat: number;
  lng: number;
  altitude: number;
  frame?: 'relative' | 'asl';
  command?: ProposedCommand;
  holdSeconds?: number;
}

export async function agentProposeMission(params: {
  name: string;
  reason: string;
  mode?: 'append' | 'replace';
  items: AgentMissionItem[];
  returnToLaunch?: boolean;
}): Promise<unknown> {
  const armed = refuseWhileArmed();
  if (armed) return armed;
  const bad = (params.items ?? []).find((i) => i.command && !MISSION_COMMANDS.includes(i.command));
  if (bad) return { ok: false, reason: `unknown command ${bad.command}` };
  const proposal: MissionProposal = {
    name: params.name,
    reason: params.reason,
    mode: params.mode,
    items: (params.items ?? []).map((i) => ({ lat: i.lat, lng: i.lng, altitude: i.altitude, frame: i.frame })),
  };
  const answer = await proposeMission(AGENT_SLUG, agentName(), proposal, useMissionStore.getState().missionItems.length);
  if (!answer.accepted) return { ok: false, reason: answer.error ?? 'user cancelled' };
  const result = applyMissionProposal(agentName(), proposal, {
    commands: params.items.map((i) => ({ command: i.command, holdSeconds: i.holdSeconds })),
    returnToLaunch: params.returnToLaunch,
  });
  useNavigationStore.getState().setView('mission');
  return { ok: true, itemsAdded: result.pointsAccepted, uploaded: false };
}

export async function agentProposeSurvey(params: {
  name: string;
  reason: string;
  polygon: { lat: number; lng: number }[];
  pattern?: SurveyPattern;
  altitudeM?: number;
  gsdCm?: number;
  speedMs?: number;
  frontOverlap?: number;
  sideOverlap?: number;
  gridAngle?: number;
  camera?: string;
  corridorWidthM?: number;
  lineSpacingM?: number;
  manualCorridorWidthM?: number;
  terrainFollow?: boolean;
  enduranceMinutes?: number;
  generatorId?: string;
  engineParams?: Record<string, unknown>;
  advanced?: Record<string, unknown>;
}): Promise<unknown> {
  const armed = refuseWhileArmed();
  if (armed) return armed;
  const pattern = params.pattern ?? 'grid';
  if (!SURVEY_PATTERNS.includes(pattern)) return { ok: false, reason: `unknown pattern ${pattern}` };
  const base = useSurveyStore.getState().config;
  // A module engine left selected in the panel must not take over: only an explicit generatorId picks one.
  if (params.generatorId && !getSurveyGenerator(params.generatorId)) {
    return { ok: false, reason: `unknown generator ${params.generatorId}`, generators: listSurveyGenerators().map((g) => g.id) };
  }
  const override: Partial<SurveyConfig> = { pattern, generatorId: params.generatorId, engineParams: params.engineParams };
  for (const [k, v] of Object.entries(params.advanced ?? {})) {
    if (!(ADVANCED_KEYS as readonly string[]).includes(k)) return { ok: false, reason: `unknown advanced setting ${k}`, advancedKeys: ADVANCED_KEYS };
    (override as Record<string, unknown>)[k] = v;
  }
  if (params.camera) {
    const cam = ALL_CAMERA_PRESETS.find((c) => c.name.toLowerCase() === params.camera!.toLowerCase());
    if (!cam) return { ok: false, reason: `unknown camera ${params.camera}`, cameras: ALL_CAMERA_PRESETS.map((c) => c.name) };
    override.camera = cam;
  }
  const camera = override.camera ?? base.camera;
  if (params.gsdCm !== undefined) {
    const alt = calculateAltitudeForGSD(camera.sensorWidth, camera.focalLength, camera.imageWidth, params.gsdCm);
    override.altitude = Math.max(1, Math.min(500, Math.round(alt)));
    override.planBy = 'gsd';
  } else if (params.altitudeM !== undefined) {
    override.altitude = Math.max(1, Math.min(500, params.altitudeM));
    override.planBy = 'altitude';
  }
  if (params.speedMs !== undefined) override.speed = Math.max(1, params.speedMs);
  if (params.frontOverlap !== undefined) override.frontOverlap = Math.max(10, Math.min(95, params.frontOverlap));
  if (params.sideOverlap !== undefined) override.sideOverlap = Math.max(10, Math.min(99, params.sideOverlap));
  if (params.gridAngle !== undefined) override.gridAngle = ((params.gridAngle % 360) + 360) % 360;
  if (params.corridorWidthM !== undefined) override.corridorWidth = Math.max(1, params.corridorWidthM);
  if (params.lineSpacingM !== undefined) {
    if (params.camera || params.gsdCm !== undefined) return { ok: false, reason: 'lineSpacingM is for a non-camera sensor; leave camera and gsdCm unset' };
    override.camera = { ...base.camera, name: t('modules:moduleProposal.lineSensor'), lineSpacing: Math.max(1, params.lineSpacingM) };
  }
  if (params.manualCorridorWidthM !== undefined) {
    if (params.camera || params.gsdCm !== undefined || params.lineSpacingM !== undefined) return { ok: false, reason: 'manualCorridorWidthM is a fixed cut or spray width; leave camera, gsdCm and lineSpacingM unset' };
    override.camera = { ...base.camera, name: t('modules:moduleProposal.lineSensor'), manualCorridorWidth: Math.max(0.1, params.manualCorridorWidthM) };
  }
  if (params.terrainFollow !== undefined) override.terrainFollow = params.terrainFollow;
  if (override.altitudeReference === 'terrain' && params.terrainFollow === undefined) override.terrainFollow = false;
  if (params.enduranceMinutes !== undefined) override.enduranceMinutes = Math.max(1, Math.round(params.enduranceMinutes));

  const polygon = (params.polygon ?? []).map((p) => ({ lat: p.lat, lng: p.lng }));
  const closed = pattern !== 'corridor';
  const altitudeM = override.altitude ?? base.altitude;
  const answer = await proposeSurvey(AGENT_SLUG, agentName(), {
    name: params.name,
    reason: params.reason,
    polygon,
    pattern,
    altitudeM,
    areaM2: closed && polygon.length >= 3 ? polygonArea(polygon) : 0,
  });
  if (!answer.accepted) return { ok: false, reason: answer.error ?? 'user cancelled' };

  const ids = await useSurveyStore.getState().addSurveyAreasFromPolygons([{ polygon, name: params.name, configOverride: override }]);
  if (ids.length === 0) {
    return { ok: false, reason: useSurveyStore.getState().generatorError ?? 'the survey produced no waypoints' };
  }
  useNavigationStore.getState().setView('mission');
  const ms = useMissionStore.getState();
  const stats = await waitForSurveyStats(ids[0]!);
  const config = useSurveyStore.getState().config;
  const endurance = config.enduranceMinutes ?? 0;
  return {
    ok: true,
    groupId: ids[0],
    waypoints: ms.missionItems.filter((i) => i.groupId === ids[0]).length,
    altitudeM,
    uploaded: false,
    estimate: stats && {
      areaHa: +(stats.areaCovered / 10_000).toFixed(2),
      lines: stats.lineCount,
      lineSpacingM: +stats.lineSpacing.toFixed(1),
      flightDistanceKm: +(stats.flightDistance / 1000).toFixed(2),
      flightTimeMin: +(stats.flightTime / 60).toFixed(1),
      speedMs: config.speed,
      photos: stats.photoCount,
      gsdCm: stats.gsd ? +stats.gsd.toFixed(2) : null,
      enduranceMinutes: endurance || null,
      batteryPacks: endurance ? estimateBatteryCount(stats.flightTime, endurance) : null,
      terrainFollow: !!config.terrainFollow,
      note: 'Flight time is path length divided by speed, the same figure as the survey stats panel. It does not add transit to and from home, takeoff, landing or turn slow-downs.',
    },
  };
}

/** The preview stats the survey panel shows for a group it just opened. */
async function waitForSurveyStats(groupId: string, timeoutMs = 60_000): Promise<import('../components/survey/survey-types').SurveyStats | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const st = useSurveyStore.getState();
    if (st.editingGroupId === groupId && st.result?.stats) return st.result.stats;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/** Set the planning home (take-off point). Planner only: the flight controller sets its own home on arming. */
export async function agentSetHome(params: { lat: number; lng: number; altAslM?: number }): Promise<unknown> {
  if (!Number.isFinite(params?.lat) || !Number.isFinite(params?.lng)) return { ok: false, reason: 'lat and lng are required' };
  const ms = useMissionStore.getState();
  if (params.altAslM !== undefined) {
    ms.setHomePosition(params.lat, params.lng, params.altAslM);
    return { ok: true, home: useMissionStore.getState().homePosition, altSource: 'given' };
  }
  const ground = await getElevation(params.lat, params.lng);
  ms.setHomePosition(params.lat, params.lng, ground ?? 0);
  return { ok: true, home: useMissionStore.getState().homePosition, altSource: ground === null ? 'elevation lookup failed, 0 used' : 'terrain elevation' };
}

export async function agentProposeFence(params: FenceProposal): Promise<unknown> {
  const armed = refuseWhileArmed();
  if (armed) return armed;
  const answer = await proposeFence(AGENT_SLUG, agentName(), params, summariseFence(useFenceStore.getState()));
  if (!answer.accepted) return { ok: false, reason: answer.error ?? 'user cancelled' };
  const result = await applyFenceProposal(params);
  return { ok: !result.error, ...result };
}

export interface AgentProfileInput {
  id?: string;
  name: string;
  type: 'copter' | 'plane' | 'vtol';
  weightG: number;
  batteryCells: number;
  batteryCapacityMah: number;
  batteryChemistry?: 'lipo' | 'lihv' | 'lion' | 'life';
  motorCount?: number;
  frameSizeMm?: number;
  propSize?: string;
  motorKv?: number;
  escRatingA?: number;
  wingspanMm?: number;
  wingAreaCm2?: number;
  maxSpeedMs?: number;
  /** Measured or datasheet average power in flight; overrides the built-in estimate. */
  avgPowerW?: number;
  /** Known cruise speed; overrides the built-in estimate. */
  cruiseSpeedMs?: number;
  notes?: string;
  activate?: boolean;
}

/** Create or update a vehicle profile in ArduDeck's settings. Local only: nothing is written to a vehicle. */
export function agentSetVehicleProfile(p: AgentProfileInput): unknown {
  const st = useSettingsStore.getState();
  if (!p?.name || !p.type || !(p.weightG > 0) || !(p.batteryCells > 0) || !(p.batteryCapacityMah > 0)) {
    return { ok: false, reason: 'name, type, weightG, batteryCells and batteryCapacityMah are required' };
  }
  const fields: Partial<VehicleProfile> = {
    name: p.name,
    type: p.type,
    weight: p.weightG,
    batteryCells: p.batteryCells,
    batteryCapacity: p.batteryCapacityMah,
    batteryChemistry: p.batteryChemistry,
    motorCount: p.motorCount,
    frameSize: p.frameSizeMm,
    propSize: p.propSize,
    motorKv: p.motorKv,
    escRating: p.escRatingA,
    wingspan: p.wingspanMm,
    wingArea: p.wingAreaCm2,
    maxSpeed: p.maxSpeedMs,
    _avgPowerDraw: p.avgPowerW,
    _cruiseSpeed: p.cruiseSpeedMs,
    notes: p.notes,
  };
  for (const k of Object.keys(fields) as (keyof VehicleProfile)[]) if (fields[k] === undefined) delete fields[k];
  let id = p.id;
  if (id) {
    if (!st.vehicles.some((v) => v.id === id)) return { ok: false, reason: `no profile with id ${id}` };
    st.updateVehicle(id, fields);
  } else {
    id = st.addVehicle(fields as Omit<VehicleProfile, 'id'>);
  }
  if (p.activate) st.setActiveVehicle(id);
  const after = useSettingsStore.getState();
  const active = after.activeVehicleId === id;
  return {
    ok: true,
    id,
    active,
    profile: after.vehicles.find((v) => v.id === id),
    // The estimators read the active profile, so these only describe this one when it is active.
    derived: active ? { cruiseSpeedMs: +after.getCruiseSpeed().toFixed(1), enduranceMin: +(after.getEstimatedFlightTime() / 60).toFixed(1) } : null,
  };
}

/** The Flight Info panel's briefing for the current plan and the active profile. */
export function agentFlightEstimate(params: { speedMs?: number; enduranceMinutes?: number } = {}): unknown {
  const st = useSettingsStore.getState();
  const vehicle = st.getActiveVehicle();
  const ms = useMissionStore.getState();
  const located = ms.missionItems
    .filter((it) => commandHasLocation(it.command) && hasValidCoordinates(it.latitude, it.longitude))
    .map((it) => ({ lat: it.latitude, lng: it.longitude, altM: it.altitude, frame: mavFrameToAltFrame(it.frame) }));
  const cruiseSpeedMs = params.speedMs ?? st.getCruiseSpeed();
  const profileEnduranceSec = st.getEstimatedFlightTime();
  const enduranceSec = params.enduranceMinutes !== undefined ? params.enduranceMinutes * 60 : profileEnduranceSec;
  const home = ms.homePosition ? { lat: ms.homePosition.lat, lng: ms.homePosition.lon } : null;
  const b = computeMissionBriefing({ located, home, homeAltM: ms.homePosition?.alt, cruiseSpeedMs, enduranceSec, survey: null, weather: null });
  return {
    profile: vehicle ? { id: vehicle.id, name: vehicle.name, type: vehicle.type } : null,
    speedMs: +cruiseSpeedMs.toFixed(1),
    speedSource: params.speedMs !== undefined ? 'given' : 'profile cruise estimate',
    enduranceMin: +(enduranceSec / 60).toFixed(1),
    enduranceSource: params.enduranceMinutes !== undefined ? 'given' : 'profile (battery energy x 80% / estimated power)',
    profileEnduranceMin: +(profileEnduranceSec / 60).toFixed(1),
    distanceKm: +(b.distanceM / 1000).toFixed(2),
    flightTimeMin: +(b.stillAirFlightTimeSec / 60).toFixed(1),
    batteryPacks: b.batteryCount,
    reservePctFinalPack: b.reservePct,
    totalClimbM: Math.round(b.totalClimbM),
    waypoints: b.waypointCount,
    note: 'Still air, no wind. Flight time is the planned path at the given speed; climbs are listed but not costed in the energy estimate.',
  };
}

/** The same fixes the "mission too large" dialog offers. split and terrain change the plan; sd goes through the parameter review. */
export async function agentFitMission(params: { method: 'split' | 'terrain' | 'sd' }): Promise<unknown> {
  const armed = refuseWhileArmed();
  if (armed) return armed;
  const fn = params?.method === 'split' ? splitLargestSurveyIntoFlights
    : params?.method === 'terrain' ? switchSurveysToFcTerrain
    : params?.method === 'sd' ? enableSdMissionStorage
    : null;
  if (!fn) return { ok: false, reason: 'method must be split, terrain or sd' };
  const r = await fn();
  return { ...r, items: useMissionStore.getState().missionItems.length, uploaded: false };
}

type AreaGeometryInput = 'polygon' | 'line' | 'point';
const toGuideKind = (g: AreaGeometryInput) => (g === 'point' ? 'points' : g);

/** Draw or update a guide (a named area, line or point set) on the mission map. Planner only: nothing reaches a vehicle. */
export function agentDrawArea(params: {
  id?: string;
  name: string;
  kind: GuideRole;
  geometry: AreaGeometryInput;
  points: { lat: number; lng: number }[];
  pointLabels?: string[];
  bufferM?: number;
  color?: string;
  notes?: string;
}): unknown {
  if (!params?.name || !GUIDE_ROLES.includes(params.kind)) return { ok: false, reason: `name and kind (${GUIDE_ROLES.join(', ')}) are required` };
  const kind = toGuideKind(params.geometry);
  let points = (params.points ?? []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng)).map((p) => ({ lat: p.lat, lng: p.lng }));
  if (points.length < minGuidePoints(kind)) return { ok: false, reason: `${params.geometry} needs at least ${minGuidePoints(kind)} points` };
  if (params.bufferM && kind === 'polygon') {
    const grown = bufferPolygonLatLng(points, params.bufferM);
    if (!grown || grown.length < 3) return { ok: false, reason: 'the buffer could not be applied to this polygon' };
    points = grown;
  }
  const guide = useGuideStore.getState().upsertGuide({
    id: params.id,
    name: params.name,
    role: params.kind,
    kind,
    polygon: points,
    pointLabels: params.pointLabels,
    color: params.color,
    notes: params.notes,
    source: agentName(),
  });
  useNavigationStore.getState().setView('mission');
  return { ok: true, id: guide.id, points: guide.polygon.length, areaHa: kind === 'polygon' ? +(polygonArea(guide.polygon) / 10_000).toFixed(2) : null };
}

export function agentListAreas(): unknown {
  return useGuideStore.getState().guides.map((g) => ({
    id: g.id, name: g.name, kind: g.role ?? 'area', geometry: g.kind === 'points' ? 'point' : (g.kind ?? 'polygon'),
    visible: g.visible, points: g.polygon, holes: g.holes.length, notes: g.notes, source: g.source,
    areaHa: (g.kind ?? 'polygon') === 'polygon' ? +(polygonArea(g.polygon) / 10_000).toFixed(2) : null,
  }));
}

export function agentDeleteArea(params: { id: string }): unknown {
  const st = useGuideStore.getState();
  if (!st.guides.some((g) => g.id === params?.id)) return { ok: false, reason: `no area with id ${params?.id}` };
  st.removeGuide(params.id);
  return { ok: true };
}

/** propose_survey over a named polygon (or a line, as a corridor). Same review dialog, same settings. */
export async function agentSurveyArea(params: { id: string } & Omit<Parameters<typeof agentProposeSurvey>[0], 'polygon' | 'name' | 'reason'> & { name?: string; reason?: string }): Promise<unknown> {
  const area = useGuideStore.getState().guides.find((g) => g.id === params?.id);
  if (!area) return { ok: false, reason: `no area with id ${params?.id}` };
  if (area.kind === 'points') return { ok: false, reason: 'a point set cannot be surveyed; draw a polygon or a line' };
  const { id: _id, name, reason, ...settings } = params;
  return agentProposeSurvey({
    ...settings,
    pattern: area.kind === 'line' ? 'corridor' : settings.pattern,
    name: name ?? area.name,
    reason: reason ?? area.notes ?? area.name,
    polygon: area.polygon,
  });
}
