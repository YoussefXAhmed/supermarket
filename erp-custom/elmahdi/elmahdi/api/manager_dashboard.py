"""
Manager dashboard KPIs — revenue, sales volume, net profit from ERP documents.

Net profit = POS sales revenue − COGS
  COGS = Stock Ledger outgoing value (authoritative after consolidation)
       + estimated cost for unconsolidated POS stock lines (last purchase rate).
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import add_days, flt, get_first_day, getdate, today


def _default_company(company=None):
	if company and frappe.db.exists("Company", company):
		return company
	row = frappe.db.get_value("Company", {}, "name")
	if not row:
		frappe.throw(_("No Company configured"), frappe.ValidationError)
	return row


def _pos_revenue_summary(company, from_date, to_date):
	row = frappe.db.sql(
		"""
		SELECT
			COUNT(*) AS invoice_count,
			COALESCE(SUM(pi.grand_total), 0) AS revenue
		FROM `tabPOS Invoice` pi
		WHERE pi.docstatus = 1
			AND pi.company = %(company)s
			AND pi.posting_date BETWEEN %(from_date)s AND %(to_date)s
		""",
		{"company": company, "from_date": from_date, "to_date": to_date},
		as_dict=True,
	)
	return row[0] if row else {"invoice_count": 0, "revenue": 0.0}


def _cogs_from_sle(company, from_date, to_date):
	"""Outgoing stock value from Stock Ledger (Sales Invoice / delivery / POS)."""
	return flt(
		frappe.db.sql(
			"""
			SELECT COALESCE(SUM(ABS(stock_value_difference)), 0)
			FROM `tabStock Ledger Entry`
			WHERE is_cancelled = 0
				AND stock_value_difference < 0
				AND company = %(company)s
				AND posting_date BETWEEN %(from_date)s AND %(to_date)s
			""",
			{"company": company, "from_date": from_date, "to_date": to_date},
		)[0][0]
	)


def _cogs_estimated_unconsolidated_pos(company, from_date, to_date):
	"""POS sales not yet consolidated — no SLE; use item last purchase / valuation rate."""
	if not frappe.db.has_column("POS Invoice", "consolidated_invoice"):
		consolidated_filter = ""
	else:
		consolidated_filter = "AND IFNULL(pi.consolidated_invoice, '') = ''"

	return flt(
		frappe.db.sql(
			f"""
			SELECT COALESCE(SUM(
				ABS(pii.qty) * COALESCE(
					NULLIF(i.last_purchase_rate, 0),
					NULLIF(i.valuation_rate, 0),
					0
				)
			), 0)
			FROM `tabPOS Invoice` pi
			INNER JOIN `tabPOS Invoice Item` pii ON pii.parent = pi.name
			INNER JOIN `tabItem` i ON i.name = pii.item_code AND IFNULL(i.is_stock_item, 0) = 1
			WHERE pi.docstatus = 1
				AND pi.company = %(company)s
				AND pi.posting_date BETWEEN %(from_date)s AND %(to_date)s
				{consolidated_filter}
			""",
			{"company": company, "from_date": from_date, "to_date": to_date},
		)[0][0]
	)


def _daily_sales_trend(company, from_date, to_date, limit=14):
	rows = frappe.db.sql(
		"""
		SELECT
			DATE_FORMAT(pi.posting_date, '%%m-%%d') AS label,
			pi.posting_date AS sort_date,
			COALESCE(SUM(pi.grand_total), 0) AS value
		FROM `tabPOS Invoice` pi
		WHERE pi.docstatus = 1
			AND pi.company = %(company)s
			AND pi.posting_date BETWEEN %(from_date)s AND %(to_date)s
		GROUP BY pi.posting_date
		ORDER BY pi.posting_date ASC
		""",
		{"company": company, "from_date": from_date, "to_date": to_date},
		as_dict=True,
	)
	return [{"label": r.label, "value": flt(r.value)} for r in rows[-limit:]]


@frappe.whitelist()
def get_manager_kpis(company=None, from_date=None, to_date=None):
	"""
	Returns MTD + today sales KPIs for the manager SPA dashboard.

	- revenue: sum of submitted POS Invoice grand_total (net of returns in grand_total)
	- sales_count: number of POS invoices
	- sales_today: revenue for posting_date = today
	- cogs: stock ledger outgoing + estimated unconsolidated POS cost
	- net_profit: revenue − cogs
	"""
	frappe.has_permission("POS Invoice", "read", throw=True)

	company = _default_company(company)
	to_date = getdate(to_date) if to_date else getdate(today())
	from_date = getdate(from_date) if from_date else get_first_day(to_date)
	today_d = getdate(today())

	mtd = _pos_revenue_summary(company, from_date, to_date)
	today_row = _pos_revenue_summary(company, today_d, today_d)

	last_month_end = add_days(from_date, -1)
	last_month_start = get_first_day(last_month_end)
	last_mtd = _pos_revenue_summary(company, last_month_start, last_month_end)

	revenue = round(flt(mtd.revenue), 2)
	sales_count = int(mtd.invoice_count or 0)
	sales_today = round(flt(today_row.revenue), 2)
	sales_today_count = int(today_row.invoice_count or 0)

	cogs_sle = round(_cogs_from_sle(company, from_date, to_date), 2)
	cogs_est = round(_cogs_estimated_unconsolidated_pos(company, from_date, to_date), 2)
	cogs = round(cogs_sle + cogs_est, 2)
	net_profit = round(revenue - cogs, 2)

	last_revenue = flt(last_mtd.revenue)
	revenue_trend = (
		round((revenue - last_revenue) / last_revenue * 100)
		if last_revenue > 0
		else (100 if revenue > 0 else 0)
	)

	gross_margin_pct = round((net_profit / revenue * 100) if revenue > 0 else 0, 1)

	return {
		"company": company,
		"period": {"from_date": str(from_date), "to_date": str(to_date)},
		"revenue": revenue,
		"sales_count": sales_count,
		"sales_today": sales_today,
		"sales_today_count": sales_today_count,
		"cogs": cogs,
		"cogs_from_sle": cogs_sle,
		"cogs_estimated": cogs_est,
		"net_profit": net_profit,
		"gross_margin_pct": gross_margin_pct,
		"revenue_trend": revenue_trend,
		"last_month_revenue": round(last_revenue, 2),
		"avg_ticket": round(revenue / sales_count, 2) if sales_count else 0,
		"sales_trend": _daily_sales_trend(company, from_date, to_date),
	}
