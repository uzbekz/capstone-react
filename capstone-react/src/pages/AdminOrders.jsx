import "./AdminOrders.css";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function AdminOrders() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("token");

  // 🔐 Guard
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
      <h2>All Orders</h2>

      {loading && <p>Loading orders...</p>}

      {!loading && orders.length === 0 && <p>No orders yet.</p>}

      {!loading &&
        orders.map((order) => (
          <div key={order.id} className="order">
            <h3>Order #{order.id}</h3>
            <p>
              Customer ID: <b>{order.customer_id}</b>
            </p>
            <p>
              Status: <b className={order.status}>{order.status}</b>
            </p>

            <p>Total: ${order.total_price}</p>

            <p>
              Date:{" "}
              {new Date(order.createdAt || order.created_at).toLocaleString()}
            </p>

            <ul>
              {order.items.map((item) => (
                <li key={item.id} className="order-item">
                  <img
                    src={convertToBase64(item.Product.image)}
                    alt={item.Product.name}
                    width={60}
                    height={60}
                    style={{ objectFit: "cover", marginRight: "10px" }}
                  />

                  <div>
                    <div>
                      <b>{item.Product.name}</b>
                    </div>
                    <div>Qty: {item.quantity}</div>
                    <div>Price: ${item.price}</div>
                  </div>
                </li>
              ))}
            </ul>

            {order.status === "pending" && (
              <div className="actions">
                <button onClick={() => dispatchOrder(order.id)}>
                  Dispatch
                </button>
                <button onClick={() => cancelOrder(order.id)}>Cancel</button>
              </div>
            )}
          </div>
        ))}

      <Link to="/mainPage" className="back-link">
        ⬅ Back to Admin Dashboard
      </Link>
    </div>
  );
}

export default AdminOrders;
