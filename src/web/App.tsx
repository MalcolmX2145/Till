import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "@web/components/AppShell";
import { RequireRole } from "@web/components/RequireRole";
import { useAuth } from "@web/hooks/useAuth";
import { LoginPage, defaultRoute } from "@web/pages/LoginPage";
import { PlaceholderPage } from "@web/pages/PlaceholderPage";
import { InventoryPage } from "@web/pages/InventoryPage";
import { ProductsPage } from "@web/pages/ProductsPage";
import { ReceiptPage } from "@web/pages/ReceiptPage";
import { SellPage } from "@web/pages/SellPage";

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? defaultRoute(user.role) : "/login"} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireRole />}>
        {/* Outside AppShell: the receipt prints on 80mm paper and must not
            carry the navigation chrome. */}
        <Route path="receipt/:id" element={<ReceiptPage />} />

        <Route element={<AppShell />}>
          <Route index element={<HomeRedirect />} />
          <Route path="sell" element={<SellPage />} />
          <Route path="sales" element={<PlaceholderPage title="Sales" />} />

          <Route element={<RequireRole role="admin" />}>
            <Route path="admin" element={<PlaceholderPage title="Dashboard" />} />
            <Route path="admin/products" element={<ProductsPage />} />
            <Route path="admin/inventory" element={<InventoryPage />} />
            <Route
              path="admin/reports"
              element={<PlaceholderPage title="Reports" />}
            />
            <Route
              path="admin/users"
              element={<PlaceholderPage title="Users" />}
            />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
