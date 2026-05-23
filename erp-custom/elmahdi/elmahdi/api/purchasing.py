"""
Purchase Receipt buying-rate validation and approval workflow.
"""

import json
from datetime import datetime

import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime

AUDIT_PREFIX = "Elmahdi-Purchase-Audit"
MANAGER_VARIANCE_PCT = 10.0
ACCOUNTANT_VARIANCE_PCT = 20.0
RATE_EPSILON = 0.0001

STATUS_DRAFT = "draft"
STATUS_PENDING_MANAGER = "pending_manager"
STATUS_PENDING_ACCOUNTANT = "pending_accountant"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"
STATUS_SUBMITTED = "submitted"


def _normalize_level(level):
	if not level:
		return "none"
	return str(level).strip().lower()


def _status_for_pending(level):
	level = _normalize_level(level)
	if level == "accountant":
		return STATUS_PENDING_ACCOUNTANT
	if level == "manager":
		return STATUS_PENDING_MANAGER
	return STATUS_DRAFT


def _has_custom_field(fieldname):
    return frappe.db.has_column("Purchase Receipt", fieldname)


def _set_approval_fields(doc, pending, level, audit_dict):
    if _has_custom_field("pending_purchase_approval"):
        doc.pending_purchase_approval = 1 if pending else 0
    if _has_custom_field("purchase_approval_level"):
        doc.purchase_approval_level = "" if not level or level == "none" else _normalize_level(level)
    if _has_custom_field("approval_status") and audit_dict.get("approval_status"):
        doc.approval_status = audit_dict.get("approval_status")
    if _has_custom_field("variance_percent"):
        doc.variance_percent = flt(audit_dict.get("max_variance_pct"))
    if _has_custom_field("approval_role") and audit_dict.get("approval_role"):
        doc.approval_role = audit_dict.get("approval_role")
    if _has_custom_field("approved_by") and audit_dict.get("approved_by"):
        doc.approved_by = audit_dict.get("approved_by")
    if _has_custom_field("approved_at") and audit_dict.get("approved_at"):
        doc.approved_at = audit_dict.get("approved_at")
    if _has_custom_field("approval_reason") and audit_dict.get("approval_reason"):
        doc.approval_reason = audit_dict.get("approval_reason")
    audit_json = json.dumps(audit_dict, default=str)
    if _has_custom_field("purchase_rate_audit"):
        doc.purchase_rate_audit = audit_json
    existing = doc.remarks or ""
    if AUDIT_PREFIX not in existing:
        doc.remarks = f"{existing}\n{AUDIT_PREFIX}; approval_status={audit_dict.get('approval_status', 'none')}".strip()


def _parse_audit(doc):
    raw = ""
    if _has_custom_field("purchase_rate_audit") and doc.get("purchase_rate_audit"):
        raw = doc.purchase_rate_audit
    elif doc.remarks and AUDIT_PREFIX in doc.remarks:
        for part in doc.remarks.split(";"):
            if "audit_json=" in part:
                try:
                    raw = part.split("audit_json=", 1)[1]
                    break
                except Exception:
                    pass
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _user_roles():
    return set(frappe.get_roles(frappe.session.user))


def _is_admin_user():
    roles = _user_roles()
    return bool(roles & {"Administrator", "System Manager"})


def _can_approve_manager():
    if _is_admin_user():
        return True
    roles = _user_roles()
    return bool(roles & {"Purchase Manager", "Stock Manager", "Sales Manager", "Warehouse Manager"})


def _can_approve_accountant():
    if _is_admin_user():
        return True
    roles = _user_roles()
    return bool(roles & {"Accounts Manager", "Accounts User"})


def _is_purchasing_only_user():
    roles = _user_roles() - {"All", "Guest", "Desk User"}
    operational = roles & {"Purchase User", "Stock User"}
    approvers = roles & {
        "Purchase Manager",
        "Stock Manager",
        "Sales Manager",
        "Accounts Manager",
        "Accounts User",
    }
    return "Purchase User" in roles and not approvers and not _is_admin_user()


def _assert_not_self_approval(doc):
    if _is_admin_user():
        return
    user = frappe.session.user
    audit = _parse_audit(doc)
    requester = audit.get("requested_by") or doc.owner
    if requester == user:
        frappe.throw(_("You cannot approve your own purchase receipt."), frappe.PermissionError)


def _required_approval_role(level):
    level = _normalize_level(level)
    if level == "accountant":
        return "accountant"
    if level == "manager":
        return "manager"
    return None


def _assert_can_approve(level):
    level = _normalize_level(level)
    if _is_admin_user():
        return
    if level == "accountant":
        if not _can_approve_accountant():
            frappe.throw(_("Accountant approval required for this receipt."), frappe.PermissionError)
        return
    if level == "manager":
        if not (_can_approve_manager() or _can_approve_accountant()):
            frappe.throw(_("Manager approval required for this receipt."), frappe.PermissionError)
        return
    if level == "none":
        if not (_can_approve_manager() or _can_approve_accountant()):
            frappe.throw(_("Manager or accountant must submit this purchase receipt."), frappe.PermissionError)
        return
    frappe.throw(_("You cannot approve this purchase receipt."), frappe.PermissionError)


def _can_approve_row(level):
    level = _normalize_level(level)
    if _is_admin_user():
        return True
    if level == "accountant":
        return _can_approve_accountant()
    return _can_approve_manager() or _can_approve_accountant()


def _approval_action_state(doc, level):
    """Whether current user may approve/submit this draft receipt."""
    level = _normalize_level(level)
    try:
        _assert_not_self_approval(doc)
        _assert_can_approve(level)
    except frappe.PermissionError as e:
        return False, str(e)
    except frappe.ValidationError as e:
        return False, str(e)
    if _is_admin_user() or _can_approve_manager() or _can_approve_accountant():
        return True, ""
    if not doc.has_permission("submit"):
        return False, _(
            "Your role cannot submit Purchase Receipt in ERPNext. Ask an administrator to grant submit permission."
        )
    return True, ""


def assert_may_submit_purchase_receipt_direct():
    """Fail-closed: block REST/Desk/generic submit except approval workflow flag."""
    if getattr(frappe.flags, "elmahdi_purchase_approval_submit", False):
        return
    if _is_admin_user():
        return
    frappe.throw(
        _(
            "Purchase Receipt must be submitted through manager or accountant approval. "
            "Use the purchase approval workflow."
        ),
        frappe.PermissionError,
    )


def _assert_not_self_approval_by_owner(owner, audit=None):
    if _is_admin_user():
        return
    user = frappe.session.user
    requester = (audit or {}).get("requested_by") or owner
    if requester == user:
        frappe.throw(_("You cannot approve your own purchase receipt."), frappe.PermissionError)


def _approval_context_from_db(name):
    if not name:
        frappe.throw(_("Purchase Receipt name is required."), frappe.ValidationError)
    if not frappe.db.exists("Purchase Receipt", name):
        frappe.throw(_("Purchase Receipt {0} not found.").format(name), frappe.DoesNotExistError)

    fields = ["docstatus", "owner"]
    if _has_custom_field("purchase_approval_level"):
        fields.append("purchase_approval_level")
    if _has_custom_field("purchase_rate_audit"):
        fields.append("purchase_rate_audit")
    row = frappe.db.get_value("Purchase Receipt", name, fields, as_dict=True) or {}
    audit = {}
    if row.get("purchase_rate_audit"):
        try:
            audit = json.loads(row.purchase_rate_audit)
        except Exception:
            audit = {}
    level = _normalize_level(row.get("purchase_approval_level") or audit.get("approval_level") or "manager")
    return row, audit, level


def line_variance_pct(expected, entered):
    expected = flt(expected)
    entered = flt(entered)
    if expected <= RATE_EPSILON:
        return 100.0 if entered > RATE_EPSILON else 0.0
    return abs(entered - expected) / expected * 100.0


def approval_level_for_variance(pct):
    if pct <= MANAGER_VARIANCE_PCT + RATE_EPSILON:
        return "none"
    if pct <= ACCOUNTANT_VARIANCE_PCT + RATE_EPSILON:
        return "manager"
    return "accountant"


def validate_purchase_lines(lines):
    if not lines:
        frappe.throw(_("Add at least one line item."), frappe.ValidationError)
    for i, row in enumerate(lines, start=1):
        item_code = (row.get("item_code") or "").strip()
        if not item_code:
            frappe.throw(_("Row {0}: item code is required.").format(i), frappe.ValidationError)
        qty = flt(row.get("qty"))
        if qty <= 0:
            frappe.throw(_("Row {0}: quantity must be greater than zero.").format(i), frappe.ValidationError)
        rate = flt(row.get("rate"))
        if rate <= 0:
            frappe.throw(_("Row {0}: buying rate must be greater than zero.").format(i), frappe.ValidationError)


def get_expected_buying_rate(item_code):
    if frappe.has_permission("Item Price", "read"):
        from elmahdi.api.pricing import buying_price_map

        prices = buying_price_map([item_code])
        if item_code in prices:
            return flt(prices[item_code])

    latest = frappe.db.sql(
        """
        SELECT pri.rate
        FROM `tabPurchase Receipt Item` pri
        INNER JOIN `tabPurchase Receipt` pr ON pr.name = pri.parent
        WHERE pri.item_code = %s AND pr.docstatus = 1
        ORDER BY pr.posting_date DESC, pr.modified DESC
        LIMIT 1
        """,
        (item_code,),
        as_dict=True,
    )
    if latest:
        return flt(latest[0].rate)
    return 0.0


@frappe.whitelist()
def get_buying_rate_suggestions(item_codes):
    if isinstance(item_codes, str):
        item_codes = json.loads(item_codes) if item_codes.startswith("[") else [item_codes]
    out = {}
    for code in item_codes or []:
        code = (code or "").strip()
        if not code:
            continue
        expected = get_expected_buying_rate(code)
        out[code] = {"expected_rate": expected, "source": "item_price" if expected else "none"}
    return out


def _build_line_audit(lines):
    audited = []
    max_pct = 0.0
    for row in lines:
        item_code = row["item_code"].strip()
        qty = flt(row["qty"])
        rate = flt(row["rate"])
        expected = flt(row.get("expected_rate"))
        if expected <= 0:
            expected = get_expected_buying_rate(item_code)
        pct = line_variance_pct(expected, rate)
        max_pct = max(max_pct, pct)
        audited.append(
            {
                "item_code": item_code,
                "qty": qty,
                "rate": rate,
                "expected_rate": expected,
                "variance_pct": round(pct, 2),
                "amount": round(qty * rate, 2),
            }
        )
    level = approval_level_for_variance(max_pct)
    return audited, level, max_pct


def validate_purchase_receipt(doc, method=None):
    """Doc event: block invalid lines on save."""
    for row in doc.get("items") or []:
        if not row.item_code:
            frappe.throw(_("Item code is required on all rows."), frappe.ValidationError)
        if flt(row.qty) <= 0:
            frappe.throw(_("Quantity must be greater than zero for {0}.").format(row.item_code), frappe.ValidationError)
        if flt(row.rate) <= 0:
            frappe.throw(_("Buying rate must be greater than zero for {0}.").format(row.item_code), frappe.ValidationError)


def before_submit_purchase_receipt(doc, method=None):
    """Block direct submit; only elmahdi approval workflow or break-glass admin may submit."""
    assert_may_submit_purchase_receipt_direct()


@frappe.whitelist()
def create_purchase_receipt_workflow(
    supplier,
    company,
    warehouse,
    lines,
    posting_date=None,
):
    frappe.has_permission("Purchase Receipt", "create", throw=True)

    if isinstance(lines, str):
        lines = json.loads(lines)

    validate_purchase_lines(lines)

    audited, level, max_pct = _build_line_audit(lines)
    level = _normalize_level(level)
    # Purchasing officers always create draft; low-variance auto-submit uses elevated flag only.
    auto_submit = level == "none" and not _is_purchasing_only_user()
    pending_status = _status_for_pending(level) if not auto_submit else STATUS_SUBMITTED
    events = [
        {
            "action": "created",
            "user": frappe.session.user,
            "at": now_datetime().isoformat(),
        }
    ]
    for row in lines:
        prev = row.get("previous_rate")
        if prev is not None and flt(prev) != flt(row.get("rate")):
            events.append(
                {
                    "action": "rate_changed",
                    "user": frappe.session.user,
                    "at": now_datetime().isoformat(),
                    "item_code": (row.get("item_code") or "").strip(),
                    "previous_rate": flt(prev),
                    "rate": flt(row.get("rate")),
                }
            )

    doc = frappe.new_doc("Purchase Receipt")
    doc.supplier = supplier
    doc.company = company
    doc.set_warehouse = warehouse
    doc.posting_date = posting_date or frappe.utils.today()
    for row in audited:
        doc.append(
            "items",
            {
                "item_code": row["item_code"],
                "qty": row["qty"],
                "rate": row["rate"],
                "warehouse": warehouse,
            },
        )

    audit_payload = {
        "approval_status": STATUS_SUBMITTED if auto_submit else pending_status,
        "approval_level": level,
        "max_variance_pct": round(max_pct, 2),
        "requested_by": frappe.session.user,
        "requested_at": now_datetime().isoformat(),
        "lines": audited,
        "events": events,
    }
    _set_approval_fields(
        doc,
        pending=not auto_submit,
        level=level if not auto_submit else "",
        audit_dict=audit_payload,
    )
    doc.insert()

    submitted = False
    if auto_submit:
        frappe.flags.elmahdi_purchase_approval_submit = True
        frappe.flags.ignore_permissions = True
        try:
            from elmahdi.api.erp_submit import assert_submitted_side_effects

            doc.submit()
            doc.reload()
            assert_submitted_side_effects(doc)
            submitted = True
            audit_payload["approval_status"] = STATUS_SUBMITTED
            audit_payload["approved_by"] = frappe.session.user
            audit_payload["approved_at"] = now_datetime().isoformat()
            audit_payload["approval_role"] = _required_approval_role(level) or "auto"
            if _has_custom_field("purchase_rate_audit"):
                frappe.db.set_value(
                    "Purchase Receipt",
                    doc.name,
                    "purchase_rate_audit",
                    json.dumps(audit_payload, default=str),
                )
        finally:
            frappe.flags.elmahdi_purchase_approval_submit = False
            frappe.flags.ignore_permissions = False

        if submitted:
            try:
                from elmahdi.api.invoice_matching import auto_create_and_submit_purchase_invoice_for_receipt

                auto_create_and_submit_purchase_invoice_for_receipt(
                    doc.name,
                    ignore_permissions=True,
                )
            except Exception:
                frappe.log_error(
                    message=frappe.get_traceback(),
                    title=f"Auto PI after low-variance PR {doc.name}",
                )

    return {
        "name": doc.name,
        "docstatus": doc.docstatus,
        "submitted": submitted,
        "pending_purchase_approval": 0 if submitted else 1,
        "approval_status": audit_payload.get("approval_status"),
        "approval_level": level,
        "max_variance_pct": round(max_pct, 2),
        "lines": audited,
        "grand_total": flt(doc.grand_total),
    }


@frappe.whitelist()
def list_pending_purchase_approvals(limit=50):
    if not (_can_approve_manager() or _can_approve_accountant()):
        frappe.throw(_("Not permitted to view purchase approvals."), frappe.PermissionError)

    filters = {"docstatus": 0}
    if _has_custom_field("approval_status"):
        filters["approval_status"] = ["in", [STATUS_PENDING_MANAGER, STATUS_PENDING_ACCOUNTANT, STATUS_DRAFT]]
    elif _has_custom_field("pending_purchase_approval"):
        filters["pending_purchase_approval"] = 1

    rows = frappe.get_all(
        "Purchase Receipt",
        filters=filters,
        fields=[
            "name",
            "supplier",
            "set_warehouse",
            "posting_date",
            "grand_total",
            "owner",
            "modified",
            "approval_status",
            "purchase_approval_level",
            "variance_percent",
        ],
        order_by="modified desc",
        limit_page_length=int(limit or 50),
    )

    out = []
    for row in rows:
        doc = frappe.get_doc("Purchase Receipt", row.name)
        audit = _parse_audit(doc)
        level = _normalize_level(
            doc.get("purchase_approval_level") or audit.get("approval_level") or "manager"
        )
        status = (doc.get("approval_status") or audit.get("approval_status") or "").strip()
        if status in (STATUS_SUBMITTED, STATUS_REJECTED, STATUS_APPROVED):
            continue
        if not status and not _has_custom_field("pending_purchase_approval"):
            if audit.get("approval_status") not in ("pending", STATUS_PENDING_MANAGER, STATUS_PENDING_ACCOUNTANT, STATUS_DRAFT):
                continue
        if status and status not in (STATUS_PENDING_MANAGER, STATUS_PENDING_ACCOUNTANT, STATUS_DRAFT):
            continue
        out.append(_serialize_approval_row(doc, audit, level, status))
    return out


def _serialize_approval_row(doc, audit, level, status=""):
    lines = audit.get("lines") or []
    for item in doc.items:
        if not any(l.get("item_code") == item.item_code for l in lines):
            expected = get_expected_buying_rate(item.item_code)
            pct = line_variance_pct(expected, item.rate)
            lines.append(
                {
                    "item_code": item.item_code,
                    "qty": flt(item.qty),
                    "rate": flt(item.rate),
                    "expected_rate": expected,
                    "variance_pct": round(pct, 2),
                    "amount": round(flt(item.qty) * flt(item.rate), 2),
                }
            )
    can_approve, block_reason = _approval_action_state(doc, level)
    return {
        "name": doc.name,
        "supplier": doc.supplier,
        "warehouse": doc.set_warehouse,
        "posting_date": str(doc.posting_date),
        "grand_total": flt(doc.grand_total),
        "approval_level": level,
        "approval_status": status or audit.get("approval_status") or _status_for_pending(level),
        "requested_by": audit.get("requested_by") or doc.owner,
        "requested_at": audit.get("requested_at"),
        "lines": lines,
        "max_variance_pct": audit.get("max_variance_pct"),
        "can_approve": can_approve,
        "approve_blocked_reason": block_reason,
    }


@frappe.whitelist()
def approve_purchase_receipt(name, action="approve", notes=""):
    if action not in ("approve", "reject"):
        frappe.throw(_("Invalid action."), frappe.ValidationError)

    ctx, audit_preview, level = _approval_context_from_db(name)
    if cint(ctx.docstatus) != 0:
        frappe.throw(_("Only draft purchase receipts can be approved or rejected."), frappe.ValidationError)

    _assert_not_self_approval_by_owner(ctx.owner, audit_preview)
    _assert_can_approve(level)

    doc = frappe.get_doc("Purchase Receipt", name)
    audit = _parse_audit(doc) or audit_preview
    level = _normalize_level(doc.get("purchase_approval_level") or audit.get("approval_level") or level)

    if action == "reject":
        audit["approval_status"] = STATUS_REJECTED
        audit["rejected_by"] = frappe.session.user
        audit["rejected_at"] = now_datetime().isoformat()
        if notes:
            audit["reject_notes"] = notes
        audit.setdefault("events", []).append(
            {"action": "rejected", "user": frappe.session.user, "at": now_datetime().isoformat(), "notes": notes}
        )
        if _has_custom_field("pending_purchase_approval"):
            doc.pending_purchase_approval = 0
        if _has_custom_field("purchase_rate_audit"):
            doc.purchase_rate_audit = json.dumps(audit, default=str)
        _set_approval_fields(doc, pending=False, level=level, audit_dict=audit)
        doc.save(ignore_permissions=True)
        return {"name": doc.name, "status": STATUS_REJECTED, "approval_status": STATUS_REJECTED}

    validate_purchase_receipt(doc)

    approval_role = "accountant" if level == "accountant" else "manager"
    for line in doc.items:
        prev = flt(line.rate)
        audit.setdefault("events", []).append(
            {
                "action": "approve_submit",
                "user": frappe.session.user,
                "at": now_datetime().isoformat(),
                "item_code": line.item_code,
                "previous_rate": prev,
                "rate": prev,
                "notes": notes,
            }
        )

    audit["approval_status"] = STATUS_APPROVED
    audit["approved_by"] = frappe.session.user
    audit["approved_at"] = now_datetime().isoformat()
    audit["approval_role"] = approval_role
    audit["approval_reason"] = notes or audit.get("approval_reason") or ""
    if _has_custom_field("pending_purchase_approval"):
        doc.pending_purchase_approval = 0
    if _has_custom_field("purchase_rate_audit"):
        doc.purchase_rate_audit = json.dumps(audit, default=str)
    _set_approval_fields(doc, pending=False, level=level, audit_dict=audit)

    audit["approval_status"] = STATUS_SUBMITTED

    frappe.flags.elmahdi_purchase_approval_submit = True
    frappe.flags.ignore_permissions = True
    try:
        from elmahdi.api.erp_submit import assert_submitted_side_effects

        doc.save(ignore_permissions=True)
        doc.submit()
        doc.reload()
        assert_submitted_side_effects(doc)
    finally:
        frappe.flags.elmahdi_purchase_approval_submit = False
        frappe.flags.ignore_permissions = False

    if _has_custom_field("approval_status"):
        frappe.db.set_value("Purchase Receipt", doc.name, "approval_status", STATUS_SUBMITTED, update_modified=False)

    pi_result = {}
    try:
        from elmahdi.api.invoice_matching import auto_create_and_submit_purchase_invoice_for_receipt

        pi_result = auto_create_and_submit_purchase_invoice_for_receipt(
            doc.name,
            ignore_permissions=True,
        )
    except Exception as exc:
        frappe.log_error(
            message=frappe.get_traceback(),
            title=f"Auto PI after PR approval {doc.name}",
        )
        pi_result = {"error": str(exc)[:200]}

    return {
        "name": doc.name,
        "status": STATUS_SUBMITTED,
        "approval_status": STATUS_SUBMITTED,
        "docstatus": doc.docstatus,
        "purchase_invoice": pi_result.get("name"),
        "purchase_invoice_outstanding": pi_result.get("outstanding_amount"),
        "purchase_invoice_auto": not pi_result.get("skipped", True) and not pi_result.get("error"),
        "purchase_invoice_message": pi_result.get("message") or pi_result.get("error"),
    }


@frappe.whitelist()
def get_invoice_matching_rows(limit=150):
    """Server-side matching summary — delegates to invoice_matching engine."""
    from elmahdi.api.invoice_matching import get_invoice_matching_rows as _rows

    return _rows(limit=limit)


@frappe.whitelist()
def get_purchasing_workspace_history(limit=300, supplier=None, from_date=None):
    """Receipts + invoices for purchasing history (permission-safe)."""
    frappe.has_permission("Purchase Receipt", "read", throw=True)

    filters = [["docstatus", "!=", 2]]
    if supplier:
        filters.append(["supplier", "=", supplier])
    if from_date:
        filters.append(["posting_date", ">=", from_date])

    receipts = frappe.get_all(
        "Purchase Receipt",
        filters=filters,
        fields=[
            "name",
            "supplier",
            "posting_date",
            "grand_total",
            "docstatus",
            "approval_status",
            "status",
            "pending_purchase_approval",
            "purchase_approval_level",
        ],
        order_by="posting_date desc",
        limit_page_length=int(limit or 300),
    )
    invoices = []
    if frappe.has_permission("Purchase Invoice", "read"):
        invoices = frappe.get_all(
            "Purchase Invoice",
            filters=filters,
            fields=["name", "supplier", "posting_date", "grand_total", "outstanding_amount", "docstatus", "status"],
            order_by="posting_date desc",
            limit_page_length=int(limit or 300),
        )

    rows = [
        {**r, "doc_type": "Purchase Receipt", "outstanding_amount": 0}
        for r in receipts
    ] + [
        {**i, "doc_type": "Purchase Invoice"}
        for i in invoices
    ]
    rows.sort(key=lambda x: str(x.get("posting_date") or ""), reverse=True)
    return rows
