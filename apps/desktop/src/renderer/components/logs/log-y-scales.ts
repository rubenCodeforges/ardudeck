// How chart series are assigned to Y axes.
//
// Mission Planner's log browser keeps one axis per UNIT (AddYAxis(unit), reused
// via YAxisList.IndexOf(unit)), so every field measured in metres shares a
// scale and stays directly comparable. One axis per series looks tidy but makes
// two altitudes 5 mm apart render a fifth of the panel apart.

export type YMode = 'shared' | 'unit' | 'field';

export const Y_MODE_ORDER: YMode[] = ['unit', 'shared', 'field'];

export const Y_MODE_LABEL_KEY: Record<YMode, string> = {
  unit: 'logs:yMode.unit',
  shared: 'logs:yMode.shared',
  field: 'logs:yMode.field',
};

export const Y_MODE_TIP_KEY: Record<YMode, string> = {
  unit: 'logs:yMode.unitTip',
  shared: 'logs:yMode.sharedTip',
  field: 'logs:yMode.fieldTip',
};

/** Unit suffix the log's UNIT records leave on a series label, e.g. "Alt (m)". */
export function unitOfLabel(label: string): string | undefined {
  return /\(([^()]+)\)$/.exec(label)?.[1];
}

/** uPlot scale key a series rides under the given mode. */
export function scaleKeyFor(mode: YMode, label: string, index: number): string {
  if (mode === 'shared') return 'y';
  if (mode === 'field') return `y${index}`;
  return `u_${unitOfLabel(label) ?? ''}`;
}

/** Series indexes per scale key, in first-appearance order. */
export function groupSeriesByScale(mode: YMode, labels: string[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  labels.forEach((label, i) => {
    const key = scaleKeyFor(mode, label, i);
    const bucket = groups.get(key);
    if (bucket) bucket.push(i); else groups.set(key, [i]);
  });
  return groups;
}
