import "./OrderDetails.css";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getOrderDetails, cancelOrderRequest, returnOrderRequest } from "../api";
import loadingGif from "../assets/loading.gif";

const DEFAULT_RETURN_WINDOW_DAYS = 7;

function OrderDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [remaining, setRemaining] = useState(null);

  function getReturnDeadline(currentOrder) {
    if (!currentOrder?.delivered_at) return null;
    if (currentOrder.return_deadline) return new Date(currentOrder.return_deadline);
    const days = currentOrder.return_window_days || DEFAULT_RETURN_WINDOW_DAYS;
    return new Date(new Date(currentOrder.delivered_at).getTime() + days * 24 * 60 * 60 * 1000);
  }

  function canReturn(currentOrder) {
    if (!currentOrder || currentOrder.status !== "delivered") return false;
    if (typeof currentOrder.can_return === "boolean") return currentOrder.can_return;
    const deadline = getReturnDeadline(currentOrder);
    return Boolean(deadline && Date.now() <= deadline.getTime());
  }

  useEffect(() => {
    async function load() {
      const data = await getOrderDetails(id);
      setOrder(data);
      setLoading(false);
    }
    load();
  }, [id]);

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

  async function returnOrder() {
    if (!window.confirm("Return this delivered order?")) return;
    try {
      setActionLoading(true);
      const data = await returnOrderRequest(id);
      console.info(data.message);
      const updated = await getOrderDetails(id);
      setOrder(updated);
    } catch (err) {
      alert(err.message || "Failed to return order");
    } finally {
      setActionLoading(false);
    }
  }

  const renderTimeline = () => {
    const steps = [
      { key: "pending", label: "Pending" },
      { key: "dispatched", label: "Dispatched" },
      { key: "delivered", label: "Delivered" },
      { key: "returned", label: "Returned" }
    ];
    const currentIndex = steps.findIndex(s => s.key === order.status);

    return (
      <div className="timeline">
        {steps.map((step, idx) => (
          <div
            key={step.key}
            className={`timeline-step ${currentIndex >= 0 && idx <= currentIndex ? "active" : ""}`}
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
      {(order.status === "delivered" || order.status === "returned") && order.delivered_at && (
        <p>Delivered At: {new Date(order.delivered_at).toLocaleString()}</p>
      )}
      {order.status === "delivered" && (
        <p>Return By: {getReturnDeadline(order)?.toLocaleString() || "N/A"}</p>
      )}
      <p>Date: {new Date(order.createdAt || order.created_at).toLocaleString()}</p>
      <div className="items">
        {order.items.map(item => (
          <div key={item.id} className="item-row">
            <p>{item.Product.name} x {item.quantity}</p>
            <p>Rs {Number(item.price).toFixed(2)}</p>
          </div>
        ))}
      </div>
      <p className="total">Total: Rs {Number(order.total_price).toFixed(2)}</p>
      <div className="details-actions">
        <button className="back-btn" onClick={() => navigate("/customerOrders")}>Back to Orders</button>
        {order.status === "pending" && (
          <button className="btn-cancel" onClick={cancel}>Cancel Order</button>
        )}
        {order.status === "delivered" && (
          <button
            className="btn-return"
            onClick={returnOrder}
            disabled={!canReturn(order)}
            title={!canReturn(order) ? "Return window has closed" : "Return this order"}
          >
            {canReturn(order) ? "Return Order" : "Return Window Closed"}
          </button>
        )}
      </div>
    </div>
  );
}

export default OrderDetails;
