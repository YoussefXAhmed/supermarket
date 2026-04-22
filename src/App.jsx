import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AdminLayout    from './components/layout/AdminLayout';

// Pages
import LoginPage      from './modules/auth/LoginPage';
import POSPage        from './modules/pos/POSPage';
import DashboardPage  from './modules/admin/DashboardPage';
import ProductsPage   from './modules/admin/ProductsPage';
import InventoryPage  from './modules/admin/InventoryPage';
import InvoicesPage   from './modules/admin/InvoicesPage';
import CustomersPage  from './modules/admin/CustomersPage';
import UsersPage      from './modules/admin/UsersPage';
import ReportsPage    from './modules/admin/ReportsPage';
import SettingsPage   from './modules/admin/SettingsPage';
import InventoryLayout from './components/layout/InventoryLayout';
import InventoryDashboardPage from './modules/inventory/InventoryPage';
import WarehousesPage from './modules/inventory/pages/WarehousesPage';
import StockEntryPage from './modules/inventory/pages/StockEntryPage';
import StockLedgerPage from './modules/inventory/pages/StockLedgerPage';
import ItemDetailsPage from './modules/inventory/pages/ItemDetailsPage';
import InventoryAlertsPage from './modules/inventory/pages/AlertsPage';
import InventoryReportsPage from './modules/inventory/pages/ReportsPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* POS — requires POS User or Admin */}
          <Route path="/pos" element={
            <ProtectedRoute require="pos">
              <POSPage />
            </ProtectedRoute>
          } />

          {/* Inventory module */}
          <Route path="/inventory" element={
            <ProtectedRoute require="inventory">
              <InventoryLayout />
            </ProtectedRoute>
          }>
            <Route index element={<InventoryDashboardPage />} />
            <Route path="warehouses" element={<WarehousesPage />} />
            <Route path="stock-entry" element={<StockEntryPage />} />
            <Route path="ledger" element={<StockLedgerPage />} />
            <Route path="items" element={<ItemDetailsPage />} />
            <Route path="alerts" element={<InventoryAlertsPage />} />
            <Route path="reports" element={<InventoryReportsPage />} />
          </Route>

          {/* Admin — requires System Manager */}
          <Route path="/admin" element={
            <ProtectedRoute require="admin">
              <AdminLayout />
            </ProtectedRoute>
          }>
            <Route index            element={<DashboardPage />} />
            <Route path="products"  element={<ProductsPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="invoices"  element={<InvoicesPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="users"     element={<UsersPage />} />
            <Route path="reports"   element={<ReportsPage />} />
            <Route path="settings"  element={<SettingsPage />} />
          </Route>

          {/* Default redirect */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
