export enum GoproResolution {
  /** 848 x 480 (480p). */
  GOPRO_RESOLUTION_480p = 0,
  /** 1280 x 720 (720p). */
  GOPRO_RESOLUTION_720p = 1,
  /** 1280 x 960 (960p). */
  GOPRO_RESOLUTION_960p = 2,
  /** 1920 x 1080 (1080p). */
  GOPRO_RESOLUTION_1080p = 3,
  /** 1920 x 1440 (1440p). */
  GOPRO_RESOLUTION_1440p = 4,
  /** 2704 x 1440 (2.7k-17:9). */
  GOPRO_RESOLUTION_2_7k_17_9 = 5,
  /** 2704 x 1524 (2.7k-16:9). */
  GOPRO_RESOLUTION_2_7k_16_9 = 6,
  /** 2704 x 2028 (2.7k-4:3). */
  GOPRO_RESOLUTION_2_7k_4_3 = 7,
  /** 3840 x 2160 (4k-16:9). */
  GOPRO_RESOLUTION_4k_16_9 = 8,
  /** 4096 x 2160 (4k-17:9). */
  GOPRO_RESOLUTION_4k_17_9 = 9,
  /** 1280 x 720 (720p-SuperView). */
  GOPRO_RESOLUTION_720p_SUPERVIEW = 10,
  /** 1920 x 1080 (1080p-SuperView). */
  GOPRO_RESOLUTION_1080p_SUPERVIEW = 11,
  /** 2704 x 1520 (2.7k-SuperView). */
  GOPRO_RESOLUTION_2_7k_SUPERVIEW = 12,
  /** 3840 x 2160 (4k-SuperView). */
  GOPRO_RESOLUTION_4k_SUPERVIEW = 13,
}

/** @deprecated Use GoproResolution instead */
export const GOPRO_RESOLUTION = GoproResolution;