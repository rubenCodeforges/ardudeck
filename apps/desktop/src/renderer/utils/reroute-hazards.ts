import { useMissionStore } from '../stores/mission-store';
import { useHazardsStore } from '../stores/hazards-store';
import { hazardCrossings } from '../../shared/mission-validation';
import { routeAround } from '../../shared/hazard-geometry';

/** Inserts detour waypoints around every locked zone a leg crosses. Legs that start or end inside a zone are left for the pilot. */
export function rerouteAroundHazards(): { rerouted: number; unroutable: number } {
  const zones = useHazardsStore.getState().hazards;
  const skipped = new Set<string>();
  let rerouted = 0;
  for (let guard = 0; guard < 50; guard++) {
    const mission = useMissionStore.getState();
    const crossing = hazardCrossings(mission.missionItems, zones, mission.homePosition)
      .find((c) => !skipped.has(`${c.zone.id}:${c.toSeq}`));
    if (!crossing) break;
    const to = mission.missionItems.find((i) => i.seq === crossing.toSeq)!;
    const from = crossing.fromSeq === null
      ? { latitude: mission.homePosition!.lat, longitude: mission.homePosition!.lon, altitude: to.altitude }
      : mission.missionItems.find((i) => i.seq === crossing.fromSeq)!;
    const detour = routeAround({ lat: from.latitude, lon: from.longitude }, { lat: to.latitude, lon: to.longitude }, crossing.zone);
    if (!detour || detour.length === 0) {
      skipped.add(`${crossing.zone.id}:${crossing.toSeq}`);
      continue;
    }
    let after = crossing.fromSeq ?? -1;
    detour.forEach((p, i) => {
      const alt = from.altitude + ((to.altitude - from.altitude) * (i + 1)) / (detour.length + 1);
      mission.insertWaypoint(after, p.lat, p.lon, alt, to.groupId);
      after += 1;
      useMissionStore.getState().updateWaypoint(after, { frame: to.frame });
    });
    rerouted++;
  }
  return { rerouted, unroutable: skipped.size };
}
