/**
 * IPC handlers for Mission Library
 * Registers all mission-library:* IPC channels.
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type {
  SaveMissionPayload,
  MissionListFilter,
  MissionSortOptions,
  FlightLog,
} from '../../shared/mission-library-types.js';
import { LocalMissionLibraryProvider } from './local-provider.js';

const provider = new LocalMissionLibraryProvider();

export function initMissionLibraryHandlers(): void {
  // Initialize storage on startup (all sync operations)
  provider.initialize();

  // List missions (with optional filter/sort)
  ipcMain.handle(IPC_CHANNELS.MISSION_LIBRARY_LIST, async (_, filter?: MissionListFilter, sort?: MissionSortOptions) => {
    return provider.listMissions(filter, sort);
  });

  // Get full mission
  ipcMain.handle(IPC_CHANNELS.MISSION_LIBRARY_GET, async (_, id: string) => {
    return provider.getMission(id);
  });

  // Save mission (create or update)
  ipcMain.handle(IPC_CHANNELS.MISSION_LIBRARY_SAVE, async (_, payload: SaveMissionPayload) => {
    return provider.saveMission(payload);
  });

  // Delete mission
  ipcMain.handle(IPC_CHANNELS.MISSION_LIBRARY_DELETE, async (_, id: string) => {
    return provider.deleteMission(id);
  });

  // Duplicate mission
  ipcMain.handle(IPC_CHANNELS.MISSION_LIBRARY_DUPLICATE, async (_, id: string, newName: string) => {
    return provider.duplicateMission(id, newName);
  });

  // Get all tags
  ipcMain.handle(IPC_CHANNELS.MISSION_LIBRARY_GET_TAGS, async () => {
    return provider.getAllTags();
  });

  // Flight logs
  ipcMain.handle(IPC_CHANNELS.MISSION_LIBRARY_FLIGHT_LOGS, async (_, missionId: string) => {
    return provider.getFlightLogs(missionId);
  });

  ipcMain.handle(IPC_CHANNELS.MISSION_LIBRARY_ADD_LOG, async (_, log: Omit<FlightLog, 'id' | 'createdAt'>) => {
    return provider.addFlightLog(log);
  });

  ipcMain.handle(IPC_CHANNELS.MISSION_LIBRARY_UPDATE_LOG, async (_, log: FlightLog) => {
    return provider.updateFlightLog(log);
  });

  ipcMain.handle(IPC_CHANNELS.MISSION_LIBRARY_DELETE_LOG, async (_, missionId: string, logId: string) => {
    return provider.deleteFlightLog(missionId, logId);
  });
}

export function cleanupMissionLibraryHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.MISSION_LIBRARY_LIST);
  ipcMain.removeHandler(IPC_CHANNELS.MISSION_LIBRARY_GET);
  ipcMain.removeHandler(IPC_CHANNELS.MISSION_LIBRARY_SAVE);
  ipcMain.removeHandler(IPC_CHANNELS.MISSION_LIBRARY_DELETE);
  ipcMain.removeHandler(IPC_CHANNELS.MISSION_LIBRARY_DUPLICATE);
  ipcMain.removeHandler(IPC_CHANNELS.MISSION_LIBRARY_GET_TAGS);
  ipcMain.removeHandler(IPC_CHANNELS.MISSION_LIBRARY_FLIGHT_LOGS);
  ipcMain.removeHandler(IPC_CHANNELS.MISSION_LIBRARY_ADD_LOG);
  ipcMain.removeHandler(IPC_CHANNELS.MISSION_LIBRARY_UPDATE_LOG);
  ipcMain.removeHandler(IPC_CHANNELS.MISSION_LIBRARY_DELETE_LOG);
}
