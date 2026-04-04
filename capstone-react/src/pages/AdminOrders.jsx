import "./AdminOrders.css";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import loadingGif from "../assets/loading.gif";
import { dispatchOrderRequest, getAllOrders, cancelOrderRequest } from "../api";
import { useSnackbar } from "../components/SnackbarProvider";

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateOnlyString(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return getLocalDateString(date);
}

function AdminOrders() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState("today");
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const { showSnackbar } = useSnackbar();

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllOrders();
      setOrders(data);
    } catch (err) {
      console.error(err);
      showSnackbar("Unable to load orders.", "error");
      navigate("/");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filteredOrders = orders.filter((order) => {
    if (filterMode === "all") return true;

    const orderDate = toDateOnlyString(order.createdAt || order.created_at);
    if (!orderDate) return false;

    if (filterMode === "today") {
      return orderDate === getLocalDateString();
    }

    return orderDate === selectedDate;
  });

  const emptyMessage =
    filterMode === "all"
      ? "No orders yet."
      : filterMode === "today"
        ? "No orders placed today."
        : `No orders found for ${selectedDate}.`;

  function convertToBase64(buffer) {
    if (!buffer) return "";
    const bytes = new Uint8Array(buffer.data);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return `data:image/jpeg;base64,${btoa(binary)}`;
  }

  async function dispatchOrder(id) {
    try {
      setLoading(true);
      const data = await dispatchOrderRequest(id);
      showSnackbar(data.message || "Order dispatched successfully.", "success");
      await loadOrders();
    } catch (err) {
      showSnackbar(err.message || "Failed to dispatch order", "error");
      setLoading(false);
    }
  }

  async function cancelOrder(id) {
    try {
      setLoading(true);
      const data = await cancelOrderRequest(id);
      showSnackbar(data.message || "Order cancelled successfully.", "success");
      await loadOrders();
    } catch (err) {
      showSnackbar(err.message || "Failed to cancel order", "error");
      console.error(err.message || "Failed to cancel order");
      setLoading(false);
    }
  }

  return (
    <div className="admin-orders">
      <h1>Manage Orders</h1>
      <div className="orders-filter-bar">
        <button
          type="button"
          className={`filter-btn ${filterMode === "today" ? "active" : ""}`}
          onClick={() => {
            setFilterMode("today");
            setSelectedDate(getLocalDateString());
          }}
        >
          Today
        </button>

        <label className="date-picker-label">
          Pick day:
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setFilterMode("date");
            }}
          />
        </label>

        <button
          type="button"
          className={`filter-btn ${filterMode === "all" ? "active" : ""}`}
          onClick={() => setFilterMode("all")}
        >
          All Time
        </button>
      </div>

      {loading && (
        <div className="loading-container">
          <img src={loadingGif} alt="Loading orders" className="loading-gif" />
        </div>
      )}

      {!loading && filteredOrders.length === 0 && <p className="empty">{emptyMessage}</p>}

      {!loading && (
        <div className="orders-container">
          {filteredOrders.map((order) => (
            <div key={order.id} className="order">
              <div className="order-header">
                <div>
                  <div className="order-id">Order #{order.id}</div>
                  <div className="order-meta">Customer #{order.customer_id}</div>
                </div>
                <span className={`order-status ${order.status}`}>
                  {order.status.toUpperCase()}
                </span>
              </div>

              <div className="order-items-grid">
                {order.items.map((item) => (
                  <div key={item.id} className="order-item-card">
                    <img
                      src={convertToBase64(item.Product.image)}
                      alt={item.Product.name}
                      className="item-image"
                    />
                    <div className="item-details">
                      <h4>{item.Product.name}</h4>
                      <p className="qty">
                        Qty: <strong>{item.quantity}</strong>
                      </p>
                      <p className="price">Rs {item.price} each</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="order-footer">
                <div className="order-info">
                  <p>
                    <span>Total:</span> <strong>Rs {order.total_price}</strong>
                  </p>
                  <p>
                    <span>Date:</span>{" "}
                    <strong>
                      {new Date(order.createdAt || order.created_at).toLocaleDateString()}
                    </strong>
                  </p>
                </div>

                {order.status === "pending" && (
                  <div className="actions">
                    <button className="btn-dispatch" onClick={() => dispatchOrder(order.id)}>
                      Dispatch
                    </button>
                    <button className="btn-cancel" onClick={() => cancelOrder(order.id)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminOrders;
