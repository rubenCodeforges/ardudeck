/**
 * Icon vocabulary for flight modes. Every mode ArduDeck lists has its own
 * glyph (matched by NAME so it works across vehicle classes); the group icon
 * is only a fallback for unknown/custom mode numbers. Q-variants deliberately
 * share their fixed-wing sibling's glyph (QLoiter = Loiter) since they are the
 * same behaviour in VTOL dress. Land / Takeoff / Loiter / Guided use the same
 * lucide glyphs as the map command card so the vocabulary is app-wide.
 */

import {
  Joystick, Shield, Route, Home, Wrench, Zap, Anchor, Crosshair, Octagon,
  MoveVertical, MousePointer2, MousePointerClick, RotateCw, RotateCcw, Radar,
  ArrowDownToLine, ArrowUpFromLine, Wind, GraduationCap, Ship, Gauge, Waves,
  FlipVertical, Move, Send, Spline, Activity, LifeBuoy, ShieldAlert,
  ShieldCheck, Undo2, CornerUpLeft, Compass, CircleDot, Flame, Feather, Hammer,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FlightModeMeta, ModeGroup } from '../../../../shared/flight-mode-meta';

export const GROUP_ICON: Record<ModeGroup, LucideIcon> = {
  manual: Joystick,
  assisted: Shield,
  auto: Route,
  return: Home,
  tuning: Wrench,
};

const MODE_ICON: Record<string, LucideIcon> = {
  // manual / acro (Stabilize is leveled stick-flying: distinct from raw Manual,
  // which matters on planes where both appear in the same list)
  Manual: Joystick,
  Stabilize: Feather,
  QStabilize: Feather,
  Acro: Zap,
  QAcro: Zap,
  Sport: Gauge,
  Drift: Waves,
  Flip: FlipVertical,
  Training: GraduationCap,
  Steering: Compass,
  Simple: CircleDot,
  // assisted holds
  AltHold: MoveVertical,
  QHover: MoveVertical,
  Loiter: Anchor,
  QLoiter: Anchor,
  PosHold: Crosshair,
  FlowHold: Move,
  Brake: Octagon,
  Hold: Octagon,
  FlyByWireA: Shield,
  FlyByWireB: ShieldCheck,
  Cruise: Wind,
  Thermal: Flame,
  // autonomous / nav
  Auto: Route,
  Guided: MousePointer2,
  Guided_NoGPS: MousePointerClick,
  Circle: RotateCw,
  Follow: Radar,
  ZigZag: Spline,
  Dock: Ship,
  Takeoff: ArrowUpFromLine,
  Throw: Send,
  'Avoid ADSB': ShieldAlert,
  // return & land (Land matches the map command card's Land tile)
  RTL: Home,
  QRTL: Home,
  'Smart RTL': Undo2,
  'Auto RTL': CornerUpLeft,
  Land: ArrowDownToLine,
  QLand: ArrowDownToLine,
  'Loiter to QLand': RotateCcw,
  Autorotate: LifeBuoy,
  // tuning
  AutoTune: Wrench,
  QAutotune: Hammer,
  SystemID: Activity,
};

export function modeIcon(meta: FlightModeMeta): LucideIcon {
  return MODE_ICON[meta.name] ?? GROUP_ICON[meta.group];
}
