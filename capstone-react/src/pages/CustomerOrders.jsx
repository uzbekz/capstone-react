import "./CustomerOrders.css";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function CustomerOrders() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🔐 Auth guard
  useEffect(() => {
    if (!token) navigate("/");
  }, [token, navigate]);

  // 📦 Fetch orders
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
    <>
      <h2>My Orders</h2>

      <div className="orders-container">
        {loading && <p>Loading orders...</p>}

        {!loading && orders.length === 0 && (
          <p>No orders yet.</p>
        )}

        {!loading && orders.map(order => (
          <div key={order.id} className="order">
            <h3>Order #{order.id}</h3>

            <p>
              Status:{" "}
              <b className={order.status}>
                {order.status}
              </b>
            </p>

            <p>Total: ${order.total_price}</p>

            <p>
              Date:{" "}
              {new Date(
                order.createdAt || order.created_at
              ).toLocaleString()}
            </p>

            <ul>
              {order.items.map(item => (
                <li key={item.id}>
                  {item.Product.name} x {item.quantity} — ${item.price}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <br />
      <Link to="/customerProducts">⬅ Back to Products</Link>
    </>
  );
}

export default CustomerOrders;
