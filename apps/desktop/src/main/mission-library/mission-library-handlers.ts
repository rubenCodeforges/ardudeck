/**
 * IPC handlers for Mission Library
 * Registers all mission-library:* IPC channels.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type {
  SaveMissionPayload,
  MissionListFilter,
  MissionSortOptions,
  FlightLog,
} from '../../shared/mission-library-types.js';
import { isSurveyDocument, type SaveSurveyAreaPayload } from '../../shared/survey-document-types.js';
import { isStoredMission, type StoredMission } from '../../shared/mission-library-types.js';
import { LocalMissionLibraryProvider } from './local-provider.js';
import { LocalSurveyAreaProvider, type SurveyAreaFilter } from './area-provider.js';

const provider = new LocalMissionLibraryProvider();
const areas = new LocalSurveyAreaProvider();

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

  // Lossless mission file: the library's own format, groups and surveys intact,
  // unlike .waypoints which flattens everything.
  ipcMain.handle(IPC_CHANNELS.MISSION_LIBRARY_EXPORT_FILE, async (event, id: string) => {
    const mission = await provider.getMission(id);
    if (!mission) return { success: false, error: 'Mission not found' };
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Export Mission',
      defaultPath: `${fileSlug(mission.name)}.mission.json`,
      filters: [{ name: 'ArduDeck Mission', extensions: ['json'] }],
    };
    const dlg = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (dlg.canceled || !dlg.filePath) return { success: false, error: 'Cancelled' };
    try {
      await writeFile(dlg.filePath, JSON.stringify(mission, null, 2), 'utf-8');
      return { success: true, filePath: dlg.filePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.MISSION_LIBRARY_IMPORT_FILE, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Import Mission',
      properties: ['openFile' as const],
      filters: [{ name: 'ArduDeck Mission', extensions: ['json'] }],
    };
    const dlg = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    const path = dlg.filePaths[0];
    if (dlg.canceled || !path) return { success: false, error: 'Cancelled' };
    try {
      const raw: unknown = JSON.parse(await readFile(path, 'utf-8'));
      if (!isStoredMission(raw)) return { success: false, error: 'Not an ArduDeck mission file' };
      return { success: true, mission: await importMission(raw) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.MISSION_LIBRARY_IMPORT_DOC, async (_, doc: unknown) => {
    if (!isStoredMission(doc)) return null;
    return importMission(doc);
  });

  areas.initialize();

  ipcMain.handle(IPC_CHANNELS.SURVEY_AREA_LIST, async (_, filter?: SurveyAreaFilter) => areas.list(filter));

  ipcMain.handle(IPC_CHANNELS.SURVEY_AREA_GET, async (_, id: string) => areas.get(id));

  ipcMain.handle(IPC_CHANNELS.SURVEY_AREA_SAVE, async (_, payload: SaveSurveyAreaPayload) => areas.save(payload));

  ipcMain.handle(IPC_CHANNELS.SURVEY_AREA_DELETE, async (_, id: string) => areas.delete(id));

  ipcMain.handle(IPC_CHANNELS.SURVEY_AREA_DUPLICATE, async (_, id: string, newName: string) =>
    areas.duplicate(id, newName));

  ipcMain.handle(IPC_CHANNELS.SURVEY_AREA_GET_TAGS, async () => areas.getAllTags());

  // Store a document that already has an identity and a revision (pulled from
  // the vault, or handed over by another machine) exactly as it stands.
  ipcMain.handle(IPC_CHANNELS.SURVEY_AREA_IMPORT_DOC, async (_, doc: unknown) => {
    if (!isSurveyDocument(doc)) return null;
    return areas.import(doc);
  });

  ipcMain.handle(IPC_CHANNELS.SURVEY_AREA_EXPORT_FILE, async (event, id: string) => {
    const doc = await areas.get(id);
    if (!doc) return { success: false, error: 'Area not found' };
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Export Survey Area',
      defaultPath: `${fileSlug(doc.name)}.survey.json`,
      filters: [{ name: 'ArduDeck Survey', extensions: ['json'] }],
    };
    const dlg = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    if (dlg.canceled || !dlg.filePath) return { success: false, error: 'Cancelled' };
    try {
      await writeFile(dlg.filePath, JSON.stringify(doc, null, 2), 'utf-8');
      return { success: true, filePath: dlg.filePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SURVEY_AREA_IMPORT_FILE, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: 'Import Survey Area',
      properties: ['openFile' as const],
      filters: [{ name: 'ArduDeck Survey', extensions: ['json'] }],
    };
    const dlg = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    const path = dlg.filePaths[0];
    if (dlg.canceled || !path) return { success: false, error: 'Cancelled' };
    try {
      const raw: unknown = JSON.parse(await readFile(path, 'utf-8'));
      if (!isSurveyDocument(raw)) {
        return { success: false, error: 'Not an ArduDeck survey area file' };
      }
      return { success: true, area: await areas.import(raw) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

/**
 * Take in a mission that already has an identity, keeping its id so a copy
 * pulled from the vault updates the same entry instead of breeding duplicates.
 */
async function importMission(mission: StoredMission) {
  return provider.saveMission({
    name: mission.name,
    description: mission.description,
    ...(mission.site ? { site: mission.site } : {}),
    vehicleProfileId: mission.vehicleProfileId,
    tags: mission.tags,
    groups: mission.groups,
    items: mission.items,
    homePosition: mission.homePosition,
    existingId: mission.id,
  });
}

function fileSlug(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'survey-area';
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
  ipcMain.removeHandler(IPC_CHANNELS.MISSION_LIBRARY_EXPORT_FILE);
  ipcMain.removeHandler(IPC_CHANNELS.MISSION_LIBRARY_IMPORT_FILE);
  ipcMain.removeHandler(IPC_CHANNELS.MISSION_LIBRARY_IMPORT_DOC);
  ipcMain.removeHandler(IPC_CHANNELS.SURVEY_AREA_LIST);
  ipcMain.removeHandler(IPC_CHANNELS.SURVEY_AREA_GET);
  ipcMain.removeHandler(IPC_CHANNELS.SURVEY_AREA_SAVE);
  ipcMain.removeHandler(IPC_CHANNELS.SURVEY_AREA_DELETE);
  ipcMain.removeHandler(IPC_CHANNELS.SURVEY_AREA_DUPLICATE);
  ipcMain.removeHandler(IPC_CHANNELS.SURVEY_AREA_GET_TAGS);
  ipcMain.removeHandler(IPC_CHANNELS.SURVEY_AREA_IMPORT_DOC);
  ipcMain.removeHandler(IPC_CHANNELS.SURVEY_AREA_EXPORT_FILE);
  ipcMain.removeHandler(IPC_CHANNELS.SURVEY_AREA_IMPORT_FILE);
}
