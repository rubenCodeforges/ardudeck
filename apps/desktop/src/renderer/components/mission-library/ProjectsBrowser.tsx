/**
 * Projects: one site's areas and missions in one place, from this machine and
 * from the vault, so a job is something you open rather than something you
 * reassemble from a flat list of plans.
 */

import { useTranslation } from 'react-i18next';
import { useEffect, useMemo } from 'react';
import { CloudDownload, FolderOpen, Map as MapIcon, Route } from 'lucide-react';
import { useSurveyAreaStore } from '../../stores/survey-area-store';
import { useSurveyStore } from '../../stores/survey-store';
import { useMissionStore } from '../../stores/mission-store';
import { useMissionLibraryStore } from '../../stores/mission-library-store';
import { useNavigationStore } from '../../stores/navigation-store';
import type { MissionSummary } from '../../../shared/mission-library-types';
import type { SurveyDocumentSummary } from '../../../shared/survey-document-types';
import type { VaultMission, VaultSurveyArea } from '../../../shared/ipc-channels';

export interface Project {
  name: string;
  areas: SurveyDocumentSummary[];
  missions: MissionSummary[];
  vaultAreas: VaultSurveyArea[];
  vaultMissions: VaultMission[];
  /** Older .waypoints saves in the vault: listed, but not editable back. */
  legacyVaultMissions: string[];
}

/** Everything that names a site, folded into one list of projects. */
export function buildProjects(input: {
  areas: SurveyDocumentSummary[];
  missions: MissionSummary[];
  vaultAreas: VaultSurveyArea[];
  vaultMissions: VaultMission[];
  /** Site folders in the repo, so a project with nothing local still appears. */
  vaultSites: Array<{ site: string; missions?: string[] }>;
}): Project[] {
  const byName = new Map<string, Project>();
  const of = (name: string): Project => {
    const existing = byName.get(name);
    if (existing) return existing;
    const created: Project = { name, areas: [], missions: [], vaultAreas: [], vaultMissions: [], legacyVaultMissions: [] };
    byName.set(name, created);
    return created;
  };

  for (const area of input.areas) if (area.site) of(area.site).areas.push(area);
  for (const mission of input.missions) if (mission.site) of(mission.site).missions.push(mission);
  for (const area of input.vaultAreas) of(area.site).vaultAreas.push(area);
  for (const mission of input.vaultMissions) of(mission.site).vaultMissions.push(mission);
  for (const site of input.vaultSites) of(site.site).legacyVaultMissions.push(...(site.missions ?? []));

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function ProjectsBrowser({ tabs }: { tabs: React.ReactNode }) {
  const { t } = useTranslation();
  const { areas, vaultAreas, vaultSiteInfo, loadAreas, loadVault, getArea, pullFromVault } = useSurveyAreaStore();
  const missions = useMissionLibraryStore((s) => s.missions);
  const loadMissions = useMissionLibraryStore((s) => s.loadMissions);
  const vaultMissions = useMissionLibraryStore((s) => s.vaultMissions);
  const loadVaultMissions = useMissionLibraryStore((s) => s.loadVaultMissions);
  const pullMissionFromVault = useMissionLibraryStore((s) => s.pullMissionFromVault);
  const addSavedArea = useSurveyStore((s) => s.addSavedArea);
  const setMissionItemsFromFile = useMissionStore((s) => s.setMissionItemsFromFile);
  const setHomePosition = useMissionStore((s) => s.setHomePosition);
  const setView = useNavigationStore((s) => s.setView);

  useEffect(() => {
    void loadAreas();
    void loadVault();
    void loadMissions();
    void loadVaultMissions();
  }, []);

  const projects = useMemo(
    () => buildProjects({ areas, missions, vaultAreas, vaultMissions, vaultSites: vaultSiteInfo }),
    [areas, missions, vaultAreas, vaultMissions, vaultSiteInfo],
  );

  const openArea = async (id: string) => {
    const doc = await getArea(id);
    if (!doc) return;
    if (await addSavedArea(doc)) setView('mission');
  };

  const openMission = async (id: string) => {
    const mission = await window.electronAPI?.missionLibraryGet(id);
    if (!mission) return;
    if (mission.homePosition) {
      setHomePosition(mission.homePosition.lat, mission.homePosition.lon, mission.homePosition.alt);
    }
    setMissionItemsFromFile(mission.items, mission.groups);
    setView('mission');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-subtle">
        <div className="flex items-center gap-4 flex-wrap">
          {tabs}
          <span className="text-xs text-content-secondary">
            {t('mission-library:projectsBrowser.projectCount', { count: projects.length })}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface border border-subtle flex items-center justify-center mb-4">
              <FolderOpen className="w-7 h-7 text-content-tertiary" />
            </div>
            <h3 className="text-sm font-medium text-content mb-1">{t('mission-library:projectsBrowser.emptyTitle')}</h3>
            <p className="text-xs text-content-secondary max-w-sm">
              {t('mission-library:projectsBrowser.emptyBody')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <div key={project.name} className="rounded-xl border border-subtle bg-surface">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-subtle">
                  <FolderOpen className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-content">{project.name}</span>
                  <span className="text-[11px] text-content-secondary">
                    {t('mission-library:projectsBrowser.summary', { areas: project.areas.length + project.vaultAreas.length, missions: project.missions.length + project.vaultMissions.length + project.legacyVaultMissions.length })}
                  </span>
                </div>

                <div className="grid gap-4 p-4 md:grid-cols-2">
                  <div>
                    <div className="text-[10px] font-medium text-content-secondary uppercase tracking-wider mb-1.5">{t('mission-library:projectsBrowser.surveyAreas')}</div>
                    {project.areas.length === 0 && project.vaultAreas.length === 0 ? (
                      <p className="text-xs text-content-tertiary">{t('mission-library:projectsBrowser.noneYet')}</p>
                    ) : (
                      <ul className="space-y-1">
                        {project.areas.map((area) => (
                          <li key={area.id}>
                            <button
                              onClick={() => void openArea(area.id)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-content hover:bg-surface-raised transition-colors"
                            >
                              <MapIcon className="w-3.5 h-3.5 text-content-secondary shrink-0" />
                              <span className="truncate">{area.name}</span>
                              <span className="ml-auto text-[10px] text-content-secondary">{t('mission-library:projectsBrowser.revision', { n: area.revision })}</span>
                            </button>
                          </li>
                        ))}
                        {project.vaultAreas
                          .filter((v) => !project.areas.some((a) => a.id === v.id))
                          .map((v) => (
                            <li key={v.path}>
                              <button
                                onClick={() => void pullFromVault(v.path)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-content-secondary hover:bg-surface-raised transition-colors"
                              >
                                <CloudDownload className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{v.name}</span>
                                <span className="ml-auto text-[10px]">{t('mission-library:projectsBrowser.copyFromBackup')}</span>
                              </button>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] font-medium text-content-secondary uppercase tracking-wider mb-1.5">{t('mission-library:projectsBrowser.missions')}</div>
                    {project.missions.length === 0 && project.vaultMissions.length === 0 && project.legacyVaultMissions.length === 0 ? (
                      <p className="text-xs text-content-tertiary">{t('mission-library:projectsBrowser.noneYet')}</p>
                    ) : (
                      <ul className="space-y-1">
                        {project.missions.map((mission) => (
                          <li key={mission.id}>
                            <button
                              onClick={() => void openMission(mission.id)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-content hover:bg-surface-raised transition-colors"
                            >
                              <Route className="w-3.5 h-3.5 text-content-secondary shrink-0" />
                              <span className="truncate">{mission.name}</span>
                              <span className="ml-auto text-[10px] text-content-secondary">{t('mission-library:projectsBrowser.wpCount', { count: mission.waypointCount })}</span>
                            </button>
                          </li>
                        ))}
                        {project.vaultMissions
                          .filter((v) => !project.missions.some((m) => m.id === v.id))
                          .map((v) => (
                            <li key={v.path}>
                              <button
                                onClick={() => void pullMissionFromVault(v.path)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-content-secondary hover:bg-surface-raised transition-colors"
                              >
                                <CloudDownload className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{v.name}</span>
                                <span className="ml-auto text-[10px]">{t('mission-library:projectsBrowser.copyFromBackup')}</span>
                              </button>
                            </li>
                          ))}
                        {project.legacyVaultMissions.map((name) => (
                          <li
                            key={`legacy-${name}`}
                            className="flex items-center gap-2 px-2 py-1.5 text-xs text-content-tertiary"
                            data-tip={t('mission-library:projectsBrowser.legacyTip')}
                          >
                            <Route className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{name}</span>
                            <span className="ml-auto text-[10px]">{t('mission-library:projectsBrowser.waypointsOnly')}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
