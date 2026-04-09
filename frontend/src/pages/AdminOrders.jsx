import "./AdminOrders.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import loadingGif from "../assets/loading.gif";
import {
  bulkCancelOrdersRequest,
  bulkDispatchOrdersRequest,
  dispatchOrderRequest,
  getAllOrders,
  cancelOrderRequest,
  getUsers,
} from "../api";
import { useSnackbar } from "../components/SnackbarProvider";

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getYearStart() {
  return `${new Date().getFullYear()}-01-01`;
}

function convertToBase64(buffer) {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer.data);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

// ─── Pending Tab ─────────────────────────────────────────────────────────────

function PendingOrders() {
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const LIMIT = 20;

  const load = useCallback(async (pageNum = 1) => {
    setLoading(true);
    try {
      const data = await getAllOrders(pageNum, LIMIT, null, null, "pending");
      setOrders(data.data);
      setPagination({ total: data.pagination.total, totalPages: data.pagination.totalPages });
      setPage(pageNum);
    } catch (err) {
      showSnackbar("Unable to load orders.", "error");
      navigate("/");
    } finally {
      setLoading(false);
    }
  }, [navigate, showSnackbar]);

  useEffect(() => { load(1); }, [load]);

  const pendingCount = pagination.total;

  async function dispatchOrder(id) {
    try {
      setLoading(true);
      const data = await dispatchOrderRequest(id);
      showSnackbar(data.message || "Order dispatched.", "success");
      await load(page);
    } catch (err) {
      showSnackbar(err.message || "Failed to dispatch order", "error");
      setLoading(false);
    }
  }

  async function cancelOrder(id) {
    const note = window.prompt("Optional internal note (admins only):", "");
    if (note === null) return;
    try {
      setLoading(true);
      const data = await cancelOrderRequest(id, note.trim());
      showSnackbar(data.message || "Order cancelled.", "success");
      await load(page);
    } catch (err) {
      showSnackbar(err.message || "Failed to cancel order", "error");
      setLoading(false);
    }
  }

  async function bulkDispatch() {
    if (pendingCount === 0) { showSnackbar("No pending orders.", "error"); return; }
    if (!window.confirm(`Dispatch all ${pendingCount} pending order(s)?`)) return;
    try {
      setLoading(true);
      const data = await bulkDispatchOrdersRequest();
      const d = data.dispatched?.length ?? 0;
      const c = data.cancelled?.length ?? 0;
      showSnackbar(data.message || `Dispatched ${d}, cancelled ${c}.`, c > 0 ? "warning" : "success");
      await load(1);
    } catch (err) {
      showSnackbar(err.message || "Bulk dispatch failed", "error");
      setLoading(false);
    }
  }

  async function bulkCancel() {
    if (pendingCount === 0) { showSnackbar("No pending orders.", "error"); return; }
    if (!window.confirm(`Cancel all ${pendingCount} pending order(s)?`)) return;
    try {
      setLoading(true);
      const data = await bulkCancelOrdersRequest();
      const n = data.cancelled?.length ?? 0;
      showSnackbar(data.message || `Cancelled ${n} order(s).`, n === 0 ? "warning" : "success");
      await load(1);
    } catch (err) {
      showSnackbar(err.message || "Bulk cancel failed", "error");
      setLoading(false);
    }
  }

  return (
    <>
      <section className="orders-hero">
        <div>
          <h1>Pending Orders</h1>
          <p className="orders-copy">Review and dispatch orders waiting to be processed.</p>
        </div>
        <div className="orders-bulk-actions">
          <button className="btn-bulk-dispatch" onClick={bulkDispatch} disabled={pendingCount === 0}>
            Bulk dispatch
          </button>
          <button className="btn-bulk-cancel" onClick={bulkCancel} disabled={pendingCount === 0}>
            Bulk cancel
          </button>
        </div>
      </section>

      <section className="orders-stat-row">
        <article className="orders-stat-card">
          <span>Pending</span>
          <strong>{pagination.total}</strong>
        </article>
      </section>

      {loading && (
        <div className="orders-loading">
          <img src={loadingGif} alt="Loading" className="orders-loading-gif" />
        </div>
      )}

      {!loading && orders.length === 0 && (
        <div className="orders-empty">No pending orders right now.</div>
      )}

      {!loading && orders.length > 0 && (
        <div className="orders-table-card">
          <div className="orders-table-wrap">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Placed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td><span className="order-id-cell">#{order.id}</span></td>
                    <td>{order.customer_email ?? `#${order.customer_id}`}</td>
                    <td>
                      <div className="order-items-mini">
                        {order.items?.map((item) => (
                          <div key={item.id} className="order-item-mini">
                            <img src={convertToBase64(item.Product?.image)} alt={item.Product?.name} />
                            <span>{item.Product?.name} × {item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>₹{Number(order.total_price).toLocaleString("en-IN")}</td>
                    <td>{new Date(order.createdAt || order.created_at).toLocaleString()}</td>
                    <td>
                      <div className="order-action-group">
                        <button className="btn-dispatch" onClick={() => dispatchOrder(order.id)}>Dispatch</button>
                        <button className="btn-cancel-sm" onClick={() => cancelOrder(order.id)}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && pagination.totalPages > 1 && (
        <div className="orders-pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page <= 1}>← Prev</button>
          <span className="page-info">Page {page} of {pagination.totalPages}</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={page >= pagination.totalPages}>Next →</button>
        </div>
      )}
    </>
  );
}

// ─── History Tab ─────────────────────────────────────────────────────────────

function OrderHistory() {
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [dateFrom, setDateFrom] = useState(getYearStart());
  const [dateTo, setDateTo]     = useState(getLocalDateString());
  const [emailFilter, setEmailFilter] = useState("");
  const LIMIT = 20;

  // load eligible customers for the dropdown once
  useEffect(() => {
    getUsers()
      .then((users) => {
        const eligible = users.filter(
          (u) => u.role === "customer" && u.isValid && u.admin_status === "approved" && u.email_verified
        );
        setCustomers(eligible);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async (pageNum = 1, from = dateFrom, to = dateTo, email = emailFilter) => {
    setLoading(true);
    try {
      const data = await getAllOrders(pageNum, LIMIT, from || null, to || null, "dispatched,delivered,returned,cancelled", email || null);
      setOrders(data.data);
      setPagination({ total: data.pagination.total, totalPages: data.pagination.totalPages });
      setPage(pageNum);
    } catch (err) {
      showSnackbar("Unable to load order history.", "error");
      navigate("/");
    } finally {
      setLoading(false);
    }
  }, [navigate, showSnackbar, dateFrom, dateTo, emailFilter]);

  useEffect(() => { load(1); }, [load]);

  function handleDateFrom(e) {
    setDateFrom(e.target.value);
    load(1, e.target.value, dateTo, emailFilter);
  }

  function handleDateTo(e) {
    setDateTo(e.target.value);
    load(1, dateFrom, e.target.value, emailFilter);
  }

  function handleEmailSelect(e) {
    setEmailFilter(e.target.value);
    load(1, dateFrom, dateTo, e.target.value);
  }

  function clearFilters() {
    const from = getYearStart();
    const to   = getLocalDateString();
    setDateFrom(from);
    setDateTo(to);
    setEmailFilter("");
    load(1, from, to, "");
  }

  const filtersChanged = emailFilter || dateFrom !== getYearStart() || dateTo !== getLocalDateString();

  const STATUS_COLORS = {
    dispatched: "status-dispatched",
    delivered:  "status-delivered",
    returned:   "status-returned",
    cancelled:  "status-cancelled",
  };

  return (
    <>
      <section className="orders-hero">
        <div>
          <h1>Order History</h1>
          <p className="orders-copy">Browse past orders with date range and customer filters.</p>
        </div>
      </section>

      <div className="orders-filters-card">
        <label className="filter-field">
          <span>From</span>
          <input type="date" value={dateFrom} onChange={handleDateFrom} max={dateTo} />
        </label>
        <label className="filter-field">
          <span>To</span>
          <input type="date" value={dateTo} onChange={handleDateTo} min={dateFrom} max={getLocalDateString()} />
        </label>
        <label className="filter-field">
          <span>Customer</span>
          <select value={emailFilter} onChange={handleEmailSelect}>
            <option value="">All customers</option>
            {customers.map((u) => (
              <option key={u.id} value={u.email}>{u.email}</option>
            ))}
          </select>
        </label>
        {filtersChanged && (
          <button className="btn-clear-filters" onClick={clearFilters}>Clear filters</button>
        )}
      </div>

      {loading && (
        <div className="orders-loading">
          <img src={loadingGif} alt="Loading" className="orders-loading-gif" />
        </div>
      )}

      {!loading && orders.length === 0 && (
        <div className="orders-empty">No orders found for the selected filters.</div>
      )}

      {!loading && orders.length > 0 && (
        <div className="orders-table-card">
          <div className="orders-table-wrap">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Placed</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td><span className="order-id-cell">#{order.id}</span></td>
                    <td>{order.customer_email ?? `#${order.customer_id}`}</td>
                    <td>
                      <div className="order-items-mini">
                        {order.items?.map((item) => (
                          <div key={item.id} className="order-item-mini">
                            <img src={convertToBase64(item.Product?.image)} alt={item.Product?.name} />
                            <span>{item.Product?.name} × {item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>₹{Number(order.total_price).toLocaleString("en-IN")}</td>
                    <td>
                      <span className={`order-status-badge ${STATUS_COLORS[order.status] ?? ""}`}>
                        {order.status.toUpperCase()}
                      </span>
                    </td>
                    <td>{new Date(order.createdAt || order.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && pagination.totalPages > 1 && (
        <div className="orders-pagination">
          <button className="page-btn" onClick={() => load(page - 1)} disabled={page <= 1}>← Prev</button>
          <span className="page-info">Page {page} of {pagination.totalPages} ({pagination.total} orders)</span>
          <button className="page-btn" onClick={() => load(page + 1)} disabled={page >= pagination.totalPages}>Next →</button>
        </div>
      )}
    </>
  );
}

// ─── Shell ───────────────────────────────────────────────────────────────────

function AdminOrders() {
  const location = useLocation();
  const activeTab = location.pathname.endsWith("/history") ? "history" : "pending";

  return (
    <div className="orders-shell">
      <div className="orders-page">
        <div className="orders-tabs" role="tablist">
          <Link to="/adminOrders/pending" className={`orders-tab ${activeTab === "pending" ? "active" : ""}`}>
            Pending
          </Link>
          <Link to="/adminOrders/history" className={`orders-tab ${activeTab === "history" ? "active" : ""}`}>
            History
          </Link>
        </div>

        {activeTab === "pending" ? <PendingOrders /> : <OrderHistory />}
      </div>
    </div>
  );
}

export default AdminOrders;
