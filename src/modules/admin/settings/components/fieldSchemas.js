/**
 * Per-section field metadata. Keys: '<doctype>::<field>'.
 *
 * Each entry: { label, kind, options?, help?, mono?, step?, min?, max? }
 *
 * `kind` is one of: 'text' | 'check' | 'select' | 'number' | 'time' | 'textarea'
 *
 * Anything not present here falls back to a generic text input — that's
 * fine for fields a user rarely needs to edit but we still want to expose.
 */
export const FIELD_SCHEMAS = {
  // ── Products ──────────────────────────────────────────────────────────
  'Stock Settings::item_naming_by':            { label: 'Item naming by',           kind: 'select',
    options: ['Item Code', 'Naming Series'] },
  'Stock Settings::item_naming_series':        { label: 'Item naming series',       kind: 'text', mono: true },
  'Stock Settings::default_warehouse':         { label: 'Default warehouse',        kind: 'text' },
  'Stock Settings::default_valuation_method':  { label: 'Default valuation method', kind: 'select',
    options: ['FIFO', 'LIFO', 'Moving Average'] },
  'Stock Settings::sample_retention_warehouse':{ label: 'Sample retention warehouse', kind: 'text' },
  'Stock Settings::stock_uom':                 { label: 'Default stock UOM',        kind: 'text' },

  'Item Variant Settings::allow_rename_attribute_value': {
    label: 'Allow renaming attribute values', kind: 'check' },

  // ── Pricing ───────────────────────────────────────────────────────────
  'Selling Settings::cust_master_name':           { label: 'Customer naming',         kind: 'select',
    options: ['Customer Name', 'Naming Series'] },
  'Selling Settings::customer_group':              { label: 'Default customer group',  kind: 'text' },
  'Selling Settings::territory':                   { label: 'Default territory',       kind: 'text' },
  'Selling Settings::selling_price_list':          { label: 'Default selling price list', kind: 'text' },
  'Selling Settings::maintain_same_sales_rate':    { label: 'Maintain same sales rate', kind: 'check' },
  'Selling Settings::editable_price_list_rate':    { label: 'Editable price list rate', kind: 'check' },
  'Selling Settings::allow_negative_rates_for_items': { label: 'Allow negative rates', kind: 'check' },
  'Selling Settings::validate_selling_price':      { label: 'Validate selling price',  kind: 'check' },

  // ── Inventory ─────────────────────────────────────────────────────────
  'Stock Settings::allow_negative_stock':          { label: 'Allow negative stock',    kind: 'check' },
  'Stock Settings::auto_indent':                   { label: 'Auto material request on low stock', kind: 'check' },
  'Stock Settings::reorder_email_notify':          { label: 'Email on reorder',        kind: 'check' },
  'Stock Settings::automatically_set_serial_nos_based_on_fifo': {
    label: 'Auto-pick serials by FIFO', kind: 'check' },
  'Stock Settings::set_qty_in_transactions_based_on_serial_no_input': {
    label: 'Qty derived from serial input', kind: 'check' },
  'Stock Settings::allow_partial_reservation':     { label: 'Allow partial reservation', kind: 'check' },
  'Stock Settings::valuation_method':              { label: 'Valuation method',        kind: 'select',
    options: ['FIFO', 'LIFO', 'Moving Average'] },

  'Delivery Settings::send_dispatch_notification': { label: 'Send dispatch notification', kind: 'check' },
  'Delivery Settings::dispatch_template':           { label: 'Dispatch template',       kind: 'text' },
  'Delivery Settings::delivery_template':           { label: 'Delivery template',       kind: 'text' },
  'Delivery Settings::send_with_attachment':        { label: 'Send with attachment',    kind: 'check' },

  'Stock Reposting Settings::limit_reposting_timeout': { label: 'Limit reposting timeout', kind: 'check' },
  'Stock Reposting Settings::item_based_reposting':     { label: 'Item-based reposting',  kind: 'check' },

  // ── Finance ───────────────────────────────────────────────────────────
  'Accounts Settings::acc_frozen_upto':                     { label: 'Accounts frozen up to', kind: 'text',
    help: 'Date in YYYY-MM-DD' },
  'Accounts Settings::frozen_accounts_modifier':            { label: 'Frozen accounts modifier role', kind: 'text' },
  'Accounts Settings::credit_controller':                   { label: 'Credit controller role', kind: 'text' },
  'Accounts Settings::make_payment_via_journal_entry':      { label: 'Pay via Journal Entry', kind: 'check' },
  'Accounts Settings::unlink_payment_on_cancellation_of_invoice': {
    label: 'Unlink payment on invoice cancel', kind: 'check' },
  'Accounts Settings::book_asset_depreciation_entry_automatically': {
    label: 'Auto-book asset depreciation', kind: 'check' },
  'Accounts Settings::automatically_process_deferred_accounting_entry': {
    label: 'Auto-process deferred accounting', kind: 'check' },
  'Accounts Settings::enable_common_party_accounting':      { label: 'Enable common-party accounting', kind: 'check' },
  'Accounts Settings::check_supplier_invoice_uniqueness':   { label: 'Check supplier invoice uniqueness', kind: 'check' },

  'Buying Settings::supp_master_name':           { label: 'Supplier naming',           kind: 'select',
    options: ['Supplier Name', 'Naming Series'] },
  'Buying Settings::buying_price_list':           { label: 'Default buying price list', kind: 'text' },
  'Buying Settings::po_required':                 { label: 'PO required',               kind: 'check' },
  'Buying Settings::pr_required':                 { label: 'Receipt required before invoice', kind: 'check' },
  'Buying Settings::maintain_same_rate':          { label: 'Maintain same rate',        kind: 'check' },
  'Buying Settings::allow_multiple_items':        { label: 'Allow multiple items',      kind: 'check' },
  'Buying Settings::over_billing_allowance':      { label: 'Over-billing allowance (%)', kind: 'number',
    step: 0.1, min: 0, max: 100 },
  'Buying Settings::over_transfer_allowance':     { label: 'Over-transfer allowance (%)', kind: 'number',
    step: 0.1, min: 0, max: 100 },

  'POS Settings::invoice_naming_series':          { label: 'POS invoice naming series', kind: 'text', mono: true },
  'POS Settings::use_pos_in_offline_mode':        { label: 'Use POS in offline mode',  kind: 'check' },

  // ── Notifications ─────────────────────────────────────────────────────
  'Push Notification Settings::enable_push_notification_relay': {
    label: 'Enable push notification relay', kind: 'check' },
  'Push Notification Settings::api_key':          { label: 'Relay API key',           kind: 'text', mono: true },

  'SMS Settings::sms_gateway_url':                 { label: 'SMS gateway URL',         kind: 'text', mono: true },
  'SMS Settings::message_parameter':                { label: 'Message parameter name', kind: 'text' },
  'SMS Settings::receiver_parameter':               { label: 'Receiver parameter name', kind: 'text' },

  // ── Printing ──────────────────────────────────────────────────────────
  'Print Settings::pdf_page_size':                { label: 'PDF page size',           kind: 'select',
    options: ['A4', 'Letter', 'Legal', 'A3', 'A5', 'Custom'] },
  'Print Settings::pdf_page_height':              { label: 'Custom height (mm)',      kind: 'number', step: 1, min: 0 },
  'Print Settings::pdf_page_width':                { label: 'Custom width (mm)',       kind: 'number', step: 1, min: 0 },
  'Print Settings::font':                          { label: 'Font',                    kind: 'text' },
  'Print Settings::font_size':                     { label: 'Font size',               kind: 'number', step: 1, min: 6, max: 36 },
  'Print Settings::with_letterhead':               { label: 'Print with letter head',  kind: 'check' },
  'Print Settings::repeat_header_footer':          { label: 'Repeat header/footer',    kind: 'check' },
  'Print Settings::compact_item_print':            { label: 'Compact item print',      kind: 'check' },
  'Print Settings::print_taxes_with_zero_amount':  { label: 'Print taxes with zero amount', kind: 'check' },
  'Print Settings::allow_print_for_draft':         { label: 'Allow print for draft',   kind: 'check' },
  'Print Settings::allow_print_for_cancelled':     { label: 'Allow print for cancelled', kind: 'check' },

  // ── Security ──────────────────────────────────────────────────────────
  'System Settings::session_expiry':              { label: 'Session expiry (HH:MM)',  kind: 'text' },
  'System Settings::session_expiry_mobile':       { label: 'Mobile session expiry (HH:MM)', kind: 'text' },
  'System Settings::disable_user_pass_login':      { label: 'Disable user/password login', kind: 'check' },
  'System Settings::force_user_to_reset_password':{ label: 'Force password reset after (days)', kind: 'number',
    step: 1, min: 0 },
  'System Settings::allow_login_using_mobile_number': { label: 'Allow login with mobile', kind: 'check' },
  'System Settings::allow_login_using_user_name':     { label: 'Allow login with username', kind: 'check' },
  'System Settings::deny_multiple_sessions':         { label: 'Deny multiple sessions', kind: 'check' },
  'System Settings::enable_password_policy':         { label: 'Enable password policy', kind: 'check' },
  'System Settings::minimum_password_score':         { label: 'Min password score (0–4)', kind: 'number',
    step: 1, min: 0, max: 4 },
  'System Settings::app_name':                       { label: 'App name (browser tab)', kind: 'text' },
  'System Settings::country':                        { label: 'Country',                kind: 'text' },
  'System Settings::language':                       { label: 'Default language',       kind: 'text' },
  'System Settings::time_zone':                       { label: 'Time zone',              kind: 'text' },
  'System Settings::date_format':                     { label: 'Date format',            kind: 'text' },
  'System Settings::time_format':                     { label: 'Time format',            kind: 'text' },
  'System Settings::number_format':                   { label: 'Number format',          kind: 'text' },

  'Security Settings::allow_login_after_fail':       { label: 'Lockout window (min)',   kind: 'number',
    step: 1, min: 0 },
  'Security Settings::allow_consecutive_login_attempts': { label: 'Max failed logins', kind: 'number',
    step: 1, min: 1, max: 50 },
  'Security Settings::password_reset_limit':          { label: 'Password reset attempts limit', kind: 'number',
    step: 1, min: 1 },
  'Security Settings::session_timeout':                { label: 'Session timeout (HH:MM)', kind: 'text' },
  'Security Settings::allow_older_web_view_links':    { label: 'Allow older web-view links', kind: 'check' },
  'Security Settings::two_factor_method':              { label: '2FA method',              kind: 'select',
    options: ['', 'Email', 'SMS', 'OTP App'] },
  'Security Settings::bypass_2fa_for_retricted_ip_users': {
    label: 'Bypass 2FA for IP-restricted users', kind: 'check' },

  'Log Settings::clear_error_log_after':           { label: 'Clear error log after (days)',    kind: 'number',
    step: 1, min: 1 },
  'Log Settings::clear_activity_log_after':         { label: 'Clear activity log after (days)', kind: 'number',
    step: 1, min: 1 },
  'Log Settings::clear_email_log_after':            { label: 'Clear email log after (days)',    kind: 'number',
    step: 1, min: 1 },

  // ── Global Defaults (Company section) ────────────────────────────────
  'Global Defaults::default_company':                 { label: 'Default company',         kind: 'text' },
  'Global Defaults::default_currency':                 { label: 'Default currency',        kind: 'text' },
  'Global Defaults::country':                           { label: 'Country',                kind: 'text' },
  'Global Defaults::default_fiscal_year':              { label: 'Default fiscal year',    kind: 'text' },
  'Global Defaults::date_format':                       { label: 'Date format',            kind: 'text' },
  'Global Defaults::float_precision':                    { label: 'Float precision',       kind: 'number',
    step: 1, min: 0, max: 9 },
  'Global Defaults::currency_precision':                 { label: 'Currency precision',    kind: 'number',
    step: 1, min: 0, max: 9 },
  'Global Defaults::default_distance_unit':              { label: 'Distance unit',         kind: 'text' },

  // ── Phase 4 — workspace policy fields on Elmahdi Settings ─────────────
  // POS
  'Elmahdi Settings::pos_max_cash_per_shift':    { label: 'Max cash per shift (EGP)',  kind: 'number',
    step: 100, min: 0, help: 'Cashier shift cannot accumulate more than this amount before a cash drop is required.' },
  'Elmahdi Settings::pos_cash_drop_threshold':   { label: 'Cash drop threshold (EGP)', kind: 'number',
    step: 100, min: 0, help: 'POS suggests a cash drop when shift cash exceeds this value.' },
  'Elmahdi Settings::pos_default_print_format':  { label: 'Default receipt format',     kind: 'text',
    help: 'Used by new POS Profiles. Per-profile override still possible.' },
  'Elmahdi Settings::pos_auto_print_default':    { label: 'Auto-print receipts (default for new POS Profiles)', kind: 'check' },

  // Inventory
  'Elmahdi Settings::inventory_transfer_max_value':         { label: 'Max value per transfer (EGP)', kind: 'number',
    step: 100, min: 0, help: 'Transfers exceeding this value require a Store Manager approval.' },
  'Elmahdi Settings::inventory_transfer_max_units_per_day': { label: 'Max units per day',            kind: 'number',
    step: 1,   min: 0, help: 'Caps daily transfer throughput to detect anomalous activity.' },

  // Purchasing
  'Elmahdi Settings::purchase_approval_threshold_low':  { label: 'Approval threshold — low (EGP)',  kind: 'number',
    step: 100, min: 0, help: 'PRs below this amount auto-approve.' },
  'Elmahdi Settings::purchase_approval_threshold_mid':  { label: 'Approval threshold — mid (EGP)',  kind: 'number',
    step: 100, min: 0, help: 'PRs above this amount require Store Manager.' },
  'Elmahdi Settings::purchase_approval_threshold_high': { label: 'Approval threshold — high (EGP)', kind: 'number',
    step: 100, min: 0, help: 'PRs above this amount require Administrator.' },

  // Finance
  'Elmahdi Settings::ap_overdue_scan_days':   { label: 'AP overdue scan window (days)', kind: 'number',
    step: 1, min: 1, max: 365, help: 'Daily AP scan flags invoices overdue by this many days.' },
  'Elmahdi Settings::aging_buckets':           { label: 'Aging buckets (CSV)',            kind: 'text', mono: true,
    help: 'Comma-separated day cutoffs used by the aging report. Default: 30,60,90,120.' },

  // HR Settings (HRMS-owned)
  'HR Settings::emp_created_by':                       { label: 'Employee naming',         kind: 'select',
    options: ['Naming Series', 'Employee Number', 'Full Name'] },
  'HR Settings::standard_working_hours':                { label: 'Standard working hours/day', kind: 'number',
    step: 0.5, min: 0, max: 24 },
  'HR Settings::max_working_hours_against_timesheet':   { label: 'Max working hours / timesheet', kind: 'number',
    step: 0.5, min: 0, max: 24 },
  'HR Settings::send_leave_notification':                { label: 'Send leave notification',  kind: 'check' },

  // Buying Settings (workspace subset)
  // (Already defined in finance section above. No re-declaration needed.)

  // Accounts Settings (workspace subset)
  // (Already defined in finance section above.)
};

