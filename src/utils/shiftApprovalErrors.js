import { getUserFriendlyMessage, PERMISSION_ERROR_MESSAGE } from './errorHandling';

/**
 * Close shift approval modals and surface authorization failures without leaving a broken overlay.
 */
export function resolveShiftApprovalError(error, fallback = 'Could not complete shift approval.') {
  const message = getUserFriendlyMessage(error, fallback);
  if (error?.response?.status === 403 || error?.isPermissionError) {
    return PERMISSION_ERROR_MESSAGE;
  }
  return message;
}
