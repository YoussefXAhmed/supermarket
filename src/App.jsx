import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import CapabilityRoute from './components/layout/CapabilityRoute';
import InventoryCapabilityRoute from './components/layout/InventoryCapabilityRoute';
import ErrorBoundary from './components/common/ErrorBoundary';
import AdminLayout from './components/layout/AdminLayout';
import ManagerLayout from './components/layout/ManagerLayout';
import FinanceLayout from './components/layout/FinanceLayout';
import HRLayout from './components/layout/HRLayout';
import InventoryLayout from './components/layout/InventoryLayout';
import PurchasingShellLayout from './components/layout/PurchasingShellLayout';
import LegacyPrefixRedirect from './components/routing/LegacyPrefixRedirect';
import { PageLoading } from './components/ui';

const LoginPage = lazy(() => import('./modules/auth/LoginPage'));
const POSPage = lazy(() => import('./modules/pos/POSPage'));
const DashboardPage = lazy(() => import('./modules/admin/DashboardPage'));
const AdminHomePage = lazy(() => import('./modules/admin/AdminHomePage'));
const ProductsPage = lazy(() => import('./modules/admin/ProductsPage'));
const InventoryPage = lazy(() => import('./modules/admin/InventoryPage'));
const InvoicesPage = lazy(() => import('./modules/admin/InvoicesPage'));
const CustomersPage = lazy(() => import('./modules/admin/CustomersPage'));
const UsersPage = lazy(() => import('./modules/admin/UsersPage'));
const AdminWarehousesPage = lazy(() => import('./modules/admin/AdminWarehousesPage'));
const ReportsPage = lazy(() => import('./modules/admin/ReportsPage'));
const SettingsPage = lazy(() => import('./modules/admin/SettingsPage'));
const ActivityLogPage = lazy(() => import('./modules/admin/ActivityLogPage'));
const InventoryDashboardPage = lazy(() => import('./modules/inventory/InventoryPage'));
const WarehousesPage = lazy(() => import('./modules/inventory/pages/WarehousesPage'));
const StockEntryPage = lazy(() => import('./modules/inventory/pages/StockEntryPage'));
const StockLedgerPage = lazy(() => import('./modules/inventory/pages/StockLedgerPage'));
const ItemDetailsPage = lazy(() => import('./modules/inventory/pages/ItemDetailsPage'));
const InventoryAlertsPage = lazy(() => import('./modules/inventory/pages/AlertsPage'));
const InventoryReportsPage = lazy(() => import('./modules/inventory/pages/ReportsPage'));
const StockTransferPage = lazy(() => import('./modules/inventory/pages/StockTransferPage'));
const ReconciliationPage = lazy(() => import('./modules/inventory/pages/ReconciliationPage'));
const ReorderPage = lazy(() => import('./modules/inventory/pages/ReorderPage'));
const BatchesPage = lazy(() => import('./modules/inventory/pages/BatchesPage'));
const AnalyticsPage = lazy(() => import('./modules/inventory/pages/AnalyticsPage'));
const PurchasingDashboardPage = lazy(() => import('./modules/purchasing/PurchasingDashboardPage'));
const SuppliersPage = lazy(() => import('./modules/purchasing/SuppliersPage'));
const SupplierDetailPage = lazy(() => import('./modules/purchasing/SupplierDetailPage'));
const ReceiveStockPage = lazy(() => import('./modules/purchasing/ReceiveStockPage'));
const PurchaseInvoicesPage = lazy(() => import('./modules/purchasing/PurchaseInvoicesPage'));
const InvoiceMatchingPage = lazy(() => import('./modules/purchasing/InvoiceMatchingPage'));
const PurchaseReportsPage = lazy(() => import('./modules/purchasing/PurchaseReportsPage'));
const PurchaseApprovalsPage = lazy(() => import('./modules/purchasing/PurchaseApprovalsPage'));
const AccountantDashboardPage = lazy(() => import('./modules/accountant/pages/AccountantDashboardPage'));
const SupplierPaymentsPage = lazy(() => import('./modules/accountant/pages/SupplierPaymentsPage'));
const ApprovalsDashboardPage = lazy(() => import('./modules/approvals/pages/ApprovalsDashboardPage'));
const ReturnsPage = lazy(() => import('./modules/returns/ReturnsPage'));
const ShiftsLayout = lazy(() => import('./components/layout/ShiftsLayout'));
const ShiftOpenPage = lazy(() => import('./modules/shifts/pages/ShiftOpenPage'));
const ShiftClosePage = lazy(() => import('./modules/shifts/pages/ShiftClosePage'));
const ShiftHistoryPage = lazy(() => import('./modules/shifts/pages/ShiftHistoryPage'));
const HRDashboardPage = lazy(() => import('./modules/hr/HRDashboardPage'));
const HREmployeesPage = lazy(() => import('./modules/hr/EmployeesPage'));
const HRPlaceholderPage = lazy(() => import('./modules/hr/HRPlaceholderPage'));

function LazyPage({ children }) {
  return <Suspense fallback={<PageLoading size={28} />}>{children}</Suspense>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LazyPage><LoginPage /></LazyPage>} />

          <Route
            path="/pos/returns"
            element={
              <ProtectedRoute require="pos">
                <CapabilityRoute cap="canCreateReturns">
                  <ErrorBoundary>
                    <LazyPage><ReturnsPage cashierMode /></LazyPage>
                  </ErrorBoundary>
                </CapabilityRoute>
              </ProtectedRoute>
            }
          />

          <Route
            path="/pos"
            element={
              <ProtectedRoute require="pos">
                <ErrorBoundary>
                  <LazyPage><POSPage /></LazyPage>
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/shifts"
            element={
              <ProtectedRoute require="shifts">
                <LazyPage><ShiftsLayout /></LazyPage>
              </ProtectedRoute>
            }
          >
            <Route
              path="open"
              element={(
                <CapabilityRoute cap="canOpenShift">
                  <LazyPage><ShiftOpenPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="close"
              element={(
                <CapabilityRoute cap="canCloseShift">
                  <LazyPage><ShiftClosePage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="history"
              element={(
                <CapabilityRoute anyOf={['canViewShiftReports', 'canViewOwnShiftHistory']}>
                  <LazyPage><ShiftHistoryPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route index element={<Navigate to="open" replace />} />
          </Route>

          <Route
            path="/hr"
            element={
              <ProtectedRoute require="hr">
                <ErrorBoundary>
                  <HRLayout />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          >
            <Route index element={<LazyPage><HRDashboardPage /></LazyPage>} />
            <Route
              path="employees"
              element={(
                <CapabilityRoute cap="canViewEmployees">
                  <LazyPage><HREmployeesPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="users"
              element={(
                <CapabilityRoute cap="canManageOperationalUsers">
                  <LazyPage><UsersPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="departments"
              element={(
                <CapabilityRoute cap="canAccessHRWorkspace">
                  <LazyPage><HRPlaceholderPage titleKey="nav.departments" descKey="hr.departments.subtitle" /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="positions"
              element={(
                <CapabilityRoute cap="canAccessHRWorkspace">
                  <LazyPage><HRPlaceholderPage titleKey="nav.positions" descKey="hr.positions.subtitle" /></LazyPage>
                </CapabilityRoute>
              )}
            />
          </Route>

          <Route
            path="/inventory"
            element={
              <ProtectedRoute require="inventory">
                <InventoryLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<LazyPage><InventoryDashboardPage /></LazyPage>} />
            <Route path="warehouses" element={<LazyPage><WarehousesPage /></LazyPage>} />
            <Route path="stock-entry" element={<LazyPage><StockEntryPage /></LazyPage>} />
            <Route
              path="transfer"
              element={(
                <InventoryCapabilityRoute cap="canInventoryIssueTransfer">
                  <LazyPage><StockTransferPage /></LazyPage>
                </InventoryCapabilityRoute>
              )}
            />
            <Route
              path="reconciliation"
              element={(
                <InventoryCapabilityRoute cap="canInventoryReconcile">
                  <LazyPage><ReconciliationPage /></LazyPage>
                </InventoryCapabilityRoute>
              )}
            />
            <Route path="ledger" element={<LazyPage><StockLedgerPage /></LazyPage>} />
            <Route path="items" element={(
              <CapabilityRoute cap="canInventoryManage">
                <LazyPage><ItemDetailsPage /></LazyPage>
              </CapabilityRoute>
            )} />
            <Route path="alerts" element={<LazyPage><InventoryAlertsPage /></LazyPage>} />
            <Route path="reorder" element={<LazyPage><ReorderPage /></LazyPage>} />
            <Route path="batches" element={(
              <CapabilityRoute cap="canInventoryManage">
                <LazyPage><BatchesPage /></LazyPage>
              </CapabilityRoute>
            )} />
            <Route
              path="analytics"
              element={(
                <InventoryCapabilityRoute cap="canInventoryAnalytics">
                  <LazyPage><AnalyticsPage /></LazyPage>
                </InventoryCapabilityRoute>
              )}
            />
            <Route path="reports" element={(
              <CapabilityRoute cap="canInventoryManage">
                <LazyPage><InventoryReportsPage /></LazyPage>
              </CapabilityRoute>
            )} />
          </Route>

          <Route
            path="/purchasing"
            element={
              <ProtectedRoute require="purchasing">
                <ErrorBoundary>
                  <PurchasingShellLayout />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          >
            <Route index element={<LazyPage><PurchasingDashboardPage /></LazyPage>} />
            <Route path="suppliers" element={<LazyPage><SuppliersPage /></LazyPage>} />
            <Route path="suppliers/:id" element={<LazyPage><SupplierDetailPage /></LazyPage>} />
            <Route path="receive" element={<LazyPage><ReceiveStockPage /></LazyPage>} />
            <Route
              path="approvals"
              element={(
                <CapabilityRoute cap="canViewPurchaseApprovals">
                  <LazyPage><PurchaseApprovalsPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="invoices"
              element={(
                <CapabilityRoute cap="canAccessAccountantWorkspace">
                  <LazyPage><PurchaseInvoicesPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="reports"
              element={(
                <CapabilityRoute cap="canAccessAccountantWorkspace">
                  <LazyPage><PurchaseReportsPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
          </Route>

          <Route
            path="/manager"
            element={
              <ProtectedRoute require="manager">
                <ErrorBoundary>
                  <ManagerLayout />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          >
            <Route index element={<LazyPage><DashboardPage monitorOnly /></LazyPage>} />
            <Route
              path="approvals"
              element={(
                <CapabilityRoute cap="canViewApprovalsDashboard">
                  <LazyPage><ApprovalsDashboardPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="reports"
              element={(
                <CapabilityRoute cap="canViewReports">
                  <LazyPage><ReportsPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="shifts/history"
              element={(
                <CapabilityRoute cap="canViewShiftReports">
                  <LazyPage><ShiftHistoryPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="purchase-approvals"
              element={(
                <CapabilityRoute cap="canViewPurchaseApprovals">
                  <LazyPage><PurchaseApprovalsPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
          </Route>

          <Route
            path="/finance"
            element={
              <ProtectedRoute require="finance">
                <ErrorBoundary>
                  <FinanceLayout />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          >
            <Route index element={<LazyPage><AccountantDashboardPage /></LazyPage>} />
            <Route
              path="matching"
              element={(
                <CapabilityRoute cap="canAccessInvoiceMatching">
                  <LazyPage><InvoiceMatchingPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="payments"
              element={(
                <CapabilityRoute cap="canViewSupplierPayments">
                  <LazyPage><SupplierPaymentsPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="approvals"
              element={(
                <CapabilityRoute cap="canViewApprovalsDashboard">
                  <LazyPage><ApprovalsDashboardPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="invoices"
              element={(
                <CapabilityRoute cap="canViewInvoices">
                  <LazyPage><InvoicesPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="reports"
              element={(
                <CapabilityRoute cap="canViewReports">
                  <LazyPage><ReportsPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="shifts/history"
              element={(
                <CapabilityRoute cap="canViewShiftReports">
                  <LazyPage><ShiftHistoryPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="purchase-approvals"
              element={<Navigate to="/finance/approvals" replace />}
            />
            <Route
              path="ledger"
              element={(
                <CapabilityRoute cap="canViewStockLedgerReadOnly">
                  <LazyPage><StockLedgerPage readOnly /></LazyPage>
                </CapabilityRoute>
              )}
            />
          </Route>

          <Route path="/admin/purchasing" element={<LegacyPrefixRedirect from="/admin/purchasing" to="/purchasing" />} />
          <Route path="/admin/purchasing/*" element={<LegacyPrefixRedirect from="/admin/purchasing" to="/purchasing" />} />
          <Route path="/admin/accounting" element={<LegacyPrefixRedirect from="/admin/accounting" to="/finance" />} />
          <Route path="/admin/accounting/*" element={<LegacyPrefixRedirect from="/admin/accounting" to="/finance" />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute require="admin">
                <ErrorBoundary>
                  <AdminLayout />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          >
            <Route index element={<LazyPage><AdminHomePage /></LazyPage>} />
            <Route
              path="accounting"
              element={<Navigate to="/finance" replace />}
            />
            <Route
              path="accounting/matching"
              element={<Navigate to="/finance/matching" replace />}
            />
            <Route
              path="accounting/payments"
              element={<Navigate to="/finance/payments" replace />}
            />
            <Route
              path="approvals"
              element={(
                <CapabilityRoute cap="canViewApprovalsDashboard">
                  <LazyPage><ApprovalsDashboardPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="products"
              element={(
                <CapabilityRoute cap="canManageSystem">
                  <LazyPage><ProductsPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="inventory"
              element={(
                <CapabilityRoute cap="canAccessInventory">
                  <LazyPage><InventoryPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="invoices"
              element={(
                <CapabilityRoute cap="canViewInvoices">
                  <LazyPage><InvoicesPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="returns"
              element={(
                <CapabilityRoute cap="canViewReturns">
                  <LazyPage><ReturnsPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="customers"
              element={(
                <CapabilityRoute cap="canViewReports">
                  <LazyPage><CustomersPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="users"
              element={(
                <CapabilityRoute cap="canManageSystem">
                  <LazyPage><UsersPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="warehouses"
              element={(
                <CapabilityRoute cap="canManageSystem">
                  <LazyPage><AdminWarehousesPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="reports"
              element={(
                <CapabilityRoute cap="canViewReports">
                  <LazyPage><ReportsPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="activity"
              element={(
                <CapabilityRoute cap="canViewReports">
                  <LazyPage><ActivityLogPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="settings"
              element={(
                <CapabilityRoute cap="canManageSettings">
                  <LazyPage><SettingsPage /></LazyPage>
                </CapabilityRoute>
              )}
            />
            <Route
              path="shifts"
              element={(
                <CapabilityRoute anyOf={['canViewShiftReports', 'canViewOwnShiftHistory']}>
                  <LazyPage><ShiftsLayout /></LazyPage>
                </CapabilityRoute>
              )}
            >
              <Route
                path="open"
                element={(
                  <CapabilityRoute cap="canOpenShift">
                    <LazyPage><ShiftOpenPage /></LazyPage>
                  </CapabilityRoute>
                )}
              />
              <Route
                path="close"
                element={(
                  <CapabilityRoute cap="canCloseShift">
                    <LazyPage><ShiftClosePage /></LazyPage>
                  </CapabilityRoute>
                )}
              />
              <Route
                path="history"
                element={(
                  <CapabilityRoute anyOf={['canViewShiftReports', 'canViewOwnShiftHistory']}>
                    <LazyPage><ShiftHistoryPage /></LazyPage>
                  </CapabilityRoute>
                )}
              />
              <Route index element={<Navigate to="history" replace />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
