import type { Project } from '../../types/session';
import { getSessionList, deleteSession } from './sessions';
import { getFromStorage, saveToStorage, removeStorage } from './local';

const PROJECT_LIST_KEY = 'or_projects';
const projectKey = (id: string) => `or_project_${id}`;

export const getProjectList = (): Project[] =>
  getFromStorage<Project[]>(PROJECT_LIST_KEY, []);

export const saveProject = (project: Project): void => {
  const list = getProjectList();
  const idx = list.findIndex((p) => p.id === project.id);
  if (idx >= 0) list[idx] = project;
  else list.unshift(project);
  saveToStorage(PROJECT_LIST_KEY, list);
  saveToStorage(projectKey(project.id), project);
};

export const getProject = (id: string): Project | null =>
  getFromStorage<Project>(projectKey(id));

/** Deletes a project and every session that belongs to it. */
export const deleteProject = (id: string): void => {
  getSessionList()
    .filter((s) => s.projectId === id)
    .forEach((s) => deleteSession(s.id));

  saveToStorage(
    PROJECT_LIST_KEY,
    getProjectList().filter((p) => p.id !== id)
  );
  removeStorage(projectKey(id));
};
