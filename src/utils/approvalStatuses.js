/** Purchase + shift approval statuses (mirror elmahdi.api.purchasing where noted). */

export const APPROVAL_STATUS = {
  DRAFT: 'draft',
  PENDING_MANAGER: 'pending_manager',
  PENDING_ACCOUNTANT: 'pending_accountant',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUBMITTED: 'submitted',
};

/** @deprecated Use APPROVAL_STATUS — kept for shift UI compatibility */
export const ApprovalStatus = {
  DRAFT: APPROVAL_STATUS.DRAFT,
  PENDING: 'pending_approval',
  APPROVED: APPROVAL_STATUS.APPROVED,
  REJECTED: APPROVAL_STATUS.REJECTED,
  SUBMITTED: APPROVAL_STATUS.SUBMITTED,
};

export function normalizeApprovalLevel(level) {
  const l = String(level || '').trim().toLowerCase();
  if (l === 'accountant') return 'accountant';
  if (l === 'manager') return 'manager';
  return l;
}

export function isPendingPurchaseStatus(status) {
  return (
    status === APPROVAL_STATUS.PENDING_MANAGER ||
    status === APPROVAL_STATUS.PENDING_ACCOUNTANT ||
    status === ApprovalStatus.PENDING
  );
}

export function approvalStatusLabel(status) {
  switch (status) {
    case APPROVAL_STATUS.PENDING_MANAGER:
      return 'Pending manager approval';
    case APPROVAL_STATUS.PENDING_ACCOUNTANT:
      return 'Pending accountant approval';
    case APPROVAL_STATUS.SUBMITTED:
      return 'Submitted';
    case APPROVAL_STATUS.APPROVED:
      return 'Approved';
    case APPROVAL_STATUS.REJECTED:
      return 'Rejected';
    case ApprovalStatus.PENDING:
      return 'Pending approval';
    default:
      return 'Draft';
  }
}

export function purchaseReceiptApprovalStatus(doc) {
  if (!doc) return APPROVAL_STATUS.DRAFT;
  if (doc.docstatus === 1) return APPROVAL_STATUS.SUBMITTED;
  const raw = String(doc.approval_status || '').trim().toLowerCase();
  if (raw === APPROVAL_STATUS.REJECTED) return APPROVAL_STATUS.REJECTED;
  if (raw === APPROVAL_STATUS.APPROVED) return APPROVAL_STATUS.APPROVED;
  if (raw === APPROVAL_STATUS.SUBMITTED) return APPROVAL_STATUS.SUBMITTED;
  if (raw === APPROVAL_STATUS.PENDING_ACCOUNTANT) return APPROVAL_STATUS.PENDING_ACCOUNTANT;
  if (raw === APPROVAL_STATUS.PENDING_MANAGER) return APPROVAL_STATUS.PENDING_MANAGER;
  if (doc.pending_purchase_approval || raw === 'pending') {
    const level = normalizeApprovalLevel(doc.approval_level || doc.purchase_approval_level);
    if (level === 'accountant') return APPROVAL_STATUS.PENDING_ACCOUNTANT;
    return APPROVAL_STATUS.PENDING_MANAGER;
  }
  return APPROVAL_STATUS.DRAFT;
}

export function purchaseReceiptStatusLabel(doc) {
  return approvalStatusLabel(purchaseReceiptApprovalStatus(doc));
}

export function shiftSessionApprovalStatus(session) {
  if (!session) return APPROVAL_STATUS.DRAFT;
  const ap = session.approvalStatus || session.audit?.approval_status;
  if (ap === 'rejected') return APPROVAL_STATUS.REJECTED;
  if (session.closing?.docstatus === 1) return APPROVAL_STATUS.SUBMITTED;
  if (ap === 'approved') return APPROVAL_STATUS.APPROVED;
  if (session.sessionStatus === 'pending_approval' || ap === 'pending') {
    return ApprovalStatus.PENDING;
  }
  if (!session.closing) return APPROVAL_STATUS.DRAFT;
  return APPROVAL_STATUS.DRAFT;
}

export function pendingApproverLabel(level, caps) {
  const normalized = normalizeApprovalLevel(level);
  if (normalized === 'accountant') {
    return caps?.canApprovePurchasingAccountant ? 'You (Accountant)' : 'Accountant';
  }
  if (normalized === 'manager') {
    return caps?.canApprovePurchasing ? 'You (Manager)' : 'Store Manager';
  }
  return '—';
}

export function purchaseApprovalActionState(doc, caps, user) {
  const level = normalizeApprovalLevel(doc?.approval_level || doc?.purchase_approval_level);
  const status = purchaseReceiptApprovalStatus(doc);

  if (doc?.can_approve === false && doc?.approve_blocked_reason) {
    return { canAct: false, reason: doc.approve_blocked_reason };
  }
  if (doc?.can_approve === true) {
    return { canAct: true, reason: '' };
  }

  const requester = doc?.requested_by || '';
  const userId = user?.email || user?.name || '';
  if (requester && userId && requester === userId) {
    return { canAct: false, reason: 'You cannot approve your own purchase receipt.' };
  }

  if (status === APPROVAL_STATUS.PENDING_ACCOUNTANT && !caps?.canApprovePurchasingAccountant) {
    return { canAct: false, reason: 'Waiting for accountant approval.' };
  }
  if (
    status === APPROVAL_STATUS.PENDING_MANAGER &&
    !caps?.canApprovePurchasing &&
    !caps?.canApprovePurchasingAccountant
  ) {
    return { canAct: false, reason: 'Waiting for store manager approval.' };
  }

  if (caps?.canManageSystem) return { canAct: true, reason: '' };
  if (level === 'accountant' && !caps?.canApprovePurchasingAccountant) {
    return {
      canAct: false,
      reason: 'Accountant approval required — your role cannot approve this receipt.',
    };
  }
  if (level === 'manager' && !caps?.canApprovePurchasing && !caps?.canApprovePurchasingAccountant) {
    return {
      canAct: false,
      reason: 'Manager approval required — your role cannot approve this receipt.',
    };
  }

  return { canAct: true, reason: '' };
}
