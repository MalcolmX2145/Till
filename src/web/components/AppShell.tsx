import { NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "@web/hooks/useAuth";

const linkBase =
  "rounded-lg px-3 py-2 text-sm font-medium transition-colors";

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive
    ? `${linkBase} bg-slate-900 text-white`
    : `${linkBase} text-slate-600 hover:bg-slate-200`;
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <span className="mr-2 text-lg font-bold tracking-tight">Till</span>
        <nav className="flex flex-1 items-center gap-1">
          <NavLink to="/sell" className={navClass}>
            Sell
          </NavLink>
          <NavLink to="/sales" className={navClass}>
            Sales
          </NavLink>
          {isAdmin && (
            <>
              <NavLink to="/admin" end className={navClass}>
                Dashboard
              </NavLink>
              <NavLink to="/admin/products" className={navClass}>
                Products
              </NavLink>
              <NavLink to="/admin/inventory" className={navClass}>
                Inventory
              </NavLink>
              <NavLink to="/admin/reports" className={navClass}>
                Reports
              </NavLink>
              <NavLink to="/admin/users" className={navClass}>
                Users
              </NavLink>
            </>
          )}
        </nav>
        <span className="text-sm text-slate-500">
          {user?.username}
          <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">
            {user?.role}
          </span>
        </span>
        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate("/login", { replace: true });
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Sign out
        </button>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
