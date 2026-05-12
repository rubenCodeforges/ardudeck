/**
 * Camera Presets for Survey Planning
 * Common survey camera sensor specifications
 */
import type { CameraPreset } from './survey-types';

export interface CameraPresetGroup {
  group: string;
  presets: CameraPreset[];
}

export const CAMERA_PRESET_GROUPS: CameraPresetGroup[] = [
  {
    group: 'DJI',
    presets: [
      { name: 'DJI Mavic 3E', sensorWidth: 17.3, sensorHeight: 13, imageWidth: 5280, imageHeight: 3956, focalLength: 12.3 },
      { name: 'DJI Phantom 4 RTK', sensorWidth: 13.2, sensorHeight: 8.8, imageWidth: 5472, imageHeight: 3648, focalLength: 8.8 },
      { name: 'DJI Zenmuse P1 (35mm)', sensorWidth: 35.9, sensorHeight: 24, imageWidth: 8192, imageHeight: 5460, focalLength: 35 },
      { name: 'DJI Zenmuse P1 (50mm)', sensorWidth: 35.9, sensorHeight: 24, imageWidth: 8192, imageHeight: 5460, focalLength: 50 },
      { name: 'DJI Zenmuse L2', sensorWidth: 17.3, sensorHeight: 13, imageWidth: 5280, imageHeight: 3956, focalLength: 12.3 },
      { name: 'DJI Mini 4 Pro', sensorWidth: 9.7, sensorHeight: 7.3, imageWidth: 4032, imageHeight: 3024, focalLength: 6.7 },
      { name: 'DJI Air 3', sensorWidth: 9.7, sensorHeight: 7.3, imageWidth: 4032, imageHeight: 3024, focalLength: 6.7 },
      { name: 'DJI Mavic 3 Pro', sensorWidth: 17.3, sensorHeight: 13, imageWidth: 5280, imageHeight: 3956, focalLength: 12.3 },
    ],
  },
  {
    group: 'Sony',
    presets: [
      { name: 'Sony A7R IV', sensorWidth: 35.7, sensorHeight: 23.8, imageWidth: 9504, imageHeight: 6336, focalLength: 35 },
      { name: 'Sony RX1R II', sensorWidth: 35.9, sensorHeight: 24, imageWidth: 7952, imageHeight: 5304, focalLength: 35 },
      { name: 'Sony A6400', sensorWidth: 23.5, sensorHeight: 15.6, imageWidth: 6000, imageHeight: 4000, focalLength: 20 },
    ],
  },
  {
    group: 'GoPro',
    presets: [
      { name: 'GoPro Hero 12', sensorWidth: 6.17, sensorHeight: 4.55, imageWidth: 5568, imageHeight: 4176, focalLength: 3 },
      { name: 'GoPro Hero 11', sensorWidth: 6.17, sensorHeight: 4.55, imageWidth: 5568, imageHeight: 4176, focalLength: 3 },
    ],
  },
  {
    group: 'Multispectral',
    presets: [
      { name: 'MicaSense RedEdge-P', sensorWidth: 5.28, sensorHeight: 3.96, imageWidth: 1456, imageHeight: 1088, focalLength: 5.5 },
      { name: 'MicaSense Altum-PT', sensorWidth: 8.7, sensorHeight: 6.52, imageWidth: 4112, imageHeight: 3008, focalLength: 8 },
    ],
  },
  {
    group: 'Other',
    presets: [
      { name: 'senseFly S.O.D.A.', sensorWidth: 23.5, sensorHeight: 15.7, imageWidth: 5472, imageHeight: 3648, focalLength: 10.6 },
      { name: 'senseFly Aeria X', sensorWidth: 23.5, sensorHeight: 15.7, imageWidth: 6000, imageHeight: 4000, focalLength: 18.5 },
      { name: 'Phase One iXM-100', sensorWidth: 43.9, sensorHeight: 32.9, imageWidth: 11664, imageHeight: 8750, focalLength: 50 },
    ],
  },
];

// Flat list for searching
export const ALL_CAMERA_PRESETS: CameraPreset[] = CAMERA_PRESET_GROUPS.flatMap(g => g.presets);

// Custom camera default (user fills in)
export const CUSTOM_CAMERA: CameraPreset = {
  name: 'Custom',
  sensorWidth: 13.2,
  sensorHeight: 8.8,
  imageWidth: 4000,
  imageHeight: 3000,
  focalLength: 8.8,
};

// Manual corridor width — for non-camera surveys (e.g. ArduRover lawnmower).
// Sensor/image fields are placeholders; survey math uses manualCorridorWidth.
export const MANUAL_CAMERA: CameraPreset = {
  name: 'Manual',
  sensorWidth: 0,
  sensorHeight: 0,
  imageWidth: 0,
  imageHeight: 0,
  focalLength: 0,
  manualCorridorWidth: 1.5, // 1.5 m default — typical residential mower deck
};
