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
      { key: "returned", label: "Returned" },
    ];
    const currentIndex = steps.findIndex((step) => step.key === order.status);

    return (
      <div className="timeline">
        {steps.map((step, idx) => {
          const isActive = currentIndex >= 0 && idx <= currentIndex;
          const isCurrent = idx === currentIndex;
          const isConnectorActive = currentIndex > idx;

          return (
            <div
              key={step.key}
              className={`timeline-step ${isActive ? "active" : ""} ${isCurrent ? "current" : ""}`}
            >
              <div className="timeline-dot" />
              <span className="timeline-label">{step.label}</span>
              {idx < steps.length - 1 && (
                <div className={`timeline-connector ${isConnectorActive ? "active" : ""}`} />
              )}
            </div>
          );
        })}
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
    <div className="order-details-page">
      <div className="order-details">
        <div className="order-hero">
          <div>
            <p className="order-kicker">Order Details</p>
            <h2>Order #{order.id}</h2>
            <span className={`status-pill status-${order.status}`}>
              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </span>
          </div>
          <div className="order-total-card">
            <p className="meta-label">Total Amount</p>
            <p className="total">Rs {Number(order.total_price).toFixed(2)}</p>
            <p className="meta-text">
              Placed on {new Date(order.createdAt || order.created_at).toLocaleString()}
            </p>
          </div>
        </div>

        {renderTimeline()}

        <div className="order-info-grid">
          <div className="info-card">
            <p className="meta-label">Current Status</p>
            <p className="meta-value">
              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </p>
          </div>

          {order.status === "dispatched" && order.delivered_at && (
            <div className="info-card">
              <p className="meta-label">Estimated Delivery</p>
              <p className="meta-value">{new Date(order.delivered_at).toLocaleString()}</p>
            </div>
          )}

          {remaining !== null && remaining > 0 && (
            <div className="info-card">
              <p className="meta-label">Arriving In</p>
              <p className="meta-value eta">
                {Math.floor(remaining / 60000)}m {Math.floor((remaining % 60000) / 1000)}s
              </p>
            </div>
          )}

          {(order.status === "delivered" || order.status === "returned") && order.delivered_at && (
            <div className="info-card">
              <p className="meta-label">Delivered At</p>
              <p className="meta-value">{new Date(order.delivered_at).toLocaleString()}</p>
            </div>
          )}

          {order.status === "delivered" && (
            <div className="info-card">
              <p className="meta-label">Return By</p>
              <p className="meta-value">{getReturnDeadline(order)?.toLocaleString() || "N/A"}</p>
            </div>
          )}
        </div>

        <div className="items-panel">
          <h3>Items</h3>
          <div className="items">
            {order.items.map((item) => (
              <div key={item.id} className="item-row">
                <div className="item-main">
                  <p className="item-name">{item.Product.name}</p>
                  <p className="item-qty">Qty {item.quantity}</p>
                </div>
                <p className="item-price">Rs {Number(item.price).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="details-actions">
          {order.status === "pending" && (
            <button className="btn-cancel" onClick={cancel}>
              Cancel Order
            </button>
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
    </div>
  );
}

export default OrderDetails;
