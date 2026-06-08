/**
 * Workspace Settings API — Phase 4.
 *
 * Thin client over elmahdi.api.workspace_settings. Each workspace has
 * its own asserter — calls from a non-eligible user return 403 with a
 * clear message.
 */
import api from './api';

const BASE = '/api/method/elmahdi.api.workspace_settings';

export async function getWorkspaceSection(workspace) {
  const res = await api.get(`${BASE}.get_workspace_section`, {
    params: { workspace },
  });
  return res.data?.message || { workspace, blocks: [] };
}

export async function updateWorkspaceSection(workspace, payload) {
  const res = await api.post(`${BASE}.update_workspace_section`, {
    workspace,
    payload: JSON.stringify(payload || {}),
  });
  return res.data?.message;
}

export async function listHrCatalogs() {
  const res = await api.get(`${BASE}.list_hr_catalogs`);
  return res.data?.message || {};
}

/** Workspace-name → audit-log section name. */
export function workspaceAuditSection(workspace) {
  return `${workspace}-workspace`;
}
