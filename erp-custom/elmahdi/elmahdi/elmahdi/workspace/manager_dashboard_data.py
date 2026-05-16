"""Store Manager ERPNext workspace layout (desk / Personal → Manager Dashboard)."""

import json


def build_content():
	"""Frappe workspace block layout — must reference child-table labels/names."""
	blocks = [
		("header", {"text": '<span class="h4"><b>Store Overview</b></span>', "col": 12}),
		("number_card", {"number_card_name": "Today Sales", "col": 3}),
		("number_card", {"number_card_name": "Gross Profit", "col": 3}),
		("number_card", {"number_card_name": "Total Invoices", "col": 3}),
		("number_card", {"number_card_name": "Total Stock Value", "col": 3}),
		("chart", {"chart_name": "Profit and Loss", "col": 12}),
		("spacer", {"col": 12}),
		("header", {"text": '<span class="h4"><b>Quick Actions</b></span>', "col": 12}),
		("shortcut", {"shortcut_name": "Sales Invoice", "col": 3}),
		("shortcut", {"shortcut_name": "Point of Sale", "col": 3}),
		("shortcut", {"shortcut_name": "Stock Reconciliation", "col": 3}),
		("shortcut", {"shortcut_name": "Stock Entry", "col": 3}),
		("shortcut", {"shortcut_name": "Purchase Order", "col": 3}),
		("shortcut", {"shortcut_name": "Quick Stock Balance", "col": 3}),
		("spacer", {"col": 12}),
		("header", {"text": '<span class="h4"><b>Operations &amp; Reports</b></span>', "col": 12}),
		("card", {"card_name": "Sales & POS", "col": 4}),
		("card", {"card_name": "Inventory", "col": 4}),
		("card", {"card_name": "Purchasing", "col": 4}),
		("card", {"card_name": "Manager Reports", "col": 4}),
	]
	return json.dumps(
		[{"id": f"mgr{i:02d}", "type": kind, "data": data} for i, (kind, data) in enumerate(blocks)]
	)


def get_manager_dashboard_spec():
	"""Return fields to apply on a Workspace doc."""
	return {
		"title": "Manager Dashboard",
		"icon": "chart",
		"indicator_color": "orange",
		"content": build_content(),
		"charts": [{"chart_name": "Profit and Loss", "label": "Profit and Loss"}],
		"number_cards": [
			{"number_card_name": "Today Sales", "label": "Today Sales"},
			{"number_card_name": "Gross Profit", "label": "Gross Profit"},
			{"number_card_name": "Total Invoices", "label": "Invoices"},
			{"number_card_name": "Total Stock Value", "label": "Stock Value"},
		],
		"shortcuts": [
			{"type": "DocType", "link_to": "Sales Invoice", "label": "Sales Invoice", "color": "Green"},
			{"type": "Page", "link_to": "point-of-sale", "label": "Point of Sale", "color": "Blue"},
			{
				"type": "DocType",
				"link_to": "Stock Reconciliation",
				"label": "Stock Reconciliation",
				"color": "Orange",
			},
			{"type": "DocType", "link_to": "Stock Entry", "label": "Stock Entry", "color": "Grey"},
			{"type": "DocType", "link_to": "Purchase Order", "label": "Purchase Order", "color": "Yellow"},
			{
				"type": "DocType",
				"link_to": "Quick Stock Balance",
				"label": "Quick Stock Balance",
				"color": "Cyan",
			},
		],
		"links": [
			{"type": "Card Break", "label": "Sales & POS", "link_count": 0},
			{"type": "Link", "label": "Sales Invoice", "link_to": "Sales Invoice", "link_type": "DocType"},
			{"type": "Link", "label": "POS Invoice", "link_to": "POS Invoice", "link_type": "DocType"},
			{"type": "Link", "label": "Point of Sale", "link_to": "point-of-sale", "link_type": "Page"},
			{
				"type": "Link",
				"label": "POS Register",
				"link_to": "POS Register",
				"link_type": "Report",
				"is_query_report": 1,
			},
			{
				"type": "Link",
				"label": "Sales Register",
				"link_to": "Sales Register",
				"link_type": "Report",
				"is_query_report": 1,
			},
			{"type": "Card Break", "label": "Inventory", "link_count": 0},
			{
				"type": "Link",
				"label": "Stock Reconciliation",
				"link_to": "Stock Reconciliation",
				"link_type": "DocType",
			},
			{"type": "Link", "label": "Stock Entry", "link_to": "Stock Entry", "link_type": "DocType"},
			{
				"type": "Link",
				"label": "Stock Balance",
				"link_to": "Stock Balance",
				"link_type": "Report",
				"is_query_report": 1,
			},
			{
				"type": "Link",
				"label": "Stock Ledger",
				"link_to": "Stock Ledger",
				"link_type": "Report",
				"is_query_report": 1,
			},
			{"type": "Card Break", "label": "Purchasing", "link_count": 0},
			{"type": "Link", "label": "Purchase Order", "link_to": "Purchase Order", "link_type": "DocType"},
			{"type": "Link", "label": "Purchase Receipt", "link_to": "Purchase Receipt", "link_type": "DocType"},
			{
				"type": "Link",
				"label": "Purchase Analytics",
				"link_to": "Purchase Analytics",
				"link_type": "Report",
				"is_query_report": 1,
			},
			{"type": "Card Break", "label": "Manager Reports", "link_count": 0},
			{
				"type": "Link",
				"label": "Gross Profit",
				"link_to": "Gross Profit",
				"link_type": "Report",
				"is_query_report": 1,
			},
			{
				"type": "Link",
				"label": "Sales Analytics",
				"link_to": "Sales Analytics",
				"link_type": "Report",
				"is_query_report": 1,
			},
			{
				"type": "Link",
				"label": "Profit and Loss Statement",
				"link_to": "Profit and Loss Statement",
				"link_type": "Report",
				"is_query_report": 1,
			},
		],
		"roles": [
			{"role": "Stock Manager"},
			{"role": "Purchase Manager"},
			{"role": "Sales Manager"},
			{"role": "System Manager"},
			{"role": "Administrator"},
		],
	}


def apply_spec(doc, spec):
	"""Merge spec into an existing Workspace document."""
	doc.title = spec["title"]
	doc.icon = spec.get("icon") or doc.icon
	doc.indicator_color = spec.get("indicator_color") or doc.indicator_color
	doc.content = spec["content"]
	doc.charts = []
	for row in spec.get("charts", []):
		doc.append("charts", row)
	doc.number_cards = []
	for row in spec.get("number_cards", []):
		doc.append("number_cards", row)
	doc.shortcuts = []
	for row in spec.get("shortcuts", []):
		doc.append("shortcuts", row)
	doc.links = []
	for row in spec.get("links", []):
		doc.append("links", row)
	doc.quick_lists = []
	if hasattr(doc, "roles"):
		doc.roles = []
		for row in spec.get("roles", []):
			doc.append("roles", row)
