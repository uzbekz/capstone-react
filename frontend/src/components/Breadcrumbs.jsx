import { Link, useLocation } from "react-router-dom";
import "./Breadcrumbs.css";

const hiddenPaths = new Set(["/", "/register", "/forgot-password"]);

const breadcrumbMap = {
  "/mainPage": [{ label: "Products" }],
  "/addProduct": [
    { label: "Products", to: "/mainPage" },
    { label: "Add Product" },
  ],
  "/dashboard": [
    { label: "Products", to: "/mainPage" },
    { label: "Dashboard" },
  ],
  "/adminSettings": [
    { label: "Products", to: "/mainPage" },
    { label: "Settings" },
  ],
  "/adminOrders": [
    { label: "Products", to: "/mainPage" },
    { label: "Manage Orders" },
  ],
  "/adminUsers": [
    { label: "Products", to: "/mainPage" },
    { label: "Users" },
  ],
  "/adminUsers/approvals": [
    { label: "Products", to: "/mainPage" },
    { label: "Users", to: "/adminUsers" },
    { label: "Approvals" },
  ],
  "/adminApprovals": [
    { label: "Products", to: "/mainPage" },
    { label: "Users", to: "/adminUsers" },
    { label: "Approvals" },
  ],
  "/customerProducts": [{ label: "Products" }],
  "/cart": [
    { label: "Products", to: "/customerProducts" },
    { label: "Cart" },
  ],
  "/customerOrders": [
    { label: "Products", to: "/customerProducts" },
    { label: "My Orders" },
  ],
  "/profile": [
    { label: "Products", to: "/customerProducts" },
    { label: "Profile" },
  ],
};

function Breadcrumbs() {
  const location = useLocation();
  const pathSegments = location.pathname.split("/").filter(Boolean);
  const orderId = pathSegments[1];

  if (hiddenPaths.has(location.pathname)) {
    return null;
  }

  const items =
    breadcrumbMap[location.pathname] ||
    (location.pathname.startsWith("/order/")
      ? [
          { label: "Products", to: "/customerProducts" },
          { label: "My Orders", to: "/customerOrders" },
          { label: `Order #${orderId || "Details"}` },
        ]
      : [{ label: "Home" }]);

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol className="breadcrumbs-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="breadcrumbs-item">
              {item.to && !isLast ? (
                <Link to={item.to} className="breadcrumbs-link">
                  {item.label}
                </Link>
              ) : (
                <span
                  className={isLast ? "breadcrumbs-current" : "breadcrumbs-label"}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default Breadcrumbs;
