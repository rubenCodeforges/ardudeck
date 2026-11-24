/**
 * Airframe pictograms - top-down silhouettes, one per vehicle class. The art lives as
 * white-on-transparent PNGs in ./assets/airframes (the silhouette is the alpha channel),
 * and we paint them with a CSS mask so the glyph takes whatever colour the caller sets via
 * `color` - we tint each one to its vehicle's identity colour. Vehicle STATE is shown by
 * the tile ring around the icon, not by recolouring the glyph.
 *
 * Multirotors are chosen by rotor count (quad/hexa/octo/octo-x8). Classes without dedicated
 * art fall back to the nearest silhouette until art is added.
 *
 * MAV_TYPE reference: 1 FIXED_WING, 2 QUADROTOR, 3 COAXIAL, 4 HELICOPTER, 5 ANTENNA_TRACKER,
 * 10 GROUND_ROVER, 11 SURFACE_BOAT, 12 SUBMARINE, 13 HEXAROTOR, 14 OCTOROTOR, 15 TRICOPTER,
 * 19-25 VTOL_*, 29 DODECAROTOR, 35 DECAROTOR.
 */

import quadUrl from '../../assets/airframes/quad.png';
import hexaUrl from '../../assets/airframes/hexa.png';
import octoUrl from '../../assets/airframes/octo.png';
import octoX8Url from '../../assets/airframes/octo-x8.png';
import planeUrl from '../../assets/airframes/plane.png';
import vtolUrl from '../../assets/airframes/vtol.png';
import roverUrl from '../../assets/airframes/rover.png';
import boatUrl from '../../assets/airframes/boat.png';
import heliUrl from '../../assets/airframes/heli.svg';

export type AirframeKind =
  | 'multirotor'
  | 'heli'
  | 'plane'
  | 'vtol'
  | 'rover'
  | 'boat'
  | 'sub'
  | 'antenna'
  | 'unknown';

/** Decide what to draw, and (for multirotors) how many rotors, from the raw MAV_TYPE. */
export function airframeSpec(mavType: number | undefined): { kind: AirframeKind; rotors?: number } {
  switch (mavType) {
    case 2:  return { kind: 'multirotor', rotors: 4 };  // QUADROTOR
    case 13: return { kind: 'multirotor', rotors: 6 };  // HEXAROTOR
    case 14: return { kind: 'multirotor', rotors: 8 };  // OCTOROTOR
    case 15: return { kind: 'multirotor', rotors: 3 };  // TRICOPTER
    case 29: return { kind: 'multirotor', rotors: 12 }; // DODECAROTOR
    case 35: return { kind: 'multirotor', rotors: 10 }; // DECAROTOR
    case 3:  // COAXIAL
    case 4:  return { kind: 'heli' };                   // HELICOPTER
    case 1:  // FIXED_WING
    case 7:  // AIRSHIP
    case 8:  // FREE_BALLOON
    case 16: // FLAPPING_WING
    case 17: // KITE
    case 28: return { kind: 'plane' };                  // PARAFOIL
    case 19: case 20: case 21: case 22: case 23: case 24: case 25:
      return { kind: 'vtol' };                          // VTOL_*
    case 10: return { kind: 'rover' };                  // GROUND_ROVER
    case 11: return { kind: 'boat' };                   // SURFACE_BOAT
    case 12: return { kind: 'sub' };                    // SUBMARINE
    case 5:  return { kind: 'antenna' };                // ANTENNA_TRACKER
    default: return { kind: 'unknown' };
  }
}

/** The silhouette image for a vehicle type (nearest match for classes without own art). */
function airframeImage(mavType: number | undefined): string {
  const s = airframeSpec(mavType);
  if (s.kind === 'multirotor') {
    const n = s.rotors ?? 4;
    if (n <= 4) return quadUrl;
    if (n <= 6) return hexaUrl;
    if (n <= 8) return octoUrl;
    return octoX8Url;
  }
  switch (s.kind) {
    case 'plane': return planeUrl;
    case 'vtol': return vtolUrl;
    case 'rover': return roverUrl;
    case 'boat': return boatUrl;
    case 'sub': return boatUrl;   // nearest until a dedicated sub silhouette exists
    case 'heli': return heliUrl;
    default: return quadUrl;
  }
}

/** Short tactical designation for card/label text (distinguishes rotor counts). */
export function airframeLabel(mavType: number | undefined): string {
  const s = airframeSpec(mavType);
  if (s.kind === 'multirotor') {
    const named: Record<number, string> = { 3: 'TRI', 4: 'QUAD', 6: 'HEXA', 8: 'OCTO', 10: 'DECA', 12: 'DODECA' };
    return named[s.rotors ?? 0] ?? `${s.rotors}-ROTOR`;
  }
  const byKind: Record<Exclude<AirframeKind, 'multirotor'>, string> = {
    heli: 'HELI', plane: 'FW', vtol: 'VTOL', rover: 'ROVER', boat: 'BOAT', sub: 'SUB', antenna: 'ANT', unknown: '?',
  };
  return byKind[s.kind];
}

export interface AirframeIconProps {
  mavType: number | undefined;
  /** Pixel size of the square icon. */
  size?: number;
  className?: string;
  /** Accessible label / tooltip. */
  title?: string;
}

/**
 * Render the airframe pictogram for a vehicle. The silhouette is painted with the parent's
 * `color` (CSS mask + `currentColor`), so set `color` to the vehicle's identity colour.
 */
export function AirframeIcon({ mavType, size = 24, className, title }: AirframeIconProps) {
  const url = airframeImage(mavType);
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={className}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        backgroundColor: 'currentColor',
        WebkitMaskImage: `url(${url})`,
        maskImage: `url(${url})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}
