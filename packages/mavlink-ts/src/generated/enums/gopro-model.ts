export enum GoproModel {
  /** Unknown gopro model. */
  GOPRO_MODEL_UNKNOWN = 0,
  /** Hero 3+ Silver (HeroBus not supported by GoPro). */
  GOPRO_MODEL_HERO_3_PLUS_SILVER = 1,
  /** Hero 3+ Black. */
  GOPRO_MODEL_HERO_3_PLUS_BLACK = 2,
  /** Hero 4 Silver. */
  GOPRO_MODEL_HERO_4_SILVER = 3,
  /** Hero 4 Black. */
  GOPRO_MODEL_HERO_4_BLACK = 4,
}

/** @deprecated Use GoproModel instead */
export const GOPRO_MODEL = GoproModel;