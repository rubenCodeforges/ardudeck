/**
 * Formation shape glyphs - tiny tactical pictograms (dots arranged like the real
 * formation, leader dot emphasised) used by the rail glyph bar and the right-click
 * menu. One click on a glyph applies that shape instantly; the SVG is the whole UI,
 * so there is no dropdown and no separate Apply step.
 *
 * `value` is sent verbatim to the orchestrator (formation::Shape::from_str), so the
 * set here mirrors the orchestrator's heading-relative geometry.
 */

export interface ShapeDef {
  value: string;
  labelKey: string;
  /** Preset spacing (m) auto-applied when this shape is picked. */
  spacing?: number;
  /** Dot positions in a 0..24 viewBox. */
  dots: Array<[number, number]>;
  /** Index of the leader dot (drawn larger / brighter), if any. */
  leader?: number;
}

export const SHAPE_OPTIONS: ShapeDef[] = [
  { value: 'vee', labelKey: 'fleet:formationGlyphs.vee', leader: 0, dots: [[12, 5], [7, 11], [17, 11], [3, 18], [21, 18]] },
  { value: 'line', labelKey: 'fleet:formationGlyphs.line', dots: [[3, 12], [9.5, 12], [14.5, 12], [21, 12]] },
  { value: 'column', labelKey: 'fleet:formationGlyphs.column', leader: 0, dots: [[12, 3], [12, 9.5], [12, 16], [12, 21]] },
  { value: 'echelonRight', labelKey: 'fleet:formationGlyphs.echelonRight', leader: 0, dots: [[4, 4], [10, 10], [16, 16], [21, 21]] },
  { value: 'echelonLeft', labelKey: 'fleet:formationGlyphs.echelonLeft', leader: 0, dots: [[20, 4], [14, 10], [8, 16], [3, 21]] },
  { value: 'diamond', labelKey: 'fleet:formationGlyphs.diamond', leader: 0, dots: [[12, 3], [4, 12], [20, 12], [12, 21]] },
  { value: 'box', labelKey: 'fleet:formationGlyphs.box', dots: [[8, 8], [16, 8], [8, 16], [16, 16]] },
  { value: 'survey', labelKey: 'fleet:formationGlyphs.survey', spacing: 40, dots: [[3, 9], [10, 9], [17, 9], [22, 9]] },
];

export const SHAPE_BY_VALUE = new Map(SHAPE_OPTIONS.map((o) => [o.value, o]));

/** A single formation pictogram. Colour follows currentColor so the caller themes it. */
export function FormationGlyph({ shape, size = 20 }: { shape: string; size?: number }): JSX.Element | null {
  const def = SHAPE_BY_VALUE.get(shape);
  if (!def) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {def.dots.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === def.leader ? 2.6 : 1.9}
          fill="currentColor"
          opacity={i === def.leader ? 1 : 0.7}
        />
      ))}
      {shape === 'survey' && (
        <path
          d="M3 15 H21 M3 15 l2.5 -1.8 M3 15 l2.5 1.8 M21 15 l-2.5 -1.8 M21 15 l-2.5 1.8"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.55"
        />
      )}
    </svg>
  );
}

/** The "scatter / break formation" glyph - dots diverging out of the centre. */
export function ScatterGlyph({ size = 20 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {([[5, 5], [19, 5], [5, 19], [19, 19]] as Array<[number, number]>).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.9" fill="currentColor" opacity="0.85" />
      ))}
      <path
        d="M12 12 L6.5 6.5 M12 12 L17.5 6.5 M12 12 L6.5 17.5 M12 12 L17.5 17.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}
