import { describe, it, expect } from 'vitest';
import type { SurveyGroup } from './mission-group-types';
import {
  SURVEY_DOCUMENT_KIND,
  documentToSurveyGroup,
  isSurveyDocument,
  normalizeSurveyDocument,
  sourceIsBehind,
  composeSurveyDocument,
  summarizeSurveyDocument,
  surveyAreaFromGroup,
  surveyBoundingBox,
  surveyGroupToDocument,
  type SurveyDocument,
} from './survey-document-types';

const POLYGON = [
  { lat: 52.5, lng: 13.4 },
  { lat: 52.51, lng: 13.4 },
  { lat: 52.51, lng: 13.42 },
  { lat: 52.5, lng: 13.42 },
];

function group(overrides: Partial<SurveyGroup> = {}): SurveyGroup {
  return {
    id: 'g1',
    name: 'North field',
    kind: 'survey',
    color: '#38bdf8',
    visible: true,
    collapsed: false,
    order: 2,
    createdAt: 1,
    updatedAt: 2,
    generatorId: 'grid',
    generatorVersion: '3',
    polygon: POLYGON,
    holes: [[{ lat: 52.505, lng: 13.41 }, { lat: 52.506, lng: 13.41 }, { lat: 52.506, lng: 13.411 }]],
    workspace: POLYGON,
    config: { altitude: 80, overlap: 70, angle: 45 },
    lastGeneratedAt: 123,
    lastGeneratedSignature: 'abc',
    generatorResult: { cells: [1, 2, 3] },
    ...overrides,
  };
}

const META = { name: 'North field', now: '2026-09-24T10:00:00.000Z', newId: () => 'doc-1' };

describe('survey document from a mission group', () => {
  it('carries everything the generator consumes', () => {
    const doc = surveyGroupToDocument(group(), META);
    expect(doc.kind).toBe(SURVEY_DOCUMENT_KIND);
    expect(doc.id).toBe('doc-1');
    expect(doc.revision).toBe(1);
    expect(doc.area).toMatchObject({
      generatorId: 'grid',
      generatorVersion: '3',
      config: { altitude: 80, overlap: 70, angle: 45 },
      generatorResult: { cells: [1, 2, 3] },
    });
    expect(doc.area.polygon).toHaveLength(4);
    expect(doc.area.holes).toHaveLength(1);
    expect(doc.area.workspace).toHaveLength(4);
  });

  it('stores no waypoints', () => {
    const doc = surveyGroupToDocument(group(), META) as unknown as Record<string, unknown>;
    expect(doc.items).toBeUndefined();
    expect(doc.waypoints).toBeUndefined();
  });

  it('bumps the revision and keeps the id when saving over an existing document', () => {
    const doc = surveyGroupToDocument(group(), { ...META, id: 'doc-1', previousRevision: 6, createdAt: 'then' });
    expect(doc.id).toBe('doc-1');
    expect(doc.revision).toBe(7);
    expect(doc.createdAt).toBe('then');
    expect(doc.updatedAt).toBe(META.now);
  });

  it('computes a preview the browser can show without opening the area', () => {
    const doc = surveyGroupToDocument(group(), { ...META, areaSqm: 12345 });
    expect(doc.preview).toEqual({
      boundingBox: { minLat: 52.5, maxLat: 52.51, minLon: 13.4, maxLon: 13.42 },
      areaSqm: 12345,
      vertexCount: 4,
    });
  });

  it('omits optional geometry that the group does not have', () => {
    const doc = surveyGroupToDocument(group({ holes: undefined, workspace: undefined }), META);
    expect(doc.area.holes).toBeUndefined();
    expect(doc.area.workspace).toBeUndefined();
  });

  it('survives a JSON round trip unchanged', () => {
    const doc = surveyGroupToDocument(group(), META);
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });
});

describe('mission group from a survey document', () => {
  const doc = surveyGroupToDocument(group(), META);

  it('restores the generator inputs', () => {
    const g = documentToSurveyGroup(doc, { id: 'new-group', color: '#34d399', order: 0, now: 999 });
    expect(g.kind).toBe('survey');
    expect(g.generatorId).toBe('grid');
    expect(g.config).toEqual({ altitude: 80, overlap: 70, angle: 45 });
    expect(g.polygon).toEqual(POLYGON);
    expect(g.generatorResult).toEqual({ cells: [1, 2, 3] });
  });

  it('starts unsigned so the planner regenerates rather than trusting stale waypoints', () => {
    const g = documentToSurveyGroup(doc, { id: 'new-group', color: '#34d399', order: 0, now: 999 });
    expect(g.lastGeneratedSignature).toBeNull();
    expect(g.lastGeneratedAt).toBeNull();
  });

  it('records where it came from', () => {
    const g = documentToSurveyGroup(doc, { id: 'new-group', color: '#34d399', order: 0, now: 999 });
    expect(g.source).toEqual({ docId: 'doc-1', revision: 1, name: 'North field' });
  });

  it('does not alias the document config, so editing the group cannot mutate the file', () => {
    const g = documentToSurveyGroup(doc, { id: 'new-group', color: '#34d399', order: 0, now: 999 });
    (g.config as Record<string, unknown>).altitude = 120;
    expect(doc.area.config.altitude).toBe(80);
  });

  it('round-trips a group through a document', () => {
    const original = group();
    const back = documentToSurveyGroup(surveyGroupToDocument(original, META), {
      id: original.id,
      color: original.color,
      order: original.order,
      name: original.name,
      now: 5,
    });
    expect(back.polygon).toEqual(original.polygon);
    expect(back.holes).toEqual(original.holes);
    expect(back.workspace).toEqual(original.workspace);
    expect(back.config).toEqual(original.config);
    expect(back.generatorResult).toEqual(original.generatorResult);
  });
});

describe('saving over an existing area', () => {
  const first = composeSurveyDocument(
    { name: 'North field', site: 'north-farm', ...surveyAreaFromGroup(group(), 1000) },
    null,
    '2026-09-24T10:00:00.000Z',
    () => 'doc-1',
  );

  it('keeps the project when the save does not name one', () => {
    const second = composeSurveyDocument(
      { name: 'North field', ...surveyAreaFromGroup(group(), 1000) },
      first,
      '2026-09-24T11:00:00.000Z',
      () => 'unused',
    );
    expect(second.site).toBe('north-farm');
    expect(second.revision).toBe(2);
    expect(second.id).toBe('doc-1');
  });

  it('moves the area when the save names a different project', () => {
    const second = composeSurveyDocument(
      { name: 'North field', site: 'south-farm', ...surveyAreaFromGroup(group(), 1000) },
      first,
      '2026-09-24T11:00:00.000Z',
      () => 'unused',
    );
    expect(second.site).toBe('south-farm');
  });
});

describe('source tracking', () => {
  it('is behind when the saved area has a newer revision', () => {
    expect(sourceIsBehind({ docId: 'd', revision: 2, name: 'n' }, 5)).toBe(true);
  });

  it('is not behind at the same revision, or with no source at all', () => {
    expect(sourceIsBehind({ docId: 'd', revision: 5, name: 'n' }, 5)).toBe(false);
    expect(sourceIsBehind(undefined, 5)).toBe(false);
    expect(sourceIsBehind({ docId: 'd', revision: 2, name: 'n' }, undefined)).toBe(false);
  });
});

describe('validating a document from disk', () => {
  const valid = surveyGroupToDocument(group(), META);

  it('accepts a document this app wrote', () => {
    expect(isSurveyDocument(JSON.parse(JSON.stringify(valid)))).toBe(true);
  });

  it('rejects anything that is not one', () => {
    expect(isSurveyDocument(null)).toBe(false);
    expect(isSurveyDocument('{}')).toBe(false);
    expect(isSurveyDocument({ kind: 'ardudeck.mission' })).toBe(false);
    expect(isSurveyDocument({ ...valid, id: '' })).toBe(false);
    expect(isSurveyDocument({ ...valid, revision: 0 })).toBe(false);
  });

  it('rejects broken geometry rather than loading a survey that cannot generate', () => {
    expect(isSurveyDocument({ ...valid, area: { ...valid.area, polygon: [] } })).toBe(false);
    expect(isSurveyDocument({ ...valid, area: { ...valid.area, polygon: [{ lat: 1 }] } })).toBe(false);
    expect(isSurveyDocument({ ...valid, area: { ...valid.area, config: null } })).toBe(false);
    expect(isSurveyDocument({ ...valid, area: { ...valid.area, generatorId: '' } })).toBe(false);
  });

  it('keeps an unknown generator, so a file written with a module installed still opens', () => {
    const fromModule = { ...valid, area: { ...valid.area, generatorId: 'some.module.generator' } };
    expect(isSurveyDocument(fromModule)).toBe(true);
  });

  it('fills in what an older or hand-written file omits', () => {
    const sparse = {
      kind: SURVEY_DOCUMENT_KIND,
      version: 1,
      id: 'x',
      revision: 1,
      name: 'Sparse',
      area: { generatorId: 'grid', polygon: POLYGON, config: {} },
    } as unknown as SurveyDocument;
    expect(isSurveyDocument(sparse)).toBe(true);
    const doc = normalizeSurveyDocument(sparse);
    expect(doc.description).toBe('');
    expect(doc.tags).toEqual([]);
    expect(doc.preview.vertexCount).toBe(4);
    expect(doc.preview.boundingBox).toEqual({ minLat: 52.5, maxLat: 52.51, minLon: 13.4, maxLon: 13.42 });
  });
});

describe('summary and bounds', () => {
  it('summarizes without the geometry', () => {
    const summary = summarizeSurveyDocument(surveyGroupToDocument(group(), { ...META, tags: ['farm'] }));
    expect(summary).toMatchObject({ id: 'doc-1', name: 'North field', generatorId: 'grid', revision: 1, tags: ['farm'] });
    expect((summary as unknown as Record<string, unknown>).area).toBeUndefined();
  });

  it('returns no bounds for an empty polygon', () => {
    expect(surveyBoundingBox([])).toBeNull();
  });

  it('ignores non-finite vertices', () => {
    expect(surveyBoundingBox([{ lat: NaN, lng: 1 }, { lat: 10, lng: 20 }])).toEqual({
      minLat: 10, maxLat: 10, minLon: 20, maxLon: 20,
    });
  });
});
