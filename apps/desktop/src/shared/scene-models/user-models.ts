import type { SceneAltitudeMode, SceneName } from '@ardudeck/module-sdk';

/** Scene meshes the pilot added are registered under this slug, next to cargo meshes. */
export const USER_MODELS_SLUG = 'user';

export type UserModelFormat = 'gltf' | 'kmz' | 'tileset' | 'cityjson' | 'pointcloud';

export interface UserModelPlacement {
  lat: number;
  lng: number;
  /** EGM96 metres for 'amsl', metres above the ground for 'agl', ignored for 'clamp'. */
  alt: number;
  altitudeMode: SceneAltitudeMode;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  scale: number;
}

export interface UserModel {
  id: string;
  name: string;
  format: UserModelFormat;
  /** Absolute path of what the scenes load: .glb/.gltf/.dae, tileset.json, the glb converted from CityJSON, or a point cloud .ply. */
  entryPath: string;
  /** Points a point cloud shows (after thinning). */
  pointCount?: number;
  /** Points in the source file, when it was thinned. */
  sourcePointCount?: number;
  placement: UserModelPlacement;
  /** 'data' when the file or its table carried the position; 'manual' when the pilot placed it. */
  placedBy: 'data' | 'manual';
  /** 'library' models live in userData; 'watch' models come from a watched folder and follow its table. */
  origin: 'library' | 'watch';
  /** The watched folder a 'watch' model belongs to. */
  watchDir?: string;
  footprints?: Array<Array<{ lat: number; lng: number }>>;
  scenes?: SceneName[];
  visible: boolean;
  version: number;
  importedAt: number;
}

export interface UserModelImportResult {
  imported: UserModel[];
  /** Files that could not be read or placed, with a pilot-facing reason. */
  failed: Array<{ file: string; error: string }>;
  /** Imported without a position in the data: placed at `dropAt` (or the map centre) for the pilot to nudge. */
  needsPlacement: string[];
  /** Imported, but worth a look: e.g. placed with a coordinate system fetched from epsg.io whose datum shift is unverified. */
  warnings?: Array<{ file: string; message: string }>;
}

export interface UserModelImportRequest {
  /** Files to import; empty opens the file picker. */
  paths?: string[];
  /** Where a file without its own position is placed (a map drop point, or the map centre). */
  dropAt?: { lat: number; lng: number };
}

/** The preload surface the renderer uses (window.electronAPI.userModels). */
export interface UserModelsApi {
  list(): Promise<UserModel[]>;
  import(req: UserModelImportRequest): Promise<UserModelImportResult>;
  update(id: string, patch: Partial<Pick<UserModel, 'name' | 'placement' | 'visible' | 'scenes'>>): Promise<UserModel | null>;
  remove(id: string): Promise<boolean>;
  listWatched(): Promise<string[]>;
  /** Watch a folder holding models plus models.json / a CSV / a GeoJSON table; empty opens a folder picker. */
  addWatched(dir?: string): Promise<{ dir: string | null; error?: string }>;
  removeWatched(dir: string): Promise<boolean>;
  onChanged(cb: (models: UserModel[]) => void): () => void;
  /** The real path of a dropped File (Electron webUtils). */
  pathForFile(file: File): string;
}
