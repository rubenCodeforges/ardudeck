/**
 * MotorMixerTab
 *
 * Motor mixer configuration for iNav.
 * Currently a placeholder - motor mixer functionality coming soon.
 */

interface Props {
  modified: boolean;
  setModified: (v: boolean) => void;
}

export default function MotorMixerTab({ modified, setModified }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8 max-w-lg mx-auto text-center">
      <div className="text-6xl">🔧</div>
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Motor Mixer</h2>
        <p className="text-zinc-400">
          Motor mixer configuration for custom motor layouts.
        </p>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 w-full">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🚧</span>
          <div className="text-left">
            <h4 className="font-medium text-amber-400">Coming Soon</h4>
            <p className="text-sm text-zinc-400">
              Motor mixer configuration is planned for a future release. For now, use iNav Configurator for motor mixer settings.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 text-left">
        <p className="text-sm text-zinc-300 font-medium mb-2">Motor Mixer is used for:</p>
        <ul className="text-xs text-zinc-400 space-y-1 list-disc list-inside">
          <li><strong>Custom frames</strong> - non-standard motor positions</li>
          <li><strong>Asymmetric quads</strong> - different arm lengths</li>
          <li><strong>Dual-motor planes</strong> - twin engine setups</li>
        </ul>
      </div>
    </div>
  );
}
