// apps/desktop/src/main/testing/tools.ts
import { BrowserWindow, ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { TESTING_CHANNELS } from '../../shared/testing-channels';

const SCREENSHOT_DIR = join(homedir(), '.ardudeck', 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win;
}

async function callRenderer(channel: string, params: any = {}): Promise<any> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Main window not available');
  }

  const requestId = randomUUID();
  const responseChannel = `${channel}:response`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ipcMain.removeListener(responseChannel, handler);
      reject(new Error(`Renderer timeout (30s) for ${channel}`));
    }, 30000);

    const handler = (_event: any, id: string, result: any) => {
      if (id !== requestId) return;
      clearTimeout(timeout);
      ipcMain.removeListener(responseChannel, handler);
      if (result.success) {
        resolve(result.data);
      } else {
        const err = new Error(result.error);
        (err as any).selector = result.selector;
        (err as any).timeout = result.timeout;
        reject(err);
      }
    };

    ipcMain.on(responseChannel, handler);
    mainWindow!.webContents.send(channel, requestId, params);
  });
}

// --- Tool implementations ---

export async function screenshot(params?: { region?: { x: number; y: number; width: number; height: number } }): Promise<string> {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Main window not available');

  const rect = params?.region
    ? { x: params.region.x, y: params.region.y, width: params.region.width, height: params.region.height }
    : undefined;

  let image = await mainWindow.webContents.capturePage(rect);

  // Resize to max 1024px wide (Retina displays produce 2-4x pixels)
  const size = image.getSize();
  if (size.width > 1024) {
    const scale = 1024 / size.width;
    image = image.resize({
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
    });
  }

  // Save to file, return path — no base64 over the wire
  const filePath = join(SCREENSHOT_DIR, `screenshot-${Date.now()}.jpg`);
  writeFileSync(filePath, image.toJPEG(80));
  return filePath;
}

export async function findElementsTool(params: { query: string; by?: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.FIND_ELEMENTS, params);
}

export async function getPageStateTool(): Promise<any> {
  return callRenderer(TESTING_CHANNELS.GET_PAGE_STATE);
}

export async function getStoreStateTool(params: { storeName: string; path?: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.GET_STORE_STATE, params);
}

export async function getElementTextTool(params: { selector: string; by?: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.GET_ELEMENT_TEXT, params);
}

export async function listTestIdsTool(params?: { scope?: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.LIST_TEST_IDS, params || {});
}

export async function getAppInfoTool(): Promise<any> {
  const rendererInfo = await callRenderer(TESTING_CHANNELS.GET_APP_INFO);
  return {
    ...rendererInfo,
    platform: process.platform,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    devMode: true,
  };
}

export async function getViewsTool(): Promise<any> {
  return callRenderer(TESTING_CHANNELS.GET_VIEWS);
}

export async function clickTool(params: { selector: string; by?: string; options?: any }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.CLICK, params);
}

export async function typeTool(params: { selector: string; text: string; by?: string; options?: any }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.TYPE, params);
}

export async function selectTool(params: { selector: string; value: string; by?: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.SELECT, params);
}

export async function scrollTool(params: { selector?: string; direction: string; amount?: number }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.SCROLL, params);
}

export async function keyboardTool(params: { key: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.KEYBOARD, params);
}

export async function hoverTool(params: { selector: string; by?: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.HOVER, params);
}

export async function navigateTool(params: { view: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.NAVIGATE, params);
}

export async function waitForElementTool(params: { selector: string; by?: string; options?: any }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.WAIT_FOR_ELEMENT, params);
}

export async function waitForStoreTool(params: { storeName: string; path: string; value: any; timeout?: number }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.WAIT_FOR_STORE, params);
}

export async function waitForIdleTool(params?: { timeout?: number }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.WAIT_FOR_IDLE, params || {});
}
