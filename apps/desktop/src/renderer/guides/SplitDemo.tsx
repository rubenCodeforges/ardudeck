import { useTranslation } from 'react-i18next';
import { DemoCanvas, MiniMap, MiniVision, usePhaseLoop } from './demo-kit';

// full map, split opens, divider drags, back, split closes
const PHASES = [1200, 900, 800, 800, 1000];

/** The map shares its panel with synthetic vision; the divider sets the ratio. */
export function SplitDemo() {
  const { t } = useTranslation();
  const phase = usePhaseLoop(PHASES);
  const mapWidth = phase === 0 || phase === 4 ? 100 : phase === 2 ? 42 : 58;

  return (
    <DemoCanvas>
      <div className="absolute inset-0">
        <div className="absolute inset-y-0 left-0 overflow-hidden transition-all duration-500 ease-in-out" style={{ width: `${mapWidth}%` }}>
          <MiniMap />
          <span
            className={`absolute right-1.5 top-1.5 rounded border px-1.5 text-[9px] leading-[16px] transition-colors ${phase === 0 || phase === 4 ? 'border-blue-500 bg-blue-500/20 text-blue-200' : 'border-white/20 bg-black/40 text-white/70'}`}
          >
            {t('guides:splitDemo.split')}
          </span>
        </div>
        <div
          className="absolute inset-y-0 right-0 overflow-hidden transition-all duration-500 ease-in-out"
          style={{ width: `${100 - mapWidth}%` }}
        >
          <MiniVision />
          <span className="absolute left-1.5 top-1.5 rounded bg-black/40 px-1.5 text-[9px] leading-[16px] text-white/80">{t('guides:splitDemo.synthetic')}</span>
        </div>
        {mapWidth < 100 && (
          <div className="absolute inset-y-0 w-1 -translate-x-1/2 bg-white/60 transition-all duration-500 ease-in-out" style={{ left: `${mapWidth}%` }} />
        )}
      </div>
    </DemoCanvas>
  );
}
