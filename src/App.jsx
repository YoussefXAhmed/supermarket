import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import ErrorBoundary from './components/common/ErrorBoundary';
import AdminLayout from './components/layout/AdminLayout';
import InventoryLayout from './components/layout/InventoryLayout';
import PurchasingLayout from './components/layout/PurchasingLayout';
import { PageLoading } from './components/ui';

const LoginPage = lazy(() => import('./modules/auth/LoginPage'));
const POSPage = lazy(() => import('./modules/pos/POSPage'));
const DashboardPage = lazy(() => import('./modules/admin/DashboardPage'));
const ProductsPage = lazy(() => import('./modules/admin/ProductsPage'));
const InventoryPage = lazy(() => import('./modules/admin/InventoryPage'));
const InvoicesPage = lazy(() => import('./modules/admin/InvoicesPage'));
const CustomersPage = lazy(() => import('./modules/admin/CustomersPage'));
const UsersPage = lazy(() => import('./modules/admin/UsersPage'));
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
            <Route path="transfer" element={<LazyPage><StockTransferPage /></LazyPage>} />
            <Route path="reconciliation" element={<LazyPage><ReconciliationPage /></LazyPage>} />
            <Route path="ledger" element={<LazyPage><StockLedgerPage /></LazyPage>} />
            <Route path="items" element={<LazyPage><ItemDetailsPage /></LazyPage>} />
            <Route path="alerts" element={<LazyPage><InventoryAlertsPage /></LazyPage>} />
            <Route path="reorder" element={<LazyPage><ReorderPage /></LazyPage>} />
            <Route path="batches" element={<LazyPage><BatchesPage /></LazyPage>} />
            <Route path="analytics" element={<LazyPage><AnalyticsPage /></LazyPage>} />
            <Route path="reports" element={<LazyPage><InventoryReportsPage /></LazyPage>} />
          </Route>

          <Route
            path="/admin"
            element={
              <ProtectedRoute require="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<LazyPage><DashboardPage /></LazyPage>} />
            <Route path="products" element={<LazyPage><ProductsPage /></LazyPage>} />
            <Route path="inventory" element={<LazyPage><InventoryPage /></LazyPage>} />
            <Route path="purchasing" element={<PurchasingLayout />}>
              <Route index element={<LazyPage><PurchasingDashboardPage /></LazyPage>} />
              <Route path="suppliers" element={<LazyPage><SuppliersPage /></LazyPage>} />
              <Route path="suppliers/:id" element={<LazyPage><SupplierDetailPage /></LazyPage>} />
              <Route path="receive" element={<LazyPage><ReceiveStockPage /></LazyPage>} />
              <Route path="invoices" element={<LazyPage><PurchaseInvoicesPage /></LazyPage>} />
              <Route path="matching" element={<LazyPage><InvoiceMatchingPage /></LazyPage>} />
              <Route path="reports" element={<LazyPage><PurchaseReportsPage /></LazyPage>} />
            </Route>
            <Route path="invoices" element={<LazyPage><InvoicesPage /></LazyPage>} />
            <Route path="customers" element={<LazyPage><CustomersPage /></LazyPage>} />
            <Route path="users" element={<LazyPage><UsersPage /></LazyPage>} />
            <Route path="reports" element={<LazyPage><ReportsPage /></LazyPage>} />
            <Route path="activity" element={<LazyPage><ActivityLogPage /></LazyPage>} />
            <Route path="settings" element={<LazyPage><SettingsPage /></LazyPage>} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
