import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_USER_UNIT_PREFERENCES } from '../../shared/user-units.js';
import { useSettingsStore } from './settings-store';

const getSettings = vi.fn();
const saveSettings = vi.fn().mockResolvedValue(undefined);
const initialState = useSettingsStore.getState();

describe('settings store unit preferences', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getSettings.mockResolvedValue(null);
    saveSettings.mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      electronAPI: {
        getSettings,
        saveSettings,
      },
    });
    useSettingsStore.setState(initialState, true);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useSettingsStore.setState(initialState, true);
  });

  it('normalizes persisted unit preferences with legacy display and survey fallbacks', async () => {
    getSettings.mockResolvedValue({
      missionDefaults: {},
      vehicles: [],
      activeVehicleId: null,
      flightStats: null,
      displayUnits: 'large',
      surveyUnits: 'imperial',
      unitPreferences: {
        speed: 'kt',
        altitude: 'bogus',
      },
    });

    await useSettingsStore.getState().loadSettings();

    expect(useSettingsStore.getState().unitPreferences).toEqual({
      distance: 'mi',
      altitude: 'ft',
      electricCapacity: 'ah',
      speed: 'kt',
      verticalSpeed: 'fpm',
      weight: 'kg',
      dimensions: 'm',
      area: 'ac',
      windSpeed: 'mph',
    });
  });

  it('updates a single unit preference immutably', () => {
    const before = useSettingsStore.getState().unitPreferences;

    useSettingsStore.getState().setUnitPreference('speed', 'mph');

    const after = useSettingsStore.getState().unitPreferences;
    expect(after).toEqual({ ...DEFAULT_USER_UNIT_PREFERENCES, speed: 'mph' });
    expect(after).not.toBe(before);
  });

  it('includes unit preferences in saved settings payload', async () => {
    useSettingsStore.setState({
      _isInitialized: false,
      unitPreferences: { ...DEFAULT_USER_UNIT_PREFERENCES, windSpeed: 'kt' },
    });
    useSettingsStore.setState({ _isInitialized: true });

    await useSettingsStore.getState()._saveSettings();

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        unitPreferences: { ...DEFAULT_USER_UNIT_PREFERENCES, windSpeed: 'kt' },
      }),
    );
    const payload = saveSettings.mock.calls[0]?.[0];
    expect(payload).not.toHaveProperty('displayUnits');
    expect(payload).not.toHaveProperty('surveyUnits');
  });
});
