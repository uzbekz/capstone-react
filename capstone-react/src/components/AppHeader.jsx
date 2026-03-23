import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getProfile } from "../api";
import "./AppHeader.css";

const hiddenPaths = new Set(["/", "/register", "/forgot-password"]);
const productManagerPaths = new Set([
  "/mainPage",
  "/addProduct",
  "/dashboard",
  "/adminOrders",
  "/adminApprovals",
]);

function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const token = localStorage.getItem("token");

      if (!token || hiddenPaths.has(location.pathname)) {
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
  const isPrimaryAdmin = isProductManager && profile?.id === 1;

  const navItems = isProductManager
    ? [
        { to: "/mainPage", label: "Products" },
        { to: "/adminOrders", label: "Orders" },
        { to: "/addProduct", label: "Add Product" },
        { to: "/dashboard", label: "Dashboard" },
        ...(isPrimaryAdmin ? [{ to: "/adminApprovals", label: "Admin Requests" }] : []),
      ]
    : [
        { to: "/customerProducts", label: "Shop" },
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
    localStorage.clear();
    setProfile(null);
    navigate("/");
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to={homeRoute} className="app-header-brand">
          Capstone
        </Link>

        <nav className="app-header-nav" aria-label="Primary">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.to ||
              (item.to === "/customerOrders" && location.pathname.startsWith("/order/"));

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`app-header-link ${isActive ? "active" : ""}`}
              >
                {item.label}
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
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
