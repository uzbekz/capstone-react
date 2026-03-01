import "./CustomerOrders.css";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import loadingGif from "../assets/loading.gif";
import { cancelOrderRequest, returnOrderRequest } from "../api";

const DEFAULT_RETURN_WINDOW_DAYS = 7;

function CustomerOrders() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [returningId, setReturningId] = useState(null);

  function getReturnDeadline(order) {
    if (!order?.delivered_at) return null;
    if (order.return_deadline) return new Date(order.return_deadline);
    const days = order.return_window_days || DEFAULT_RETURN_WINDOW_DAYS;
    return new Date(new Date(order.delivered_at).getTime() + days * 24 * 60 * 60 * 1000);
  }

  function canReturn(order) {
    if (!order || order.status !== "delivered") return false;
    if (typeof order.can_return === "boolean") return order.can_return;
    const deadline = getReturnDeadline(order);
    return Boolean(deadline && Date.now() <= deadline.getTime());
  }

  useEffect(() => {
    if (!token) navigate("/");
  }, [token, navigate]);

  async function loadOrders() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("http://localhost:5000/orders", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok) {
        const msg = data && data.error ? data.error : "Server error";
        console.error("GET /orders failed", data);
        setError(msg);
        setOrders([]);
        return;
      }

      if (Array.isArray(data)) {
        setOrders(data);
      } else {
        console.error("Unexpected /orders response", data);
        setError("Unexpected server response");
        setOrders([]);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Network error");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) navigate("/");
  }, [token, navigate]);

  useEffect(() => {
    loadOrders();
  }, [token]);

  return (
    <div style={{ padding: "24px" }}>
      <h2>My Orders</h2>

      <div className="orders-container">
        {loading && (
          <div className="loading-container">
            <img src={loadingGif} alt="Loading orders" className="loading-gif" />
          </div>
        )}

        {cancellingId !== null && (
          <div className="loading-container">
            <img src={loadingGif} alt="Cancelling order" className="loading-gif" />
          </div>
        )}

        {returningId !== null && (
          <div className="loading-container">
            <img src={loadingGif} alt="Returning order" className="loading-gif" />
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="empty-state">
            <p>No orders yet.</p>
            <p style={{ fontSize: "14px", marginTop: "8px" }}>
              Start shopping to see your orders here!
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="error-card">
            <p><strong>Could not load orders</strong></p>
            <p style={{ color: "var(--muted)", marginTop: 6 }}>{error}</p>
            <div style={{ marginTop: 12 }}>
              <button className="retry-btn" onClick={loadOrders}>Retry</button>
            </div>
          </div>
        )}

        {!loading && orders.map(order => (
          <div key={order.id} className="order">
            <div className="order-actions">
              {order.status === "pending" && (
                <button
                  className="cancel-order-btn"
                  onClick={async () => {
                    if (!window.confirm("Cancel this order?")) return;
                    try {
                      setCancellingId(order.id);
                      const data = await cancelOrderRequest(order.id);
                      console.info(data.message);
                      setOrders(prev =>
                        prev.map(o =>
                          o.id === order.id ? { ...o, status: "cancelled" } : o
                        )
                      );
                    } catch (err) {
                      alert(err.message || "Failed to cancel order");
                    } finally {
                      setCancellingId(null);
                    }
                  }}
                  disabled={cancellingId === order.id}
                >
                  {cancellingId === order.id ? "Cancelling..." : "Cancel"}
                </button>
              )}

              {order.status === "delivered" && (
                <button
                  className="return-order-btn"
                  onClick={async () => {
                    if (!window.confirm("Return this delivered order?")) return;
                    try {
                      setReturningId(order.id);
                      const data = await returnOrderRequest(order.id);
                      console.info(data.message);
                      setOrders(prev =>
                        prev.map(o =>
                          o.id === order.id ? { ...o, status: "returned", can_return: false } : o
                        )
                      );
                    } catch (err) {
                      alert(err.message || "Failed to return order");
                    } finally {
                      setReturningId(null);
                    }
                  }}
                  disabled={returningId === order.id || !canReturn(order)}
                  title={!canReturn(order) ? "Return window has closed" : "Return this order"}
                >
                  {returningId === order.id ? "Returning..." : canReturn(order) ? "Return" : "Return Closed"}
                </button>
              )}

              <Link to={`/order/${order.id}`} className="view-link">View details</Link>
            </div>

            <div className="order-header">
              <div>
                <h3 style={{ margin: "0 0 4px 0" }}>Order #{order.id}</h3>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
                  {new Date(order.createdAt || order.created_at).toLocaleString()}
                </p>
              </div>
              <span className={`status-badge status-${order.status}`}>
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </span>
            </div>

            <div className="order-items-grid">
              {order.items.map(item => (
                <div key={item.id} className="order-item">
                  {item.Product.image && (
                    <div className="item-image">
                      <img
                        src={`data:image/jpeg;base64,${item.Product.image}`}
                        alt={item.Product.name}
                      />
                    </div>
                  )}
                  <div className="item-info">
                    <p className="item-name">{item.Product.name}</p>
                    <p className="item-meta">Qty: {item.quantity}</p>
                    <p className="item-price">Rs {Number(item.price).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="order-footer">
              <div>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>Total Amount</p>
                <h4 style={{ margin: "4px 0 0 0" }}>
                  Rs {Number(order.total_price).toFixed(2)}
                </h4>
                {order.status === "delivered" && (
                  <p style={{ margin: "6px 0 0 0", fontSize: "12px", color: "var(--muted)" }}>
                    Return by: {getReturnDeadline(order)?.toLocaleString() || "N/A"}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Link to="/customerProducts" className="back-link">
        Back to Products
      </Link>
    </div>
  );
}

export default CustomerOrders;
