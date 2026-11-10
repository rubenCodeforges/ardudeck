import type { UserModelPlacement } from '../user-models';
import type { Geodetic } from '../geodesy';

/** One row of a placement table (models.json, CSV or GeoJSON) next to a folder of models. */
export interface PlacementRow {
  /** Model file, relative to the table's folder. */
  file: string;
  name?: string;
  placement: UserModelPlacement;
}

export interface KmlModel {
  href: string;
  name?: string;
  placement: UserModelPlacement;
}

export interface CityJsonMesh {
  /** One node per CityObject, extras { id, type }, positions in ENU metres (glTF y up) about `origin`. */
  glb: Uint8Array;
  origin: Geodetic;
  /** True when the CRS heights are ellipsoidal (EPSG:4979 and the like); otherwise they are treated as MSL. */
  ellipsoidal: boolean;
  footprints: Array<Array<{ lat: number; lng: number }>>;
  objectCount: number;
}
