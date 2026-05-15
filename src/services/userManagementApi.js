/**
 * Operational user provisioning — ERPNext is the permission authority.
 * Sequence: create User (disabled) → role profile → User Permissions → enable.
 */

import {
  createUser,
  createUserPermission,
  getCompanies,
  setUserEnabled,
  updateUser,
} from './api';
import { getTemplateById, validateProvisioningInput } from '../auth/operationalUserTemplates';

export { getPriceLists } from './api';
export { listWarehouses as listWarehousesForProvisioning } from './inventoryApi';

/**
 * @param {object} payload
 * @param {string} payload.templateId
 * @param {string} payload.email
 * @param {string} payload.first_name
 * @param {string[]} payload.warehouses
 * @param {string} [payload.priceList]
 * @param {string} payload.company
 * @param {boolean} [payload.send_welcome_email]
 */
export async function provisionOperationalUser(payload) {
  const {
    templateId,
    email,
    first_name,
    warehouses = [],
    priceList = '',
    company,
    send_welcome_email = false,
  } = payload;

  const validation = validateProvisioningInput(templateId, {
    warehouses,
    priceList,
    company,
  });
  if (!validation.valid) {
    const err = new Error(validation.error);
    err.code = 'VALIDATION';
    throw err;
  }

  const template = getTemplateById(templateId);
  const whList = warehouses.filter(Boolean);

  let username = null;

  try {
    const createRes = await createUser({
      email: email.trim(),
      first_name: first_name.trim(),
      enabled: 0,
      send_welcome_email: 0,
      user_type: 'System User',
    });
    username = createRes.data?.data?.name;
    if (!username) {
      throw new Error('User was created but ERP did not return a username.');
    }

    await updateUser(username, {
      role_profile_name: template.roleProfileName,
    });

    for (const for_value of whList) {
      await createUserPermission({
        user: username,
        allow: 'Warehouse',
        for_value,
      });
    }

    if (template.requiresPriceList && priceList.trim()) {
      await createUserPermission({
        user: username,
        allow: 'Price List',
        for_value: priceList.trim(),
      });
    }

    if (company.trim()) {
      await createUserPermission({
        user: username,
        allow: 'Company',
        for_value: company.trim(),
      });
    }

    await setUserEnabled(username, true);

    if (send_welcome_email) {
      await updateUser(username, { send_welcome_email: 1 });
    }

    return {
      username,
      role_profile_name: template.roleProfileName,
      templateId: template.id,
      warehouses: whList,
      priceList: priceList.trim() || null,
      company: company.trim(),
    };
  } catch (e) {
    if (username) {
      try {
        await setUserEnabled(username, false);
      } catch {
        /* leave disabled orphan for Desk cleanup */
      }
    }
    const wrapped = e?.code === 'VALIDATION' ? e : new Error(formatProvisionError(e, username));
    if (username && !wrapped.username) wrapped.username = username;
    throw wrapped;
  }
}

function formatProvisionError(e, username) {
  const base = e?.message || e?.erpMessage || 'Failed to provision user.';
  if (username) {
    return `${base} User "${username}" was disabled — fix in ERP Desk or retry.`;
  }
  return base;
}

/**
 * Disable user (production offboarding). Enable uses setUserEnabled directly.
 */
export async function disableOperationalUser(username) {
  await setUserEnabled(username, false);
}

export async function enableOperationalUser(username) {
  await setUserEnabled(username, true);
}

/** Default company for new users. */
export async function getDefaultCompany() {
  const res = await getCompanies({ limit: 1 });
  return res.data?.data?.[0]?.name || '';
}
