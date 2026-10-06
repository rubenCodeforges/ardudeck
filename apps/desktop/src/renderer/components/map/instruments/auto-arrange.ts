/**
 * Port of the mobile smart-arrange engine (placement_semantics.dart + the
 * packer in instruments_layer.dart). The tables are a DATASET, not geometry:
 * tune layout behavior by editing the data, never the packer, and keep the
 * numbers in step with mobile. Desktop deviations: no shrink escalation (the
 * panel is big enough that any-free-spot + cascade covers overflow) and
 * chrome is measured by the caller instead of mobile's fixed toolbar band.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export const SECTOR_COLS = 6;
export const SECTOR_ROWS = 4;

export type InstrumentRole =
  | 'primaryFlight'
  | 'power'
  | 'navigation'
  | 'status'
  | 'command'
  | 'summary'
  | 'video';

export interface Align {
  x: number;
  y: number;
}

export interface InstrumentSemantics {
  role: InstrumentRole;
  /** 0-100; higher places first and therefore wins its ideal sectors. */
  priority: number;
  /** Ranked ideal sectors ('C4' style); earlier entries score higher. */
  idealSectors: string[];
  /** Variant-specific ideal sectors (a battery chip belongs in the top band). */
  variantSectors?: Record<string, string[]>;
  /** Instruments sharing a group get a cohesion bonus for clustering. */
  group?: string;
  /** Formation slot relative to the group's anchor (the attitude ball). */
  formationSide?: 'left' | 'right' | 'right2' | 'above';
  /** Precise ideal CENTER point; gives the sector plateaus a gradient. */
  idealAlign?: Align;
  variantAlign?: Record<string, Align>;
  /** Reads as a band rather than a card: belongs in the top strip row. */
  strip?: boolean;
  /** Variants that turn a card or gauge into a band. */
  stripVariants?: string[];
}

// Role -> 24 affinities (row-major), 0..9. Center stays ~0: the vehicle lives there.
export const ROLE_AFFINITY: Record<InstrumentRole, number[]> = {
  primaryFlight: [
    1, 1, 0, 0, 1, 0,
    2, 1, 0, 0, 1, 2,
    3, 2, 0, 0, 2, 3,
    2, 6, 9, 9, 6, 2,
  ],
  power: [
    1, 2, 2, 2, 3, 0,
    1, 1, 0, 0, 2, 3,
    2, 0, 0, 0, 5, 6,
    1, 3, 4, 4, 7, 8,
  ],
  navigation: [
    1, 1, 1, 1, 2, 0,
    2, 0, 0, 0, 2, 3,
    3, 0, 0, 0, 5, 6,
    2, 4, 5, 5, 7, 6,
  ],
  status: [
    8, 6, 4, 4, 3, 0,
    9, 2, 0, 0, 1, 2,
    8, 1, 0, 0, 1, 2,
    3, 1, 1, 1, 1, 1,
  ],
  command: [
    2, 0, 0, 0, 0, 0,
    9, 0, 0, 0, 0, 0,
    9, 0, 0, 0, 0, 1,
    9, 2, 1, 1, 1, 2,
  ],
  summary: [
    5, 8, 9, 9, 7, 0,
    2, 1, 0, 0, 1, 1,
    1, 1, 0, 0, 1, 1,
    4, 7, 9, 9, 7, 4,
  ],
  video: [
    3, 2, 1, 1, 2, 0,
    2, 0, 0, 0, 1, 4,
    2, 0, 0, 0, 2, 6,
    2, 1, 1, 2, 5, 9,
  ],
};

const CHIP_SECTORS = ['E1', 'D1'];
const CHIP_ALIGN: Align = { x: 0.6, y: -0.93 };

// Keyed by desktop registry id; shared ids carry the mobile entry verbatim.
export const INSTRUMENT_SEMANTICS: Record<string, InstrumentSemantics> = {
  controls: {
    role: 'command',
    priority: 100,
    idealSectors: ['A4'],
  },
  'in-flight-adjust': {
    role: 'command',
    priority: 70,
    idealSectors: ['A3', 'B4'],
  },
  attitude: {
    role: 'primaryFlight',
    priority: 90,
    idealSectors: ['C4', 'D4', 'C3'],
    group: 'basic-t',
    idealAlign: { x: 0, y: 0.9 },
  },
  'flight-mode': {
    role: 'status',
    priority: 88,
    idealSectors: ['A1', 'A2'],
    group: 'rail',
    strip: true,
    idealAlign: { x: -0.97, y: -0.93 },
  },
  battery: {
    role: 'power',
    priority: 85,
    idealSectors: ['F4', 'F3'],
    variantSectors: {
      numeric: CHIP_SECTORS,
      inline: CHIP_SECTORS,
      cell: CHIP_SECTORS,
      strip: CHIP_SECTORS,
    },
    group: 'nav',
    stripVariants: ['numeric', 'inline', 'strip'],
    idealAlign: { x: 0.95, y: 0.85 },
    variantAlign: { numeric: CHIP_ALIGN, inline: CHIP_ALIGN, cell: CHIP_ALIGN, strip: CHIP_ALIGN },
  },
  speed: {
    role: 'primaryFlight',
    priority: 80,
    idealSectors: ['B4', 'B3'],
    group: 'basic-t',
    formationSide: 'left',
    stripVariants: ['inline', 'strip'],
  },
  altitude: {
    role: 'primaryFlight',
    priority: 80,
    idealSectors: ['D4', 'E4'],
    group: 'basic-t',
    formationSide: 'right',
    stripVariants: ['inline', 'strip'],
  },
  link: {
    role: 'status',
    priority: 75,
    idealSectors: ['A2', 'A1'],
    group: 'rail',
    strip: true,
    stripVariants: ['inline', 'cell', 'strip'],
    idealAlign: { x: -0.97, y: -0.72 },
  },
  heading: {
    role: 'primaryFlight',
    priority: 70,
    idealSectors: ['D4', 'C4'],
    group: 'basic-t',
    formationSide: 'above',
    stripVariants: ['inline', 'strip'],
  },
  annunciator: {
    role: 'status',
    priority: 78,
    idealSectors: ['A2', 'A3'],
    group: 'rail',
    idealAlign: { x: -0.97, y: 0.1 },
  },
  gps: {
    role: 'navigation',
    priority: 65,
    idealSectors: ['F3', 'E3'],
    variantSectors: {
      numeric: ['C1', 'D1'],
      inline: ['C1', 'D1'],
      cell: ['C1', 'D1'],
      strip: ['C1', 'D1'],
    },
    group: 'nav',
    stripVariants: ['numeric', 'inline', 'strip'],
    idealAlign: { x: 0.95, y: 0.4 },
    variantAlign: {
      numeric: { x: 0.15, y: -0.93 },
      inline: { x: 0.15, y: -0.93 },
      cell: { x: 0.15, y: -0.93 },
      strip: { x: 0.15, y: -0.93 },
    },
  },
  tilt: {
    role: 'primaryFlight',
    priority: 90,
    idealSectors: ['C4', 'D4', 'C3'],
    group: 'basic-t',
    idealAlign: { x: 0, y: 0.9 },
  },
  steer: {
    role: 'primaryFlight',
    priority: 75,
    idealSectors: ['C4', 'B4'],
    group: 'basic-t',
    formationSide: 'left',
    stripVariants: ['inline', 'strip'],
  },
  xtrack: {
    role: 'navigation',
    priority: 58,
    idealSectors: ['E4', 'E3'],
    group: 'basic-t',
    formationSide: 'right2',
  },
  vsi: {
    role: 'primaryFlight',
    priority: 60,
    idealSectors: ['E4', 'E3'],
    group: 'basic-t',
    formationSide: 'right2',
    stripVariants: ['inline', 'strip'],
  },
  mission: {
    role: 'status',
    priority: 60,
    idealSectors: ['B1', 'C1'],
    idealAlign: { x: 0, y: -0.7 },
  },
  home: {
    role: 'navigation',
    priority: 55,
    idealSectors: ['E3', 'F3'],
    group: 'nav',
    stripVariants: ['inline', 'strip'],
    idealAlign: { x: 0.95, y: 0.15 },
  },
  'flight-data': {
    role: 'status',
    priority: 50,
    idealSectors: ['A3', 'A2'],
    group: 'rail',
    idealAlign: { x: -0.97, y: 0.45 },
  },
  // Desktop-only: RTK strip joins the left status rail below the link strip,
  // same reasoning as 'link' (a status band, scanned not operated).
  rtk: {
    role: 'status',
    priority: 62,
    idealSectors: ['A2', 'A1'],
    group: 'rail',
    strip: true,
    idealAlign: { x: -0.97, y: -0.5 },
  },
};

// Fixed-monitor battery gauges (battery2..battery9) stack up the right power
// column beside the primary battery gauge; generated, same dataset spirit.
for (let i = 2; i <= 9; i++) {
  INSTRUMENT_SEMANTICS[`battery${i}`] = {
    role: 'power',
    priority: 86 - i,
    idealSectors: ['F3', 'F4'],
    group: 'nav',
    idealAlign: { x: 0.95, y: Math.max(-0.6, 0.85 - (i - 1) * 0.23) },
  };
}

const FALLBACK_SEMANTICS: InstrumentSemantics = {
  role: 'status',
  priority: 30,
  idealSectors: [],
};

export function semanticsOf(id: string): InstrumentSemantics {
  return INSTRUMENT_SEMANTICS[id] ?? FALLBACK_SEMANTICS;
}

export function sectorsFor(sem: InstrumentSemantics, variant: string): string[] {
  return sem.variantSectors?.[variant] ?? sem.idealSectors;
}

export function alignFor(sem: InstrumentSemantics, variant: string): Align | undefined {
  return sem.variantAlign?.[variant] ?? sem.idealAlign;
}

export function stripFor(sem: InstrumentSemantics, variant: string): boolean {
  return sem.strip === true || (sem.stripVariants?.includes(variant) ?? false);
}

export function alignPoint(panel: Size, a: Align): { x: number; y: number } {
  return { x: ((1 + a.x) / 2) * panel.w, y: ((1 + a.y) / 2) * panel.h };
}

export function sectorIndexOf(name: string): number | null {
  if (name.length !== 2) return null;
  const col = name.charCodeAt(0) - 0x41;
  const row = name.charCodeAt(1) - 0x31;
  if (col < 0 || col >= SECTOR_COLS || row < 0 || row >= SECTOR_ROWS) return null;
  return row * SECTOR_COLS + col;
}

function sectorAt(panel: Size, px: number, py: number): number {
  const col = Math.min(SECTOR_COLS - 1, Math.max(0, Math.floor(px / (panel.w / SECTOR_COLS))));
  const row = Math.min(SECTOR_ROWS - 1, Math.max(0, Math.floor(py / (panel.h / SECTOR_ROWS))));
  return row * SECTOR_COLS + col;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by };
}

function center(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Mean affinity over five sample points, so a rect is scored by what it covers.
export function sectorScore(panel: Size, role: InstrumentRole, idealSectors: string[], rect: Rect): number {
  const affinity = ROLE_AFFINITY[role];
  const boosts = new Map<number, number>();
  idealSectors.forEach((name, i) => {
    const idx = sectorIndexOf(name);
    if (idx !== null) boosts.set(idx, i === 0 ? 6 : i === 1 ? 4 : i === 2 ? 2 : 1);
  });
  const samples = [
    center(rect),
    { x: rect.x + rect.w * 0.25, y: rect.y + rect.h * 0.25 },
    { x: rect.x + rect.w * 0.75, y: rect.y + rect.h * 0.25 },
    { x: rect.x + rect.w * 0.25, y: rect.y + rect.h * 0.75 },
    { x: rect.x + rect.w * 0.75, y: rect.y + rect.h * 0.75 },
  ];
  let sum = 0;
  for (const p of samples) {
    const s = sectorAt(panel, p.x, p.y);
    sum += (affinity[s] ?? 0) + (boosts.get(s) ?? 0);
  }
  return sum / samples.length;
}

// Formation slot center relative to the group anchor (the attitude ball).
export function formationTarget(side: string, anchor: Rect, size: Size): { x: number; y: number } {
  const gap = 8;
  const c = center(anchor);
  switch (side) {
    case 'left':
      return { x: anchor.x - gap - size.w / 2, y: c.y };
    case 'right':
      return { x: anchor.x + anchor.w + gap + size.w / 2, y: c.y };
    case 'right2':
      return { x: anchor.x + anchor.w + gap * 2 + size.w * 1.6, y: c.y };
    case 'above':
      return { x: c.x, y: anchor.y - gap - size.h / 2 };
    default:
      return c;
  }
}

// Wide and short enough to read as a band rather than a card.
export function isStripShaped(size: Size): boolean {
  return size.h > 0 && size.w / size.h >= 3.2;
}

export interface PlacementQuery {
  panel: Size;
  size: Size;
  role: InstrumentRole;
  idealSectors: string[];
  blocked: Rect[];
  buddies?: Rect[];
  anchorTarget?: { x: number; y: number } | null;
  idealPoint?: { x: number; y: number } | null;
  minScore?: number;
  top?: number;
  bottom?: number;
  step?: number;
  strip?: boolean;
}

// Best free position by semantic score; null = nothing clears minScore (caller escalates).
export function bestPlacement(q: PlacementQuery): { pos: { x: number; y: number }; score: number } | null {
  const top = q.top ?? 8;
  const bottom = q.bottom ?? 16;
  const step = q.step ?? 16;
  const maxX = q.panel.w - 8 - q.size.w;
  const maxY = q.panel.h - bottom - q.size.h;
  if (maxX < 8 || maxY < top) return null;

  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  let bestBase = 0;
  for (let y = top; y <= maxY; y += step) {
    for (let x = 8; x <= maxX; x += step) {
      const rect: Rect = { x, y, w: q.size.w, h: q.size.h };
      let free = true;
      for (const b of q.blocked) {
        if (overlaps(rect, inflate(b, 4))) {
          free = false;
          break;
        }
      }
      if (!free) continue;
      // With a precise ideal point the ranked-sector boosts are noise: their
      // stepped plateaus fight the smooth pull.
      const base = sectorScore(q.panel, q.role, q.idealPoint == null ? q.idealSectors : [], rect);
      let score = base;
      if (q.anchorTarget) {
        // Formation pull dominates near the slot (up to +12), gone by ~360px.
        score += Math.max(0, 12 - dist(center(rect), q.anchorTarget) / 30);
      } else {
        if (q.idealPoint) {
          score += Math.max(0, 6 * (1 - dist(center(rect), q.idealPoint) / 280));
        }
        // Strips want the row under the toolbar, not a band across the map.
        if (q.strip || isStripShaped(q.size)) {
          score += Math.max(0, 8 * (1 - (rect.y - top) / 200));
        }
        const buddies = q.buddies ?? [];
        if (buddies.length > 0) {
          let nearest = Infinity;
          for (const b of buddies) nearest = Math.min(nearest, dist(center(rect), center(b)));
          score += Math.max(0, 3.5 - nearest / 120);
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestBase = base;
        best = { x, y };
      }
    }
  }
  if (!best) return null;
  // The floor judges the SPOT (sector affinity), not the pull-inflated total.
  // Formation members are exempt: sitting beside the ball IS their slot.
  if (!q.anchorTarget && bestBase < (q.minScore ?? -Infinity)) return null;
  return { pos: best, score: bestScore };
}

export interface ArrangeItem {
  id: string;
  size: Size;
  variant: string;
  /** Overrides the id lookup; used for docked groups, whose synthetic ids
   * have no registry entry. */
  sem?: InstrumentSemantics;
}

/** A docked group inherits its strongest member's placement semantics, minus
 * the formation slot (the group's size no longer fits the slot geometry). */
export function groupSemantics(memberIds: string[]): InstrumentSemantics {
  let best = FALLBACK_SEMANTICS;
  for (const id of memberIds) {
    const sem = semanticsOf(id);
    if (sem.priority > best.priority) best = sem;
  }
  const { formationSide: _formationSide, ...rest } = best;
  return rest;
}

export interface ArrangeResult {
  placements: Map<string, { x: number; y: number }>;
  cascaded: string[];
}

const EYE_CORNER = 56;
const LEFT_EDGE = 8;
const GAP = 8;

// Pins controls bottom-left, blocks eye corner + chrome, then places by
// priority: sector affinity + formation pull + group cohesion. Overflow
// escalates to any-free-spot, then a visible cascade.
export function computeArrangement(items: ArrangeItem[], panel: Size, chrome: Rect[], contentTop = 8): ArrangeResult {
  const placements = new Map<string, { x: number; y: number }>();
  const cascaded: string[] = [];
  if (items.length === 0) return { placements, cascaded };

  const sizes = new Map(items.map((i) => [i.id, i.size]));
  const variants = new Map(items.map((i) => [i.id, i.variant]));
  const sems = new Map(items.map((i) => [i.id, i.sem ?? semanticsOf(i.id)]));
  const semOf = (id: string): InstrumentSemantics => sems.get(id) ?? FALLBACK_SEMANTICS;
  const bottomLimit = panel.h - 16;

  const eyeCorner: Rect = { x: panel.w - EYE_CORNER, y: 0, w: EYE_CORNER, h: EYE_CORNER };
  const blocked: Rect[] = [eyeCorner, ...chrome];

  // Pin: the flight-control card lives bottom-left, thumb/mouse reachable.
  const controlsSize = sizes.get('controls');
  if (controlsSize) {
    const pos = { x: LEFT_EDGE, y: Math.max(contentTop, bottomLimit - controlsSize.h) };
    placements.set('controls', pos);
    blocked.push({ x: pos.x, y: pos.y, w: controlsSize.w, h: controlsSize.h });
  }

  // Priority order; ties break by area (big first packs tighter) then input
  // order (deterministic).
  const order = items
    .filter((i) => i.id !== 'controls')
    .map((i, idx) => ({ i, idx }))
    .sort((a, b) => {
      const p = semOf(b.i.id).priority - semOf(a.i.id).priority;
      if (p !== 0) return p;
      const areaA = a.i.size.w * a.i.size.h;
      const areaB = b.i.size.w * b.i.size.h;
      return areaB - areaA !== 0 ? areaB - areaA : a.idx - b.idx;
    })
    .map((e) => e.i);

  const groupRects = new Map<string, Rect[]>();
  const leftovers: string[] = [];
  let tAnchor: Rect | null = null;

  for (const item of order) {
    const sem = semOf(item.id);
    const variant = variants.get(item.id) ?? 'analog';
    const size = sizes.get(item.id)!;
    const target = sem.formationSide && tAnchor ? formationTarget(sem.formationSide, tAnchor, size) : null;
    const align = alignFor(sem, variant);
    const res = bestPlacement({
      panel,
      size,
      role: sem.role,
      // A formation member's position is defined by its anchor; its own
      // sector boost would fight the slot.
      idealSectors: target ? [] : sectorsFor(sem, variant),
      blocked,
      buddies: sem.group ? groupRects.get(sem.group) ?? [] : [],
      anchorTarget: target,
      idealPoint: !target && align ? alignPoint(panel, align) : null,
      strip: stripFor(sem, variant),
      // Below this the only free spots are map-critical: escalate instead.
      minScore: 0.75,
      top: contentTop,
    });
    if (!res) {
      leftovers.push(item.id);
      continue;
    }
    placements.set(item.id, res.pos);
    const r: Rect = { x: res.pos.x, y: res.pos.y, w: size.w, h: size.h };
    blocked.push(r);
    if (item.id === 'attitude') tAnchor = r;
    if (sem.group) {
      const list = groupRects.get(sem.group) ?? [];
      list.push(r);
      groupRects.set(sem.group, list);
    }
  }

  // Escalation: take the best free spot regardless of score (a fringe spot
  // beats a cascade pile).
  const unplaceable: string[] = [];
  for (const id of leftovers) {
    const sem = semOf(id);
    const variant = variants.get(id) ?? 'analog';
    const size = sizes.get(id)!;
    const align = alignFor(sem, variant);
    const res = bestPlacement({
      panel,
      size,
      role: sem.role,
      idealSectors: sectorsFor(sem, variant),
      blocked,
      idealPoint: align ? alignPoint(panel, align) : null,
      top: contentTop,
      strip: stripFor(sem, variant),
    });
    if (!res) {
      unplaceable.push(id);
      continue;
    }
    placements.set(id, res.pos);
    blocked.push({ x: res.pos.x, y: res.pos.y, w: size.w, h: size.h });
  }

  // Physics said no: visible corner cascade for the remainder.
  let step = 0;
  for (const id of unplaceable) {
    placements.set(id, { x: LEFT_EDGE + 28 * step, y: contentTop + GAP + 28 * step });
    cascaded.push(id);
    step++;
  }

  return { placements, cascaded };
}

// Mirror of useDraggableOverlay's v4 anchor rule; must stay in step with it
// or arranged positions shift on the next remount.

export const EDGE_SNAP_PX = 140;
export const ANCHOR_RULE_VERSION = 4;

export interface AnchorPayload {
  ax: 'left' | 'center' | 'right';
  ay: 'top' | 'middle' | 'bottom';
  dx: number;
  dy: number;
  v: number;
}

export function toAnchorPayload(panel: Size, size: Size, pos: { x: number; y: number }): AnchorPayload {
  const cx = pos.x + size.w / 2;
  const cy = pos.y + size.h / 2;

  const leftDist = pos.x;
  const rightDist = panel.w - size.w - pos.x;
  let ax: AnchorPayload['ax'];
  let dx: number;
  if (leftDist <= EDGE_SNAP_PX && leftDist <= rightDist) {
    ax = 'left';
    dx = leftDist;
  } else if (rightDist <= EDGE_SNAP_PX) {
    ax = 'right';
    dx = rightDist;
  } else {
    ax = 'center';
    dx = cx - panel.w / 2;
  }

  const topDist = pos.y;
  const bottomDist = panel.h - size.h - pos.y;
  let ay: AnchorPayload['ay'];
  let dy: number;
  if (topDist <= EDGE_SNAP_PX && topDist <= bottomDist) {
    ay = 'top';
    dy = topDist;
  } else if (bottomDist <= EDGE_SNAP_PX) {
    ay = 'bottom';
    dy = bottomDist;
  } else {
    ay = 'middle';
    dy = cy - panel.h / 2;
  }

  return { ax, ay, dx, dy, v: ANCHOR_RULE_VERSION };
}
