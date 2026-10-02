import { MAP_INSTRUMENTS } from '../components/map/instruments/registry';
import { GAUGE_DIAMETER } from '../components/map/instruments/RoundGauge';
import { DemoCanvas, usePhaseLoop } from './demo-kit';

const SCALE = 0.6;
const SIZE = GAUGE_DIAMETER * SCALE;
const Y = 170 - SIZE - 18;
const SPEED_X = 20;
const ALT_X = 160;

// apart, drag, docked, hold, settle (the mobile demo's timeline)
const PHASES = [1200, 650, 1100, 1800, 700];

const Speed = MAP_INSTRUMENTS.find((i) => i.id === 'speed')!.Component;
const Altitude = MAP_INSTRUMENTS.find((i) => i.id === 'altitude')!.Component;

function Gauge({ Component }: { Component: () => JSX.Element }) {
  return (
    <div style={{ width: SIZE, height: SIZE }}>
      <div style={{ transform: `scale(${SCALE})`, transformOrigin: 'top left' }}>
        <Component />
      </div>
    </div>
  );
}

/** Real Speed and Altitude instruments: altitude is dragged onto speed and the two share one tray. */
export function GroupingDemo() {
  const phase = usePhaseLoop(PHASES);
  const docked = phase >= 2;
  const dragging = phase === 1;

  return (
    <DemoCanvas>
      <div className="pointer-events-none absolute inset-0">
        {docked ? (
          <div
            className="absolute flex items-center gap-1 rounded-[40px] bg-surface-overlay-light p-1 shadow-xl transition-opacity duration-300"
            style={{ left: SPEED_X - 4, top: Y - 4 }}
          >
            <Gauge Component={Speed} />
            <Gauge Component={Altitude} />
          </div>
        ) : (
          <>
            <div className="absolute" style={{ left: SPEED_X, top: Y }}><Gauge Component={Speed} /></div>
            <div className="absolute" style={{ left: ALT_X, top: Y }}><Gauge Component={Altitude} /></div>
          </>
        )}
        {/* The drag itself: a copy slides from its place onto the other instrument and fades. */}
        {dragging && (
          <div className="absolute" style={{ left: 0, top: Y, animation: 'guide-ghost-drag 650ms ease-in-out forwards' }}>
            <Gauge Component={Altitude} />
          </div>
        )}
        {/* i18n-exempt */}
        <style>{`@keyframes guide-ghost-drag {
          from { transform: translateX(${ALT_X}px); opacity: 0.85; }
          to { transform: translateX(${SPEED_X + SIZE * 0.5}px); opacity: 0; }
        }`}</style>
      </div>
    </DemoCanvas>
  );
}
