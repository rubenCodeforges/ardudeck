import type { SceneMeshRegistration } from '@ardudeck/module-sdk';
import type { UserModel } from '../../shared/scene-models/user-models.js';

export function toRegistration(m: UserModel): SceneMeshRegistration {
  const p = m.placement;
  const reg: SceneMeshRegistration = {
    id: m.id,
    name: m.name,
    origin: { lat: p.lat, lng: p.lng, altMsl: p.alt },
    yawDeg: p.yawDeg,
    pitchDeg: p.pitchDeg,
    rollDeg: p.rollDeg,
    scale: p.scale,
    altitudeMode: p.altitudeMode,
    version: m.version,
  };
  if (m.format === 'tileset') reg.tileset = m.entryPath;
  else if (m.format === 'pointcloud') reg.pointCloud = m.entryPath;
  else reg.glb = m.entryPath;
  if (m.footprints && m.footprints.length > 0) reg.footprints = m.footprints;
  if (m.scenes) reg.scenes = m.scenes;
  return reg;
}
