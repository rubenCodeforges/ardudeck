import { useActivityStore } from '../../stores/activity-store';

/**
 * Bottom-center toast showing the current long-running operation (survey
 * recompute, import, etc.). Renders nothing when idle. Mounted once at the app
 * root so it surfaces regardless of which view triggered the work.
 */
export function ActivityIndicator() {
  const label = useActivityStore((s) => (s.tasks.length > 0 ? s.tasks[s.tasks.length - 1]!.label : null));
  if (!label) return null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[3000] pointer-events-none">
      <div className="app-toast flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-gray-900/92 border border-white/10 shadow-lg backdrop-blur-sm text-sm text-gray-100">
        <svg className="w-4 h-4 animate-spin text-blue-300" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>{label}</span>
      </div>
    </div>
  );
}
