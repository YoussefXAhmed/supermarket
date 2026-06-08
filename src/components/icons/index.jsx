/**
 * Centralized icon registry.
 *
 * One file owns every icon used by the SPA so:
 *   - swapping a Lucide name (or moving away from Lucide entirely) is one edit
 *   - the bundle only pulls in glyphs we actually reference
 *   - icon names are domain words, not Lucide aliases — refactoring code in
 *     the modules doesn't have to remember whether the "purchasing" icon is
 *     ShoppingCart or Truck this week.
 *
 * Convention: import named symbols from this file, not from 'lucide-react'.
 *
 *     import { InventoryIcon, ApprovedIcon } from '../components/icons';
 *
 * Each export is a thin React component that forwards size/color/className
 * to the underlying Lucide component, so callers can size them inline.
 */
import {
  // Workspace / nav
  LayoutDashboard,
  Package,
  ShoppingCart,
  Wallet,
  BarChart3,
  Clock,
  Users,
  Truck,
  Bell,
  Settings,
  // Status / state
  CheckCircle2,
  Circle,
  AlertTriangle,
  XCircle,
  Clock4,
  // Actions
  Search,
  Plus,
  Edit3,
  Trash2,
  Printer,
  Download,
  Eye,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  X,
  // Inventory / store-specific
  Boxes,
  PackageCheck,
  PackageX,
  PackageMinus,
  // Misc
  FileText,
  Receipt,
  CreditCard,
  Home,
  LogOut,
  User,
  Building2,
  Tag,
  Calendar,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertCircle,
  Info,
  CheckCheck,
  MailOpen,
  Megaphone,
  ShieldCheck,
} from 'lucide-react';

/**
 * Default Lucide stroke-width that matches a Stripe/Linear visual weight —
 * 1.75 reads cleaner than the Lucide default 2 at 16-20px sizes.
 */
const DEFAULT_STROKE = 1.75;

function wrap(LucideComponent) {
  return function Icon({ size = 18, strokeWidth = DEFAULT_STROKE, className = '', ...rest }) {
    return (
      <LucideComponent
        size={size}
        strokeWidth={strokeWidth}
        className={`lucide-icon ${className}`.trim()}
        aria-hidden="true"
        focusable="false"
        {...rest}
      />
    );
  };
}

// ── Workspace + navigation ────────────────────────────────────────────────
export const DashboardIcon     = wrap(LayoutDashboard);
export const InventoryIcon     = wrap(Package);
export const PurchasingIcon    = wrap(ShoppingCart);
export const FinanceIcon       = wrap(Wallet);
export const ReportsIcon       = wrap(BarChart3);
export const ShiftsIcon        = wrap(Clock);
export const CustomersIcon     = wrap(Users);
export const SuppliersIcon     = wrap(Truck);
export const NotificationsIcon = wrap(Bell);
export const SettingsIcon      = wrap(Settings);
export const HomeIcon          = wrap(Home);
export const UserIcon          = wrap(User);
export const POSIcon           = wrap(Receipt);
export const WarehouseIcon     = wrap(Building2);
export const HRIcon            = wrap(Users);
export const ApprovalsIcon     = wrap(ShieldCheck);
export const InvoicesIcon      = wrap(FileText);
export const PaymentsIcon      = wrap(CreditCard);

// ── Status / state ────────────────────────────────────────────────────────
export const InStockIcon       = wrap(PackageCheck);
export const LowStockIcon      = wrap(PackageMinus);
export const OutOfStockIcon    = wrap(PackageX);
export const ApprovedIcon      = wrap(CheckCircle2);
export const PendingIcon       = wrap(Clock4);
export const RejectedIcon      = wrap(XCircle);
export const InfoIcon          = wrap(Info);
export const WarningIcon       = wrap(AlertTriangle);
export const ErrorIcon         = wrap(AlertCircle);
export const TrendUpIcon       = wrap(TrendingUp);
export const TrendDownIcon     = wrap(TrendingDown);
export const ActivityIcon      = wrap(Activity);

// ── Actions ───────────────────────────────────────────────────────────────
export const SearchIcon        = wrap(Search);
export const AddIcon           = wrap(Plus);
export const EditIcon          = wrap(Edit3);
export const DeleteIcon        = wrap(Trash2);
export const PrintIcon         = wrap(Printer);
export const DownloadIcon      = wrap(Download);
export const ViewIcon          = wrap(Eye);
export const FilterIcon        = wrap(Filter);
export const RefreshIcon       = wrap(RefreshCw);
export const ChevronDownIcon   = wrap(ChevronDown);
export const ChevronRightIcon  = wrap(ChevronRight);
export const CloseIcon         = wrap(X);
export const LogoutIcon        = wrap(LogOut);
export const MarkReadIcon      = wrap(MailOpen);
export const MarkAllReadIcon   = wrap(CheckCheck);

// ── Domain extras ─────────────────────────────────────────────────────────
export const ItemsIcon         = wrap(Boxes);
export const CalendarIcon      = wrap(Calendar);
export const TagIcon           = wrap(Tag);
export const AnnouncementIcon  = wrap(Megaphone);
export const EmptyBellIcon     = wrap(Bell);
export const CircleIcon        = wrap(Circle);

/**
 * Map a stock state (positive number, low threshold, zero) to the right icon
 * + tone class. Centralized so every list/grid reuses the same semantics.
 */
export function stockStateIcon({ qty, lowThreshold = 5 }) {
  if (qty <= 0) return { Icon: OutOfStockIcon, tone: 'red',   label: 'Out of stock' };
  if (qty <= lowThreshold) return { Icon: LowStockIcon, tone: 'amber', label: 'Low stock' };
  return { Icon: InStockIcon, tone: 'green', label: 'In stock' };
}

/**
 * Map an approval state to icon + tone. Mirrors the approval status pill.
 */
export function approvalStateIcon(status) {
  const k = String(status || '').toLowerCase();
  if (k === 'approved' || k === 'submitted' || k === 'completed' || k === 'paid') {
    return { Icon: ApprovedIcon, tone: 'green' };
  }
  if (k === 'rejected' || k === 'failed' || k === 'cancelled') {
    return { Icon: RejectedIcon, tone: 'red' };
  }
  if (k === 'overdue') return { Icon: WarningIcon, tone: 'red' };
  return { Icon: PendingIcon, tone: 'amber' };
}
