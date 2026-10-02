export type NonDefaultColorKey =
  | 'orange'
  | 'cyan'
  | 'amber'
  | 'violet'
  | 'pink'
  | 'red'
  | 'green'
  | 'blue';

export interface NonDefaultColor {
  key: NonDefaultColorKey;
  label: string;
  labelKey: string;
  /** Tailwind class for the colored value text (light + dark variants tuned for contrast). */
  textClass: string;
  /** Solid swatch background, used in the picker chips and the toolbar swatch dot. */
  swatchClass: string;
}

export const NON_DEFAULT_COLORS: readonly NonDefaultColor[] = [
  { key: 'orange', label: 'Orange (QGC)', labelKey: 'parameters:nonDefaultPalette.orange', textClass: 'text-orange-600 dark:text-orange-400', swatchClass: 'bg-orange-500' }, // i18n-exempt
  { key: 'cyan',   label: 'Cyan (AMC)',   labelKey: 'parameters:nonDefaultPalette.cyan', textClass: 'text-cyan-700 dark:text-cyan-300',     swatchClass: 'bg-cyan-500'   }, // i18n-exempt
  { key: 'amber',  label: 'Amber',        labelKey: 'parameters:nonDefaultPalette.amber', textClass: 'text-amber-600 dark:text-amber-400',   swatchClass: 'bg-amber-500'  }, // i18n-exempt
  { key: 'violet', label: 'Violet',       labelKey: 'parameters:nonDefaultPalette.violet', textClass: 'text-violet-700 dark:text-violet-300', swatchClass: 'bg-violet-500' }, // i18n-exempt
  { key: 'pink',   label: 'Pink',         labelKey: 'parameters:nonDefaultPalette.pink', textClass: 'text-pink-600 dark:text-pink-400',     swatchClass: 'bg-pink-500'   }, // i18n-exempt
  { key: 'red',    label: 'Red',          labelKey: 'parameters:nonDefaultPalette.red', textClass: 'text-red-600 dark:text-red-400',       swatchClass: 'bg-red-500'    }, // i18n-exempt
  { key: 'green',  label: 'Green',        labelKey: 'parameters:nonDefaultPalette.green', textClass: 'text-green-600 dark:text-green-400',   swatchClass: 'bg-green-500'  }, // i18n-exempt
  { key: 'blue',   label: 'Blue',         labelKey: 'parameters:nonDefaultPalette.blue', textClass: 'text-blue-600 dark:text-blue-400',     swatchClass: 'bg-blue-500'   }, // i18n-exempt
] as const;

export const DEFAULT_NON_DEFAULT_COLOR: NonDefaultColorKey = 'orange';

export function getNonDefaultColor(key: NonDefaultColorKey | undefined): NonDefaultColor {
  return NON_DEFAULT_COLORS.find(c => c.key === key) ?? NON_DEFAULT_COLORS[0]!;
}
