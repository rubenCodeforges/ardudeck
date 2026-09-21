/**
 * Live data source for the green fighter HUD over the camera video. The HUD
 * itself (FighterHud) is pure; this maps the telemetry store into it, including
 * NED velocity so the flight-path marker reflects true track (with wind drift).
 */

import { memo } from 'react';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useMissionStore } from '../../../stores/mission-store';
import { useHudStore } from '../../../stores/hud-store';
import { useConnectionStore } from '../../../stores/connection-store';
import { useActiveVehicleStore } from '../../../stores/active-vehicle-store';
import { useFleetTelemetryStore } from '../../../stores/fleet-telemetry-store';
import { bearingDeg, haversineMeters } from '../../../utils/osd/live-telemetry';
import { wrap180 } from './hud-geometry';
import { useMapHomeStore } from '../../map/instruments/registry';
import { computeHomeReadout, resolveHudHome } from './home-readout';
import { resolveHudProfile } from './hud-config';
import { useLinkHistory } from './useLinkHistory';
import { FighterHud, type FighterHudValues, type HudContact } from './FighterHud';

export const LiveFighterHud = memo(function LiveFighterHud() {
  const t = useTelemetryStore();
  const missionHome = useMissionStore((s) => s.homePosition);
  const mapHome = useMapHomeStore((s) => s.home);
  const config = useHudStore((s) => s.config);
  const mavType = useConnectionStore((s) => s.connectionState.mavType);
  const profile = resolveHudProfile(config.profile, mavType);
  const widgets = profile === 'ground' ? config.widgetsGround : config.widgets;
  const linkHistory = useLinkHistory(widgets.linkGraph);

  const lat = t.gps.lat || t.position.lat;
  const lon = t.gps.lon || t.position.lon;
  const heading = t.vfrHud.heading || t.attitude.yaw;

  const homeReadout = computeHomeReadout(lat, lon, heading, resolveHudHome(mapHome, missionHome));

  // Swarm contacts: every OTHER fleet vehicle with a position, as azimuth /
  // elevation relative to own nose. Uses relative altitudes (a swarm shares a
  // launch area, so the same datum). Rendering is gated by the `swarm` widget
  // toggle in FighterHud; without a fleet this is just an empty array.
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const knownVehicles = useActiveVehicleStore((s) => s.knownVehicles);
  const formations = useActiveVehicleStore((s) => s.formations);
  const byVehicle = useFleetTelemetryStore((s) => s.byVehicle);
  const contacts: HudContact[] = [];
  if (activeVehicleKey && (lat || lon)) {
    const ownAlt = t.position.relativeAlt;
    for (const info of Object.values(knownVehicles)) {
      if (info.key === activeVehicleKey) continue;
      const tel = byVehicle[info.key];
      const cLat = tel?.gps?.lat || tel?.position?.lat;
      const cLon = tel?.gps?.lon || tel?.position?.lon;
      if (!cLat || !cLon) continue;
      const distanceM = haversineMeters(lat, lon, cLat, cLon);
      const dAlt = (tel?.position?.relativeAlt ?? 0) - ownAlt;
      contacts.push({
        key: info.key,
        label: `SYS ${info.sysid}`,
        bearingRel: wrap180(bearingDeg(lat, lon, cLat, cLon) - heading),
        elevation: (Math.atan2(dAlt, Math.max(distanceM, 1)) * 180) / Math.PI,
        distanceM,
        leader: info.key in formations,
      });
    }
  }

  // Steering output: servo 1 is the ground-steering output on ArduPilot
  // Rover's conventional wiring. 0/undefined PWM means "no output yet".
  let steer: number | undefined;
  const steerPwm = t.servoOutput?.outputs[0];
  if (steerPwm && steerPwm >= 800 && steerPwm <= 2200) {
    steer = Math.max(-100, Math.min(100, ((steerPwm - 1500) / 500) * 100));
  }

  const v: FighterHudValues = {
    roll: t.attitude.roll,
    pitch: t.attitude.pitch,
    heading,
    airspeed: t.vfrHud.airspeed,
    groundspeed: t.vfrHud.groundspeed,
    altitude: t.position.relativeAlt || t.vfrHud.alt,
    vario: t.vfrHud.climb,
    throttle: t.vfrHud.throttle,
    vx: t.position.vx,
    vy: t.position.vy,
    vz: t.position.vz,
    batteryVoltage: t.battery.voltage,
    batteryPercent: t.battery.remaining,
    current: t.battery.current,
    mode: t.flight.mode,
    armed: t.flight.armed,
    distance: homeReadout?.distance ?? null,
    homeDirection: homeReadout?.direction ?? null,
    gpsSats: t.gps.satellites,
    hdop: t.gps.hdop,
    lat,
    lon,
    windSpeed: t.wind.speed,
    vtolState: t.vtolState,
    linkHistory,
    linkLabel: 'RC LINK',
    steer,
    wpDistance: t.navController?.wpDist,
    xtrackError: t.navController?.xtrackError,
    contacts,
  };

  // A transition is the least forgiving phase of a VTOL flight and the mode
  // name never mentions it, so the cell appears on its own for an airframe
  // that reports one. Other vehicles keep it off unless the user asks.
  const hudConfig = t.vtolState == null || widgets.vtolState
    ? config
    : profile === 'ground'
      ? { ...config, widgetsGround: { ...config.widgetsGround, vtolState: true } }
      : { ...config, widgets: { ...config.widgets, vtolState: true } };

  return <FighterHud v={v} config={hudConfig} profile={profile} />;
});
