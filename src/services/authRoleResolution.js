/**
 * Resolve ERP roles for the logged-in user.
 * Primary: elmahdi.api.auth.get_session_identity (server-side frappe.get_roles).
 * Fallbacks: User field read, User doc, Role Profile expansion.
 */

import {
  deriveCapabilities,
  homePathFromCapabilities,
} from '../auth/capabilities';
import { resolveRoleProfileKey } from '../auth/roleProfileResolution';
import {
  getTemplateByRoleProfile,
  OPERATIONAL_USER_TEMPLATES,
} from '../auth/operationalUserTemplates';
import {
  getHasRolesForUser,
  getRoleProfile,
  getSessionIdentity,
  getUserFieldValues,
  getUserRoles,
} from './api';

const ALLOWED_ROLE_PROFILES = new Set(
  Object.values(OPERATIONAL_USER_TEMPLATES).map((t) => t.roleProfileName),
);

export class AuthResolutionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'AuthResolutionError';
  }
}

function extractRolesFromUserDoc(userData) {
  return (userData?.roles || [])
    .map((r) => (typeof r === 'string' ? r : r?.role))
    .filter(Boolean);
}

function extractRolesFromHasRoleRows(rows = []) {
  return rows.map((r) => r.role).filter(Boolean);
}

function extractRolesFromRoleProfileDoc(doc) {
  return (doc?.roles || [])
    .map((r) => (typeof r === 'string' ? r : r?.role))
    .filter(Boolean);
}

function mergeRoleLists(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const role of list) {
      if (role && !seen.has(role)) {
        seen.add(role);
        out.push(role);
      }
    }
  }
  return out;
}

function isAllowlistedRoleProfile(name) {
  const key = resolveRoleProfileKey(name);
  return Boolean(key && ALLOWED_ROLE_PROFILES.has(key));
}

function applyIdentityPayload(userData, payload) {
  if (!payload || typeof payload !== 'object') return userData;
  return {
    ...userData,
    name: payload.name || userData.name,
    email: payload.email ?? userData.email,
    full_name: payload.full_name || userData.full_name,
    first_name: payload.first_name ?? userData.first_name,
    last_name: payload.last_name ?? userData.last_name,
    user_image: payload.user_image ?? userData.user_image,
    role_profile_name: payload.role_profile_name ?? userData.role_profile_name,
  };
}

/**
 * @param {string} username
 * @returns {Promise<{ userData: object, roleList: string[], roleProfileName: string, caps: object, homePath: string, sources: string[] }>}
 */
export async function resolveUserAuthProfile(username) {
  const sources = [];
  let roleList = [];
  let roleProfileName = '';
  let userData = { name: username };
  let sessionIdentityMissing = false;

  // 1) Elmahdi server method — authoritative when installed on ERPNext
  try {
    const res = await getSessionIdentity();
    const data = res.data?.message;
    if (data?.roles?.length) {
      roleList = mergeRoleLists(roleList, data.roles);
      sources.push('session-identity');
    }
    userData = applyIdentityPayload(userData, data);
    roleProfileName = data?.role_profile_name || roleProfileName;
  } catch (e) {
    const msg = String(e?.message || e?.erpMessage || '');
    if (msg.includes('not whitelisted') || msg.includes('No module named') || e?.status === 404) {
      sessionIdentityMissing = true;
    }
  }

  // 2) User field values (lighter than full doc — sometimes permitted for self)
  if (!roleList.length || !roleProfileName) {
    try {
      const res = await getUserFieldValues(username, [
        'role_profile_name',
        'first_name',
        'last_name',
        'email',
        'user_image',
      ]);
      const data = res.data?.message;
      if (data) {
        userData = applyIdentityPayload(userData, data);
        roleProfileName = data.role_profile_name || roleProfileName;
        sources.push('user-fields');
      }
    } catch {
      /* User read denied */
    }
  }

  // 3) Full User document (works for Administrator)
  try {
    const profile = await getUserRoles(username);
    const data = profile.data?.data;
    if (data) {
      userData = applyIdentityPayload(userData, data);
      roleProfileName = data.role_profile_name || roleProfileName;
      const docRoles = extractRolesFromUserDoc(data);
      if (docRoles.length) {
        roleList = mergeRoleLists(roleList, docRoles);
        sources.push('user-doc');
      }
    }
  } catch {
    /* expected for operational users */
  }

  // 4) Has Role REST (often 403 — optional)
  if (!roleList.length) {
    try {
      const hasRoleRows = await getHasRolesForUser(username);
      const fromHasRole = extractRolesFromHasRoleRows(hasRoleRows);
      if (fromHasRole.length) {
        roleList = mergeRoleLists(roleList, fromHasRole);
        sources.push('has-role');
      }
    } catch {
      /* forbidden on most operational profiles */
    }
  }

  // 5) Expand allowlisted Role Profile
  if (roleProfileName && isAllowlistedRoleProfile(roleProfileName)) {
    try {
      const rpRes = await getRoleProfile(roleProfileName);
      const profileRoles = extractRolesFromRoleProfileDoc(rpRes.data?.data);
      if (profileRoles.length) {
        roleList = mergeRoleLists(roleList, profileRoles);
        sources.push('role-profile');
      }
    } catch {
      /* profile name alone may still map workspace */
    }
  }

  const caps = deriveCapabilities(roleList, roleProfileName);
  const homePath = homePathFromCapabilities(caps);

  if (roleList.length === 0 && !isAllowlistedRoleProfile(roleProfileName)) {
    if (sessionIdentityMissing) {
      throw new AuthResolutionError(
        'session-identity-missing',
        'Install the Elmahdi ERP app on the server (elmahdi.api.auth.get_session_identity). See erp-custom/README.md.',
      );
    }
    throw new AuthResolutionError(
      'roles-unverified',
      'ERP roles could not be verified for this account.',
    );
  }

  if (homePath === '/login') {
    if (!roleProfileName && roleList.length === 0) {
      throw new AuthResolutionError(
        'no-roles-or-profile',
        'No ERP roles or role profile found for this account.',
      );
    }
    const hint =
      import.meta.env.DEV && (roleList.length || roleProfileName)
        ? ` (roles: ${roleList.join(', ') || 'none'}; profile: ${roleProfileName || 'none'})`
        : '';
    throw new AuthResolutionError(
      'no-workspace',
      `No SPA workspace is mapped for this account’s ERP roles.${hint}`,
    );
  }

  if (roleList.length === 0 && isAllowlistedRoleProfile(roleProfileName)) {
    sources.push('role-profile-name');
    if (!getTemplateByRoleProfile(roleProfileName)) {
      throw new AuthResolutionError(
        'profile-unmapped',
        'Role profile is not mapped to an operational template.',
      );
    }
  }

  return {
    userData,
    roleList,
    roleProfileName,
    caps,
    homePath,
    sources,
  };
}
