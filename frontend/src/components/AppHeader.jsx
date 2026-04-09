import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getProfile, logout } from "../api";
import "./AppHeader.css";

const hiddenPaths = new Set(["/", "/register", "/forgot-password"]);
const productManagerPaths = new Set([
  "/mainPage",
  "/addProduct",
  "/dashboard",
  "/adminSettings",
  "/adminOrders",
  "/adminOrders/pending",
  "/adminOrders/history",
  "/adminUsers",
  "/adminUsers/approvals",
  "/adminApprovals",
]);

function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (hiddenPaths.has(location.pathname)) {
        setProfile(null);
        return;
      }

      try {
        const data = await getProfile();
        if (!cancelled) {
          setProfile(data);
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (hiddenPaths.has(location.pathname)) {
    return null;
  }

  const isProductManager =
    profile?.role === "product_manager" || productManagerPaths.has(location.pathname);

  const navItems = isProductManager
    ? [
        { to: "/mainPage", label: "Products" },
        { to: "/adminOrders", label: "Orders" },
        { to: "/adminUsers", label: "Users" },
        { to: "/adminSettings", label: "Settings" },
        { to: "/addProduct", label: "Add Product" },
        { to: "/dashboard", label: "Dashboard" },
      ]
    : [
        { to: "/customerProducts", label: "Products" },
        { to: "/cart", label: "Cart" },
        { to: "/customerOrders", label: "Orders" },
        { to: "/profile", label: "Profile" },
      ];

  const homeRoute = isProductManager ? "/mainPage" : "/customerProducts";
  const roleLabel = profile?.role
    ? profile.role
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    : null;

  function handleLogout() {
    logout()
      .catch(() => null)
      .finally(() => {
        setProfile(null);
        navigate("/");
      });
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to={homeRoute} className="app-header-brand">
          <span>Capstone</span>
        </Link>

        <nav className="app-header-nav" aria-label="Primary">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.to ||
              (item.to === "/customerOrders" && location.pathname.startsWith("/order/")) ||
              (item.to === "/adminUsers" && location.pathname.startsWith("/adminUsers")) ||
              (item.to === "/adminOrders" && location.pathname.startsWith("/adminOrders"));

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`app-header-link ${isActive ? "active" : ""}`}
              >
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="app-header-meta">
          {profile?.email && (
            <div className="app-header-user">
              <span className="app-header-email">{profile.email}</span>
              {roleLabel && <span className="app-header-role">{roleLabel}</span>}
            </div>
          )}
          <button type="button" className="app-header-logout" onClick={handleLogout}>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
