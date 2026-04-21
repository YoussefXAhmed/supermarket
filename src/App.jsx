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
