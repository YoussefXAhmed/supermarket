/**
 * User lifecycle constants (Phase 4.a).
 *
 * Mirror of `elmahdi.api.user_lifecycle` on the backend. Values are
 * strings matching the `User.elmahdi_lifecycle_state` Select options
 * exactly — do NOT translate them. Display labels go through
 * `getLifecycleLabel` (i18n-aware).
 *
 * State transitions ARE NOT enforced on the SPA — the backend FSM is
 * the only source of truth. The frontend uses these constants to:
 *   - render the right pill tone,
 *   - gate UI affordances (e.g. don't show "Re-enable" on Terminated),
 *   - filter lists ("Show invited users only"),
 *   - drive the user-management page's Phase 4.d/4.e workflows.
 */

export const USER_LIFECYCLE_STATES = Object.freeze({
  INVITED: 'Invited',
  ACTIVE: 'Active',
  LOCKED: 'Locked',
  DISABLED: 'Disabled',
  TERMINATED: 'Terminated',
});

export const USER_LIFECYCLE_STATE_VALUES = Object.freeze(
  Object.values(USER_LIFECYCLE_STATES)
);

/**
 * Map a lifecycle state to the canonical `.pill` tone used by the
 * design system. `info` for transient (Invited), `success` for steady
 * state (Active), `warning` for recoverable problem states (Locked),
 * `default` for inert (Disabled), `danger` for terminal (Terminated).
 */
export function getLifecycleTone(state) {
  switch (state) {
    case USER_LIFECYCLE_STATES.INVITED:    return 'info';
    case USER_LIFECYCLE_STATES.ACTIVE:     return 'success';
    case USER_LIFECYCLE_STATES.LOCKED:     return 'warning';
    case USER_LIFECYCLE_STATES.DISABLED:   return 'default';
    case USER_LIFECYCLE_STATES.TERMINATED: return 'danger';
    default:                                return 'default';
  }
}

/**
 * Translation-key fragment for a lifecycle state. Combine with
 * `t('users.lifecycle.' + getLifecycleI18nKey(state))` at the call site
 * to render a localized label. Returns 'unknown' for unrecognized
 * states (a defensive default that surfaces in QA without breaking the
 * render).
 */
export function getLifecycleI18nKey(state) {
  switch (state) {
    case USER_LIFECYCLE_STATES.INVITED:    return 'invited';
    case USER_LIFECYCLE_STATES.ACTIVE:     return 'active';
    case USER_LIFECYCLE_STATES.LOCKED:     return 'locked';
    case USER_LIFECYCLE_STATES.DISABLED:   return 'disabled';
    case USER_LIFECYCLE_STATES.TERMINATED: return 'terminated';
    default:                                return 'unknown';
  }
}

/**
 * Resolve a raw value (from the API or from local state) to a known
 * lifecycle state, falling back to Active for empty/legacy data.
 * The patch backfills every existing user, but during the migration
 * window the SPA might briefly see an empty string.
 */
export function normalizeLifecycleState(value) {
  if (USER_LIFECYCLE_STATE_VALUES.includes(value)) return value;
  return USER_LIFECYCLE_STATES.ACTIVE;
}
