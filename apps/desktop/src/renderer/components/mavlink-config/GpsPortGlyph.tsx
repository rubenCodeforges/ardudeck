/**
 * Socket pictograms for the GPS wiring card: the connector a pilot is looking
 * at on the board, not a word. A GPS/TELEM port is drawn as its JST-GH shell
 * with pins, CAN as the twisted pair with two nodes on a bus.
 */

interface GlyphProps {
  kind: 'serial' | 'can';
  active?: boolean;
  size?: number;
}

import { useTranslation } from 'react-i18next';

export function GpsPortGlyph({ kind, active = false, size = 54 }: GlyphProps): JSX.Element {
  const { t } = useTranslation();
  const stroke = active ? 'var(--color-emerald-400, #34d399)' : 'currentColor';
  const fill = active ? 'rgba(52, 211, 153, 0.16)' : 'transparent';

  if (kind === 'can') {
    return (
      <svg
        width={size}
        height={size * 0.62}
        viewBox="0 0 54 34"
        className={active ? 'text-emerald-400' : 'text-content-tertiary'}
        role="img"
        aria-label={t('mavlink-config:gpsPortGlyph.canBus')}
      >
        <line x1="4" y1="17" x2="50" y2="17" stroke={stroke} strokeWidth="1.6" />
        <path
          d="M12 17c3-6 6 6 9 0s6 6 9 0 6 6 9 0"
          fill="none"
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="8" cy="17" r="3.6" fill={fill} stroke={stroke} strokeWidth="1.6" />
        <circle cx="46" cy="17" r="3.6" fill={fill} stroke={stroke} strokeWidth="1.6" />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size * 0.62}
      viewBox="0 0 54 34"
      className={active ? 'text-emerald-400' : 'text-content-tertiary'}
      role="img"
      aria-label={t('mavlink-config:gpsPortGlyph.serialSocket')}
    >
      <rect x="6" y="7" width="42" height="20" rx="3" fill={fill} stroke={stroke} strokeWidth="1.6" />
      <rect x="18" y="3.5" width="18" height="4" rx="1.5" fill={stroke} opacity="0.45" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line
          key={i}
          x1={11.5 + i * 6.2}
          y1={13}
          x2={11.5 + i * 6.2}
          y2={23}
          stroke={stroke}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity={active ? 0.95 : 0.65}
        />
      ))}
    </svg>
  );
}
