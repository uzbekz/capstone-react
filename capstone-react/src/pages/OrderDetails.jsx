import "./OrderDetails.css";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getOrderDetails, cancelOrderRequest } from "../api";

function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    async function load() {
      const data = await getOrderDetails(id);
      setOrder(data);
      setLoading(false);
    }
    load();
  }, [id]);

  // poll while dispatched until delivered
  useEffect(() => {
    if (!order) return;

    let interval = null;
    if (order.status === "dispatched") {
      // compute remaining
      if (order.delivered_at) {
        const rem = new Date(order.delivered_at).getTime() - Date.now();
        setTimeout(() => setRemaining(rem > 0 ? rem : 0), 0);
      }

      interval = setInterval(async () => {
        const updated = await getOrderDetails(id);
        setOrder(updated);
        if (updated.status !== "dispatched") {
          clearInterval(interval);
          setRemaining(null);
        } else if (updated.delivered_at) {
          const rem2 = new Date(updated.delivered_at).getTime() - Date.now();
          setRemaining(rem2 > 0 ? rem2 : 0);
        }
      }, 15000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [order, id]);

  async function cancel() {
    if (!window.confirm("Cancel this order?")) return;
    const data = await cancelOrderRequest(id);
    alert(data.message);
    navigate("/customerOrders");
  }

  const renderTimeline = () => {
    const steps = [
      { key: "pending", label: "Pending" },
      { key: "dispatched", label: "Dispatched" },
      { key: "delivered", label: "Delivered" }
    ];
    const currentIndex = steps.findIndex(s => s.key === order.status);
    // if cancelled, highlight differently
    return (
      <div className="timeline">
        {steps.map((step, idx) => (
          <div
            key={step.key}
            className={`timeline-step ${idx <= currentIndex ? "active" : ""}`}
          >
            {step.label}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="order-details">
        <p>Loading order...</p>
      </div>
    );
  }

  if (!order || order.id == null) {
    return <p>Order not found.</p>;
  }

  return (
    <div className="order-details">
      <h2>Order #{order.id}</h2>
      {renderTimeline()}
      <p>Status: {order.status}</p>
      {order.status === "dispatched" && order.delivered_at && (
        <p className="eta">ETA: {new Date(order.delivered_at).toLocaleString()}</p>
      )}
      {remaining !== null && remaining > 0 && (
        <p className="eta">Arriving in {Math.floor(remaining / 60000)}m {Math.floor((remaining % 60000) / 1000)}s</p>
      )}
      <p>Date: {new Date(order.createdAt || order.created_at).toLocaleString()}</p>
      <div className="items">
        {order.items.map(item => (
          <div key={item.id} className="item-row">
            <p>{item.Product.name} x {item.quantity}</p>
            <p>${Number(item.price).toFixed(2)}</p>
          </div>
        ))}
      </div>
      <p className="total">Total: ${Number(order.total_price).toFixed(2)}</p>
      <div style={{ marginTop: 16 }}>
        <button className="back-btn" onClick={() => navigate('/customerOrders')}>⬅ Back to Orders</button>
        {order.status === "pending" && (
          <button className="btn-cancel" onClick={cancel} style={{ marginLeft: 12 }}>Cancel Order</button>
        )}
      </div>
    </div>
  );
}

export default OrderDetails;
