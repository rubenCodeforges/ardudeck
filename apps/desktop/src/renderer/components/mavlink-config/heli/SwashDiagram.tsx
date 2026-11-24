import React from 'react';
import { useTranslation } from 'react-i18next';
import { channelsForFunction } from './heli-utils';

type Get = (key: string) => number | undefined;

export interface SwashServo {
  /** SERVOn_FUNCTION driving it */
  fn: number;
  /** Degrees clockwise from the nose; null = the H1 collective servo, drawn at the shaft */
  angle: number | null;
  label: string;
}

// Angles from ArduPilot's AP_MotorsHeli_Swash; servo 4 of an H4 swash is Motor5 (Motor4 is the tail)
export function swashServos(type: number, get: Get, t: (k: string) => string): SwashServo[] {
  switch (type) {
    case 0:
      return [1, 2, 3].map((i) => ({ fn: 32 + i, angle: get(`H_SW_H3_SV${i}_POS`) ?? [-60, 60, 180][i - 1]!, label: String(i) }));
    case 1:
      return [
        { fn: 33, angle: -90, label: t('mavlink-config:heli.diagram.roll') },
        { fn: 34, angle: 0, label: t('mavlink-config:heli.diagram.pitch') },
        { fn: 35, angle: null, label: t('mavlink-config:heli.diagram.collective') },
      ];
    case 2:
      return [{ fn: 33, angle: -45, label: '1' }, { fn: 34, angle: 45, label: '2' }, { fn: 35, angle: 180, label: '3' }];
    case 4:
      return [{ fn: 33, angle: -90, label: '1' }, { fn: 34, angle: 90, label: '2' }, { fn: 35, angle: 180, label: '3' }, { fn: 37, angle: 0, label: '4' }];
    case 5:
      return [{ fn: 33, angle: -45, label: '1' }, { fn: 34, angle: 45, label: '2' }, { fn: 35, angle: -135, label: '3' }, { fn: 37, angle: 135, label: '4' }];
    default:
      return [{ fn: 33, angle: -60, label: '1' }, { fn: 34, angle: 60, label: '2' }, { fn: 35, angle: 180, label: '3' }];
  }
}

const W = 340;
const H = 470;
const CX = W / 2;
const CY = 168;
const DISC_R = 150;
const SWASH_R = 46;
const SERVO_R = 92;
const SERVO = 'rgb(56, 189, 248)';
const TAIL = 'rgb(167, 139, 250)';
const MISSING = 'var(--text-tertiary)';

function ValuePill({ x, y, text, color }: { x: number; y: number; text: string; color: string }) {
  const w = 58;
  return (
    <g pointerEvents="none">
      <rect x={x - w / 2} y={y} width={w} height={18} rx={9} fill="var(--bg-surface-raised)" stroke={color} strokeOpacity={0.45} />
      <text x={x} y={y + 13} textAnchor="middle" fontSize={11} fontFamily="monospace" fill={color}>{text}</text>
    </g>
  );
}

/** Top-down helicopter: rotor disc, fuselage, swashplate with its servos at their real angles, boom and tail rotor. */
export function SwashDiagram({ get, outputs }: { get: Get; outputs: number[] | undefined }) {
  const { t } = useTranslation();
  const servos = swashServos(get('H_SW_TYPE') ?? 3, get, t);
  const out = (fn: number) => {
    const ch = channelsForFunction(fn, get, 16)[0];
    return { ch, pwm: ch ? outputs?.[ch - 1] : undefined };
  };
  const tail = out(36);
  const boomTop = CY + 122;
  const tailY = H - 52;
  const pwmText = (pwm: number | undefined) => (pwm ? `${pwm} µs` : '-');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[340px] select-none">
      {/* rotor disc */}
      <circle cx={CX} cy={CY} r={DISC_R} fill="none" stroke="var(--border-default)" strokeWidth={1} strokeDasharray="2 6" />
      <text x={CX} y={CY - DISC_R + 16} textAnchor="middle" fontSize={10} fontFamily="monospace" fill="var(--text-tertiary)">FWD</text>
      <polygon points={`${CX - 5},${CY - DISC_R + 30} ${CX + 5},${CY - DISC_R + 30} ${CX},${CY - DISC_R + 21}`} fill="var(--text-tertiary)" />

      {/* fuselage, boom and tail fin, drawn under the mechanics */}
      <g fill="var(--bg-surface-raised)" stroke="var(--border-default)" strokeWidth={1.5}>
        <path d={`M ${CX} ${CY - 124} C ${CX + 58} ${CY - 120}, ${CX + 74} ${CY - 30}, ${CX + 66} ${CY + 60} C ${CX + 58} ${CY + 132}, ${CX - 58} ${CY + 132}, ${CX - 66} ${CY + 60} C ${CX - 74} ${CY - 30}, ${CX - 58} ${CY - 120}, ${CX} ${CY - 124} Z`} />
        <rect x={CX - 6} y={boomTop} width={12} height={tailY - boomTop - 8} rx={6} />
        <path d={`M ${CX - 30} ${tailY - 4} L ${CX + 30} ${tailY - 4} L ${CX + 24} ${tailY + 8} L ${CX - 24} ${tailY + 8} Z`} />
      </g>

      {/* swashplate and shaft */}
      <circle cx={CX} cy={CY} r={SWASH_R} fill="var(--bg-base)" stroke="var(--text-tertiary)" strokeWidth={2} />
      <circle cx={CX} cy={CY} r={SWASH_R - 12} fill="none" stroke="var(--border-default)" strokeWidth={1} strokeDasharray="3 4" />
      <circle cx={CX} cy={CY} r={7} fill="var(--text-tertiary)" />

      {servos.map((s) => {
        const { ch, pwm } = out(s.fn);
        const color = ch ? SERVO : MISSING;
        if (s.angle === null) {
          return (
            <g key={s.fn}>
              <rect x={CX - 30} y={CY + 12} width={60} height={22} rx={6} fill="var(--bg-base)" stroke={color} strokeWidth={2} strokeDasharray={ch ? undefined : '3 3'} />
              <text x={CX} y={CY + 27} textAnchor="middle" fontSize={11} fontWeight="bold" fontFamily="monospace" fill="var(--text-primary)">{ch ? `S${ch}` : '-'}</text>
              <text x={CX + 36} y={CY + 27} fontSize={10} fill="var(--text-secondary)">{s.label}</text>
            </g>
          );
        }
        const a = (s.angle * Math.PI) / 180;
        const lx = CX + Math.sin(a) * SWASH_R;
        const ly = CY - Math.cos(a) * SWASH_R;
        const sx = CX + Math.sin(a) * SERVO_R;
        const sy = CY - Math.cos(a) * SERVO_R;
        return (
          <g key={s.fn}>
            <line x1={lx} y1={ly} x2={sx} y2={sy} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={lx} cy={ly} r={4} fill={color} />
            <circle cx={sx} cy={sy} r={18} fill="var(--bg-base)" stroke={color} strokeWidth={2.5} strokeDasharray={ch ? undefined : '3 3'} />
            <text x={sx} y={sy + 4} textAnchor="middle" fontSize={12} fontWeight="bold" fontFamily="monospace" fill="var(--text-primary)">{ch ? `S${ch}` : '-'}</text>
            {s.label.length > 1 && <text x={sx} y={sy - 24} textAnchor="middle" fontSize={10} fill="var(--text-secondary)">{s.label}</text>}
            <ValuePill x={sx} y={sy + 22} text={pwmText(pwm)} color={color} />
          </g>
        );
      })}

      {/* tail rotor */}
      <g>
        <circle cx={CX} cy={tailY + 22} r={18} fill="var(--bg-base)" stroke={tail.ch ? TAIL : MISSING} strokeWidth={2.5} strokeDasharray={tail.ch ? undefined : '3 3'} />
        <text x={CX} y={tailY + 26} textAnchor="middle" fontSize={12} fontWeight="bold" fontFamily="monospace" fill="var(--text-primary)">{tail.ch ? `S${tail.ch}` : '-'}</text>
        <text x={CX - 26} y={tailY + 26} textAnchor="end" fontSize={10} fill="var(--text-secondary)">{t('mavlink-config:heli.diagram.tail')}</text>
        <ValuePill x={CX + 58} y={tailY + 13} text={pwmText(tail.pwm)} color={tail.ch ? TAIL : MISSING} />
      </g>
    </svg>
  );
}
