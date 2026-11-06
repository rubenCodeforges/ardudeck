import { DOMParser as XmlDomParser } from '@xmldom/xmldom';
import type { SceneAltitudeMode } from '@ardudeck/module-sdk';
import { t } from '../../i18n/index.js';
import type { KmlModel } from './types';

const KML_MODES: Record<string, SceneAltitudeMode> = {
  clampToGround: 'clamp',
  clampToSeaFloor: 'clamp',
  relativeToGround: 'agl',
  relativeToSeaFloor: 'agl',
  absolute: 'amsl',
};

function parseXml(text: string): Document {
  const Native = (globalThis as { DOMParser?: typeof DOMParser }).DOMParser;
  let doc: Document;
  try {
    doc = Native
      ? new Native().parseFromString(text, 'application/xml')
      : (new XmlDomParser({
        errorHandler: {
          warning: () => undefined,
          error: (m: string) => { throw new Error(m); },
          fatalError: (m: string) => { throw new Error(m); },
        },
      }).parseFromString(text, 'application/xml') as unknown as Document);
  } catch (e) {
    throw new Error(t('shared:gisAreaImport.invalidKmlDetail', { detail: (e as Error).message ?? String(e) }));
  }
  if (!doc || !doc.documentElement || doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error(t('shared:gisAreaImport.invalidKml'));
  }
  return doc;
}

const localOf = (el: Element): string => el.localName ?? el.nodeName.replace(/^.*:/, '');

function children(el: Element, name: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const c = el.childNodes[i];
    if (c && c.nodeType === 1 && localOf(c as Element) === name) out.push(c as Element);
  }
  return out;
}

function descendants(root: Element, name: string): Element[] {
  const out: Element[] = [];
  const stack: Element[] = [root];
  while (stack.length) {
    const el = stack.pop()!;
    if (localOf(el) === name) out.push(el);
    for (let i = el.childNodes.length - 1; i >= 0; i--) {
      const c = el.childNodes[i];
      if (c && c.nodeType === 1) stack.push(c as Element);
    }
  }
  return out;
}

function text(el: Element | undefined, name: string): string | undefined {
  const c = el ? children(el, name)[0] : undefined;
  const s = c?.textContent?.trim();
  return s ? s : undefined;
}

function number(el: Element | undefined, name: string, fallback: number): number {
  const s = text(el, name);
  if (s === undefined) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function placemarkName(el: Element): string | undefined {
  for (let n: Node | null = el.parentNode; n && n.nodeType === 1; n = n.parentNode) {
    if (localOf(n as Element) === 'Placemark') return text(n as Element, 'name');
  }
  return undefined;
}

/** Every KML <Model> in a doc.kml (inside a KMZ): its <Link><href> and the placement from Location, Orientation, Scale, altitudeMode. */
export function parseKmlModels(kml: string): KmlModel[] {
  const doc = parseXml(kml);
  const models: KmlModel[] = [];
  for (const model of descendants(doc.documentElement, 'Model')) {
    const link = children(model, 'Link')[0] ?? children(model, 'Url')[0];
    const href = text(link, 'href');
    const loc = children(model, 'Location')[0];
    if (!href || !loc) continue;
    const lat = number(loc, 'latitude', NaN);
    const lng = number(loc, 'longitude', NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const altitudeMode = KML_MODES[text(model, 'altitudeMode') ?? ''] ?? 'clamp';
    const orient = children(model, 'Orientation')[0];
    const sc = children(model, 'Scale')[0];
    // KML scale is per axis, ours is uniform: take the mean.
    const scale = (number(sc, 'x', 1) + number(sc, 'y', 1) + number(sc, 'z', 1)) / 3;
    const name = placemarkName(model);
    models.push({
      href,
      ...(name ? { name } : {}),
      placement: {
        lat,
        lng,
        alt: altitudeMode === 'clamp' ? 0 : number(loc, 'altitude', 0),
        altitudeMode,
        // KML turns clockwise looking down each axis toward the origin: heading matches yaw, tilt is nose down, roll is right side up.
        yawDeg: number(orient, 'heading', 0),
        pitchDeg: 0 - number(orient, 'tilt', 0),
        rollDeg: 0 - number(orient, 'roll', 0),
        scale: scale > 0 ? scale : 1,
      },
    });
  }
  return models;
}
