import type { en } from './en';

/**
 * Shape of a translation bundle: the exact key tree of the English source
 * bundle, with every leaf widened to `string`.
 *
 * `typeof en` cannot be used directly for other languages because `en` is
 * declared `as const`, which would pin each translated value to the English
 * literal type. Recursively mapping the leaf types keeps the key contract strict
 * (missing or extra keys still fail `tsc`) without constraining the text.
 */
export type TranslationBundle = {
  [K in keyof typeof en]: DeepWidenStrings<(typeof en)[K]>;
};

type DeepWidenStrings<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepWidenStrings<T[K]>;
};
