/**
 * NavIcon — resolves nav item `icon` strings (which historically held emojis)
 * to a Lucide icon from the central registry. If the string isn't recognised
 * we still render it as-is so the migration is incremental — workspaces that
 * haven't been touched yet keep showing their old emoji.
 */
import {
  DashboardIcon,
  InventoryIcon,
  PurchasingIcon,
  FinanceIcon,
  ReportsIcon,
  ShiftsIcon,
  CustomersIcon,
  SuppliersIcon,
  NotificationsIcon,
  SettingsIcon,
  POSIcon,
  WarehouseIcon,
  HRIcon,
  ApprovalsIcon,
  InvoicesIcon,
  PaymentsIcon,
  ItemsIcon,
  UserIcon,
  TrendUpIcon,
  ActivityIcon,
  AnnouncementIcon,
  ChevronRightIcon,
  CalendarIcon,
} from './index';

/**
 * Map old emoji / glyph icons + semantic names to Lucide components. New nav
 * entries should use the semantic key on the right of each pair (e.g.
 * 'dashboard') — old entries with emoji on the left keep working.
 */
const ICON_MAP = {
  // Semantic keys (preferred)
  dashboard: DashboardIcon,
  inventory: InventoryIcon,
  purchasing: PurchasingIcon,
  finance: FinanceIcon,
  reports: ReportsIcon,
  shifts: ShiftsIcon,
  customers: CustomersIcon,
  suppliers: SuppliersIcon,
  notifications: NotificationsIcon,
  settings: SettingsIcon,
  pos: POSIcon,
  warehouse: WarehouseIcon,
  hr: HRIcon,
  approvals: ApprovalsIcon,
  invoices: InvoicesIcon,
  payments: PaymentsIcon,
  items: ItemsIcon,
  user: UserIcon,
  trend: TrendUpIcon,
  activity: ActivityIcon,
  calendar: CalendarIcon,

  // Legacy emoji → Lucide mappings (so existing nav configs work unchanged)
  '◈':  DashboardIcon,
  '✓':  ApprovalsIcon,
  '📊': ReportsIcon,
  '📋': ActivityIcon,
  '⚙️': SettingsIcon,
  '🛒': PurchasingIcon,
  '🛍️': PurchasingIcon,
  '🏬': WarehouseIcon,
  '🏭': SuppliersIcon,
  '🖥️': POSIcon,
  '📜': InvoicesIcon,
  '👥': CustomersIcon,
  '🧑‍💼': UserIcon,
  '🧑': UserIcon,
  '📦': InventoryIcon,
  '💼': PurchasingIcon,
  '💰': FinanceIcon,
  '💳': PaymentsIcon,
  '🧾': InvoicesIcon,
  '⏰': ShiftsIcon,
  '◷':  ShiftsIcon,
  '🔔': NotificationsIcon,
  '📈': TrendUpIcon,
  '📉': TrendUpIcon,
  '➡':  ChevronRightIcon,
};

export default function NavIcon({ icon, size = 18, strokeWidth = 1.75, className = '' }) {
  if (!icon) return null;
  const key = String(icon).trim();
  const Icon = ICON_MAP[key];
  if (Icon) return <Icon size={size} strokeWidth={strokeWidth} className={className} />;
  // Unknown — render as text so old emojis still show through.
  return <span className={`nav-icon-fallback ${className}`.trim()} aria-hidden="true">{key}</span>;
}
