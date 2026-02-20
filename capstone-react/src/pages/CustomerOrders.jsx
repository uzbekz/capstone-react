import "./CustomerOrders.css";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function CustomerOrders() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  
  useEffect(() => {
    if (!token) navigate("/");
  }, [token, navigate]);

  
  useEffect(() => {
    async function loadOrders() {
      try {
        const res = await fetch("http://localhost:5000/orders", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        const data = await res.json();
        setOrders(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadOrders();
  }, [token]);

  return (
    <div style={{ padding: "24px" }}>
      <h2>📦 My Orders</h2>

      <div className="orders-container">
        {loading && <p style={{ textAlign: "center", color: "var(--muted)" }}>Loading orders...</p>}

        {!loading && orders.length === 0 && (
          <div className="empty-state">
            <p>No orders yet.</p>
            <p style={{ fontSize: "14px", marginTop: "8px" }}>
              Start shopping to see your orders here!
            </p>
          </div>
        )}

        {!loading && orders.map(order => (
          <div key={order.id} className="order">
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
                    <p className="item-price">${Number(item.price).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="order-footer">
              <div>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>Total Amount</p>
                <h4 style={{ margin: "4px 0 0 0" }}>
                  ${Number(order.total_price).toFixed(2)}
                </h4>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Link to="/customerProducts" className="back-link">
        ⬅ Back to Products
      </Link>
    </div>
  );
}

export default CustomerOrders;
