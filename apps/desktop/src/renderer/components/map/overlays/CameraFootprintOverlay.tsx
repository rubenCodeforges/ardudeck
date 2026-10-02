/**
 * Camera footprint overlay — draws each camera-equipped vehicle's field-of-view
 * trapezoid on the map, plus a marker at the frame-center ground point. This is
 * the connective tissue that makes click-on-video-to-point trustworthy: you see
 * on the map exactly where the camera is looking.
 *
 * Uses the same pose math as the camera view (vehicle pose + gimbal attitude +
 * source FOV). Gimbal attitude comes from RX discovery when available; absent
 * that it falls back to a nominal depression so the footprint still appears.
 */

import { useTranslation } from 'react-i18next';
import { Polygon, CircleMarker, Tooltip } from 'react-leaflet';
import { useFleetVehicles } from '../../../hooks/useFleet';
import { useCameraStore } from '../../../stores/camera-store';
import { projectFootprint, projectFrameCenter, type CameraPose } from '../../camera/geolocation';

export function CameraFootprintOverlay() {
  const { t } = useTranslation();
  const fleet = useFleetVehicles();
  const sources = useCameraStore((s) => s.sources);
  const selectedByVehicle = useCameraStore((s) => s.selectedByVehicle);
  const gimbalAttitude = useCameraStore((s) => s.gimbalAttitude);

  return (
    <>
      {fleet.map((v) => {
        const sourceId = selectedByVehicle[v.key];
        const source = sourceId ? sources[sourceId] : undefined;
        if (!source || !v.position) return null;

        const hfov = source.hfovDeg ?? 60;
        const vfov = source.vfovDeg ?? hfov * 0.5625;
        const gimbal = gimbalAttitude[v.key];
        const pose: CameraPose = {
          lat: v.position[0],
          lon: v.position[1],
          altMslM: v.altitudeAgl,
          bearingDeg: v.heading + (gimbal?.yawDeg ?? 0),
          pitchDownDeg: gimbal ? -gimbal.pitchDeg : 30,
          hfovDeg: hfov,
          vfovDeg: vfov,
        };

        const corners = projectFootprint(pose);
        if (corners.length < 3) return null;
        const center = projectFrameCenter(pose);
        const color = v.isActive ? '#22d3ee' : '#64748b';

        return (
          <span key={v.key}>
            <Polygon
              positions={corners.map((c) => [c.lat, c.lon] as [number, number])}
              pathOptions={{ color, weight: 1.5, fillColor: color, fillOpacity: 0.08, dashArray: '4 4' }}
            />
            {center && (
              <CircleMarker
                center={[center.lat, center.lon]}
                radius={4}
                pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.9 }}
              >
                <Tooltip direction="top" offset={[0, -4]}>{t('map:cameraFootprint.center', { label: v.label })}</Tooltip>
              </CircleMarker>
            )}
          </span>
        );
      })}
    </>
  );
}
