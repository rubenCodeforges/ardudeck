import { useTranslation } from 'react-i18next';
import { DemoCanvas, usePhaseLoop } from './demo-kit';

const chip = (on: boolean) =>
  `rounded border px-2 text-[10px] leading-[20px] transition-colors ${on ? 'border-blue-500 bg-blue-500/20 text-blue-100' : 'border-white/20 bg-black/40 text-white/70'}`;

// pick a vehicle, press Launch, the link comes up
const SITL_PHASES = [900, 900, 900, 1400];

/** One vehicle picked and launched, then connected. */
export function SitlDemo() {
  const { t } = useTranslation();
  const phase = usePhaseLoop(SITL_PHASES);
  const vehicles = ['Copter', 'Plane', 'Rover']; // i18n-exempt: ArduPilot vehicle names
  return (
    <DemoCanvas>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div className="flex gap-1.5">
          {vehicles.map((v, i) => <span key={v} className={chip(phase >= 1 && i === 1)}>{v}</span>)}
        </div>
        <span className={`rounded-full px-4 text-[11px] font-semibold leading-[24px] transition-all ${phase === 2 ? 'scale-95 bg-blue-400 text-white' : 'bg-blue-600 text-white'}`}>{t('guides:releaseDemos.launch')}</span>
        <span className={`flex items-center gap-1.5 text-[10px] transition-opacity ${phase === 3 ? 'opacity-100 text-emerald-300' : 'opacity-0'}`}>
          <span className="h-2 w-2 rounded-full bg-emerald-400" />{t('guides:releaseDemos.connected')}
        </span>
      </div>
    </DemoCanvas>
  );
}

// waves leave the handset, reach the laptop, values appear
const CRSF_PHASES = [700, 700, 700, 1500];

/** The transmitter's backpack broadcasts telemetry over WiFi; ArduDeck listens on UDP 14550. */
export function CrsfDemo() {
  const phase = usePhaseLoop(CRSF_PHASES);
  return (
    <DemoCanvas>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 170">
        <rect x="40" y="70" width="44" height="60" rx="8" fill="none" stroke="#e5e7eb" strokeWidth="2" />
        <line x1="62" y1="70" x2="62" y2="44" stroke="#e5e7eb" strokeWidth="2" />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M ${110 + i * 26} 70 q 10 15 0 30`} fill="none" stroke="#60a5fa" strokeWidth="2" opacity={phase > i ? 1 : 0.15} />
        ))}
        <rect x="200" y="78" width="80" height="50" rx="4" fill="none" stroke="#e5e7eb" strokeWidth="2" />
        <line x1="190" y1="132" x2="290" y2="132" stroke="#e5e7eb" strokeWidth="2" />
        <text x="240" y="100" textAnchor="middle" fill={phase === 3 ? '#6ee7b7' : '#6b7280'} fontSize="11" fontFamily="monospace">{/* i18n-exempt: protocol and port */}CRSF</text>
        <text x="240" y="116" textAnchor="middle" fill={phase === 3 ? '#e5e7eb' : '#6b7280'} fontSize="11" fontFamily="monospace">{/* i18n-exempt: UDP port */}:14550</text>
      </svg>
    </DemoCanvas>
  );
}

const CARGO_PHASES = [1000, 700, 1500];

/** A cargo card goes from Install to Installed. */
export function CargoDemo() {
  const { t } = useTranslation();
  const phase = usePhaseLoop(CARGO_PHASES);
  return (
    <DemoCanvas>
      <div className="absolute inset-0 flex items-center justify-center gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex h-[96px] w-[118px] flex-col justify-between rounded-lg border border-white/15 bg-black/40 p-2.5">
            <div className="h-6 w-6 rounded-md bg-blue-500/40" />
            <div className="h-1.5 w-16 rounded bg-white/30" />
            {i === 0 ? (
              <span className={`self-start rounded-full px-2.5 text-[10px] leading-[18px] transition-colors ${phase === 2 ? 'bg-emerald-500/20 text-emerald-300' : phase === 1 ? 'bg-blue-400 text-white' : 'bg-blue-600 text-white'}`}>
                {phase === 2 ? t('guides:releaseDemos.installed') : t('guides:releaseDemos.install')}
              </span>
            ) : (
              <span className="self-start rounded-full bg-blue-600 px-2.5 text-[10px] leading-[18px] text-white">{t('guides:releaseDemos.install')}</span>
            )}
          </div>
        ))}
      </div>
    </DemoCanvas>
  );
}

const ADJUST_PHASES = [900, 900, 900, 1300];

/** Target speed, altitude and loiter radius step up in flight; the radius goes through review. */
export function AdjustDemo() {
  const { t } = useTranslation();
  const phase = usePhaseLoop(ADJUST_PHASES);
  const rows: [string, string][] = [
    [t('guides:releaseDemos.speed'), `${phase >= 1 ? 16 : 14} m/s`],
    [t('guides:releaseDemos.altitude'), `${phase >= 2 ? 120 : 100} m`],
    [t('guides:releaseDemos.radius'), `${phase >= 3 ? 80 : 60} m`],
  ];
  return (
    <DemoCanvas>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[200px] space-y-1.5 rounded-lg border border-white/15 bg-black/50 p-2.5">
          {rows.map(([label, value], i) => (
            <div key={label} className={`flex items-center justify-between rounded px-2 text-[11px] leading-[22px] transition-colors ${phase === i + 1 ? 'bg-blue-500/25 text-white' : 'text-white/75'}`}>
              <span>{label}</span>
              <span className="font-mono">{value}</span>
            </div>
          ))}
          <div className={`text-right text-[10px] transition-opacity ${phase === 3 ? 'opacity-100 text-amber-300' : 'opacity-0'}`}>{t('guides:releaseDemos.review')}</div>
        </div>
      </div>
    </DemoCanvas>
  );
}

const LANGUAGES = ['English', 'Deutsch', '简体中文', '繁體中文', 'Українська', 'Türkçe']; // i18n-exempt: languages in their own names
const LANGUAGE_PHASES = [1100, 1100, 1100, 1100, 1100, 1100];

/** The language picker cycling through the shipped languages. */
export function LanguageDemo() {
  const { t } = useTranslation();
  const phase = usePhaseLoop(LANGUAGE_PHASES);
  return (
    <DemoCanvas>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-white/60">{t('guides:releaseDemos.language')}</span>
        <div className="flex flex-wrap justify-center gap-1.5">
          {LANGUAGES.map((l, i) => <span key={l} className={chip(phase === i)}>{l}</span>)}
        </div>
        <span className="text-[10px] text-white/50">{t('guides:releaseDemos.system')}</span>
      </div>
    </DemoCanvas>
  );
}
