import "./OrderDetails.css";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getOrderDetails, cancelOrderRequest } from "../api";
import loadingGif from "../assets/loading.gif";

function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
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
      interval = setInterval(async () => {
        const updated = await getOrderDetails(id);
        setOrder(updated);
        if (updated.status !== "dispatched") {
          clearInterval(interval);
          setRemaining(null);
        }
      }, 15000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [order, id]);

  // live ETA countdown (updates every second)
  useEffect(() => {
    if (!order || order.status !== "dispatched" || !order.delivered_at) {
      setRemaining(null);
      return;
    }

    const targetTs = new Date(order.delivered_at).getTime();
    const updateRemaining = () => {
      const ms = targetTs - Date.now();
      setRemaining(ms > 0 ? ms : 0);
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);

    return () => clearInterval(timer);
  }, [order]);

  async function cancel() {
    if (!window.confirm("Cancel this order?")) return;
    try {
      setActionLoading(true);
      const data = await cancelOrderRequest(id);
      console.info(data.message);
      navigate("/customerOrders");
    } finally {
      setActionLoading(false);
    }
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
        <div className="order-loading">
          <img src={loadingGif} alt="Loading order" className="order-loading-gif" />
          <p>Loading order...</p>
        </div>
      </div>
    );
  }

  if (actionLoading) {
    return (
      <div className="order-details">
        <div className="order-loading">
          <img src={loadingGif} alt="Updating order" className="order-loading-gif" />
          <p>Updating order...</p>
        </div>
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
            <p>₹{Number(item.price).toFixed(2)}</p>
          </div>
        ))}
      </div>
      <p className="total">Total: ₹{Number(order.total_price).toFixed(2)}</p>
      <div className="details-actions">
        <button className="back-btn" onClick={() => navigate("/customerOrders")}>{"\u2190"} Back to Orders</button>
        {order.status === "pending" && (
          <button className="btn-cancel" onClick={cancel}>Cancel Order</button>
        )}
      </div>
    </div>
  );
}

export default OrderDetails;
