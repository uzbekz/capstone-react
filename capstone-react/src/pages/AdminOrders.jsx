import "./AdminOrders.css";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function AdminOrders() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("token");

  
  useEffect(() => {
    if (!token) navigate("/");
  }, [token, navigate]);

  async function loadOrders() {
    setLoading(true);

    const res = await fetch("http://localhost:5000/orders/all", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    setOrders(data);
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
  }, []);

  function convertToBase64(buffer) {
    if (!buffer) return "";
    const bytes = new Uint8Array(buffer.data);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return `data:image/jpeg;base64,${btoa(binary)}`;
  }

  async function dispatchOrder(id) {
    const res = await fetch(`http://localhost:5000/orders/${id}/dispatch`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    alert(data.message);
    loadOrders();
  }

  async function cancelOrder(id) {
    const res = await fetch(`http://localhost:5000/orders/${id}/cancel`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    alert(data.message);
    loadOrders();
  }

  return (
    <div className="admin-orders">
      <h1>Manage Orders</h1>

      {loading && <p className="loading">Loading orders...</p>}

      {!loading && orders.length === 0 && <p className="empty">No orders yet.</p>}

      {!loading && (
        <div className="orders-container">
          {orders.map((order) => (
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
                      <p className="qty">Qty: <strong>{item.quantity}</strong></p>
                      <p className="price">${item.price} each</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="order-footer">
                <div className="order-info">
                  <p><span>Total:</span> <strong>${order.total_price}</strong></p>
                  <p><span>Date:</span> <strong>{new Date(order.createdAt || order.created_at).toLocaleDateString()}</strong></p>
                </div>

                {order.status === "pending" && (
                  <div className="actions">
                    <button className="btn-dispatch" onClick={() => dispatchOrder(order.id)}>
                      ✓ Dispatch
                    </button>
                    <button className="btn-cancel" onClick={() => cancelOrder(order.id)}>
                      ✕ Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Link to="/mainPage" className="back-link">
        ⬅ Back to Admin Dashboard
      </Link>
    </div>
  );
}

export default AdminOrders;
