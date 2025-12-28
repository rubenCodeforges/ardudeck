import { useNavigationStore, type ViewId } from '../../stores/navigation-store';

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

const navItems: NavItem[] = [
  {
    id: 'telemetry',
    label: 'Telemetry',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'parameters',
    label: 'Parameters',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
];

// Future navigation items (disabled placeholders)
const futureItems: Omit<NavItem, 'id'> & { id: string }[] = [
  {
    id: 'calibration',
    label: 'Calibration (Coming Soon)',
    disabled: true,
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'mission',
    label: 'Mission Planning (Coming Soon)',
    disabled: true,
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
  },
];

export function NavigationRail() {
  const { currentView, setView } = useNavigationStore();

  return (
    <nav className="w-14 h-full bg-gray-900/50 border-r border-gray-800/50 flex flex-col items-center py-3 gap-1">
      {/* Active navigation items */}
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => setView(item.id)}
          className={`
            relative w-10 h-10 rounded-lg flex items-center justify-center
            transition-all duration-200 group
            ${currentView === item.id
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
            }
          `}
          title={item.label}
        >
          {/* Active indicator */}
          {currentView === item.id && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-400 rounded-r" />
          )}
          {item.icon}

          {/* Tooltip */}
          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-gray-200 text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
            {item.label}
          </div>
        </button>
      ))}

      {/* Separator */}
      <div className="w-6 h-px bg-gray-700/50 my-2" />

      {/* Future items (disabled) */}
      {futureItems.map((item) => (
        <button
          key={item.id}
          disabled
          className="relative w-10 h-10 rounded-lg flex items-center justify-center text-gray-700 cursor-not-allowed group"
          title={item.label}
        >
          {item.icon}

          {/* Tooltip */}
          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-gray-400 text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
            {item.label}
          </div>
        </button>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* ArduDeck logo/branding at bottom */}
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-gray-700/30 flex items-center justify-center" title="ArduDeck">
        <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </div>
    </nav>
  );
}
