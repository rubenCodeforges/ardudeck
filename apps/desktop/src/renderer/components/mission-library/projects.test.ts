import { describe, it, expect } from 'vitest';
import { buildProjects } from './ProjectsBrowser';
import type { MissionSummary } from '../../../shared/mission-library-types';
import type { SurveyDocumentSummary } from '../../../shared/survey-document-types';
import type { VaultMission, VaultSurveyArea } from '../../../shared/ipc-channels';

function area(id: string, site?: string): SurveyDocumentSummary {
  return {
    id,
    name: `Area ${id}`,
    description: '',
    tags: [],
    ...(site ? { site } : {}),
    generatorId: 'grid',
    revision: 1,
    preview: { boundingBox: null, areaSqm: null, vertexCount: 4 },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function mission(id: string, site?: string): MissionSummary {
  return {
    id,
    name: `Mission ${id}`,
    description: '',
    ...(site ? { site } : {}),
    vehicleProfileId: null,
    tags: [],
    waypointCount: 10,
    totalDistanceMeters: 100,
    boundingBox: null,
    flightCount: 0,
    lastFlightStatus: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function vaultArea(id: string, site: string): VaultSurveyArea {
  return {
    site,
    path: `sites/${site}/areas/${id}.json`,
    id,
    name: `Area ${id}`,
    revision: 3,
    generatorId: 'grid',
    updatedAt: '2026-09-02T00:00:00.000Z',
  };
}

function vaultMission(id: string, site: string): VaultMission {
  return {
    site,
    path: `sites/${site}/missions/${id}.mission.json`,
    id,
    name: `Mission ${id}`,
    waypointCount: 12,
    updatedAt: '2026-09-02T00:00:00.000Z',
  };
}

describe('projects', () => {
  it('collects areas, missions and vault contents under one site', () => {
    const projects = buildProjects({
      areas: [area('a1', 'north-farm')],
      missions: [mission('m1', 'north-farm')],
      vaultAreas: [vaultArea('a2', 'north-farm')],
      vaultMissions: [vaultMission('m2', 'north-farm')],
      vaultSites: [{ site: 'north-farm', missions: ['survey-day-1'] }],
    });
    expect(projects).toHaveLength(1);
    expect(projects[0]!.name).toBe('north-farm');
    expect(projects[0]!.vaultMissions.map((m) => m.id)).toEqual(['m2']);
    expect(projects[0]!.areas.map((a) => a.id)).toEqual(['a1']);
    expect(projects[0]!.missions.map((m) => m.id)).toEqual(['m1']);
    expect(projects[0]!.vaultAreas.map((a) => a.id)).toEqual(['a2']);
    expect(projects[0]!.legacyVaultMissions).toEqual(['survey-day-1']);
  });

  it('keeps a vault-only project visible with its older waypoints saves', () => {
    const projects = buildProjects({
      areas: [],
      missions: [],
      vaultAreas: [],
      vaultMissions: [],
      vaultSites: [{ site: 'TEst', missions: ['first-pass', 'second-pass'] }],
    });
    expect(projects).toHaveLength(1);
    expect(projects[0]!.legacyVaultMissions).toEqual(['first-pass', 'second-pass']);
  });

  it('leaves out anything with no site, rather than inventing one', () => {
    const projects = buildProjects({
      areas: [area('a1'), area('a2', 'south-field')],
      missions: [mission('m1')],
      vaultAreas: [],
      vaultMissions: [],
      vaultSites: [],
    });
    expect(projects.map((p) => p.name)).toEqual(['south-field']);
    expect(projects[0]!.areas).toHaveLength(1);
  });

  it('sorts projects by name and keeps sites apart', () => {
    const projects = buildProjects({
      areas: [area('a1', 'zeta'), area('a2', 'alpha')],
      missions: [],
      vaultAreas: [],
      vaultMissions: [],
      vaultSites: [{ site: 'mid' }],
    });
    expect(projects.map((p) => p.name)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('creates a project for a vault site that has nothing local yet', () => {
    const projects = buildProjects({
      areas: [],
      missions: [],
      vaultAreas: [vaultArea('a9', 'remote-site')],
      vaultMissions: [],
      vaultSites: [],
    });
    expect(projects).toHaveLength(1);
    expect(projects[0]!.name).toBe('remote-site');
    expect(projects[0]!.areas).toHaveLength(0);
    expect(projects[0]!.vaultAreas).toHaveLength(1);
  });
});
