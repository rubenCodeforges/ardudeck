import { useMissionStore } from '../stores/mission-store';
import { useFenceStore } from '../stores/fence-store';
import { useRallyStore } from '../stores/rally-store';
import { useSettingsStore } from '../stores/settings-store';
import { buildFenceItems } from '../../shared/fence-types';
import { commandHasLocation, hasValidCoordinates } from '../../shared/mission-types';
import type { Group } from '../../shared/mission-group-types';
import { MISSION_PACKAGE_FORMAT, MISSION_PACKAGE_VERSION, type MissionPackage, type ShareIdentity } from '../../shared/mission-share-types';
import { computeMissionBriefing } from './flight-briefing';

export interface ShareContents {
  fence: boolean;
  rally: boolean;
  /** Survey areas and camera settings travel inside the mission's survey groups. */
  survey: boolean;
  vehicleProfile: boolean;
}

/** The same mission keeps the same id when shared again, so the new version replaces the old one. */
export function packageIdFor(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'mission';
}

function withoutSurveySource(groups: Group[]): Group[] {
  return groups.map((g) => (g.kind === 'survey' ? ({ ...g, source: undefined } as unknown as Group) : g));
}

export function buildMissionPackage(name: string, contents: ShareContents, note: string, sharedBy: ShareIdentity): MissionPackage {
  const mission = useMissionStore.getState();
  const fence = useFenceStore.getState();
  const rally = useRallyStore.getState();
  const settings = useSettingsStore.getState();
  const vehicle = settings.getActiveVehicle();
  const home = mission.homePosition;
  return {
    format: MISSION_PACKAGE_FORMAT,
    version: MISSION_PACKAGE_VERSION,
    id: packageIdFor(name),
    name: name.trim(),
    sharedBy,
    sharedAt: Date.now(),
    ...(note.trim() ? { note: note.trim() } : {}),
    mission: {
      items: mission.missionItems,
      groups: contents.survey ? mission.groups : withoutSurveySource(mission.groups),
      home: home ? { lat: home.lat, lon: home.lon, alt: home.alt ?? 0 } : null,
    },
    fence: contents.fence ? buildFenceItems(fence.polygons, fence.circles, fence.returnPoint) : null,
    rally: contents.rally ? rally.rallyPoints : null,
    vehicleProfile: contents.vehicleProfile && vehicle
      ? { name: vehicle.name, cruiseSpeedMs: settings.getCruiseSpeed(), enduranceSec: settings.getEstimatedFlightTime() }
      : null,
  };
}

/** Replaces the plan in the editor with the shared one: mission, and fence and rally when the package has them. */
export function applyMissionPackage(pkg: MissionPackage): void {
  const mission = useMissionStore.getState();
  if (pkg.mission.home) mission.setHomePosition(pkg.mission.home.lat, pkg.mission.home.lon, pkg.mission.home.alt);
  mission.setMissionItemsFromFile(pkg.mission.items, pkg.mission.groups);
  if (pkg.fence) useFenceStore.getState().setFenceItemsFromFile(pkg.fence);
  if (pkg.rally) useRallyStore.getState().setRallyPoints(pkg.rally);
}

/** Flight time of a plan at the package's cruise speed when it brought one, else the active profile's. */
export function packageFlightTimeSec(items: MissionPackage['mission']['items'], cruiseSpeedMs: number): number {
  const located = items
    .filter((it) => commandHasLocation(it.command) && hasValidCoordinates(it.latitude, it.longitude))
    .map((it) => ({ lat: it.latitude, lng: it.longitude, altM: it.altitude }));
  return computeMissionBriefing({ located, home: null, cruiseSpeedMs, enduranceSec: 0 }).flightTimeSec;
}
