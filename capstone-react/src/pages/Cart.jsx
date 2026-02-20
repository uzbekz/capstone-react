import "./Cart.css";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function Cart() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  
  const [cart, setCart] = useState(() => {
    return JSON.parse(localStorage.getItem("cart")) || [];
  });

  
  useEffect(() => {
    if (!token) navigate("/");
  }, [token, navigate]);

  
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cart));
  }, [cart]);

  
  const totalPrice = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [cart]);

  function updateQty(index, qty) {
    setCart((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, qty: Number(qty) } : item,
      ),
    );
  }

  function removeItem(index) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function clearCart() {
    localStorage.removeItem("cart");
    setCart([]);
  }

  async function checkout() {
    if (cart.length === 0) {
      alert("Cart is empty!");
      return;
    }

    const items = cart.map((item) => ({
      product_id: item.id,
      quantity: item.qty,
    }));

    const res = await fetch("http://localhost:5000/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ items }),
    });

    const data = await res.json();

    if (res.ok) {
      alert("Order placed successfully!");
      localStorage.removeItem("cart");
      setCart([]);
      navigate("/customerOrders");
    } else {
      alert(data.message);
    }
  }

  return (
    <>
      <div style={{ padding: "24px" }}>
        <h2>🛒 Your Cart</h2>

        <div className="cart-container">
          <div className="cart-items">
            {cart.length === 0 && (
              <div className="empty-state">
                <p>Your cart is empty.</p>
                <p style={{ fontSize: "14px", marginTop: "8px" }}>
                  Add some products to get started!
                </p>
              </div>
            )}

            {cart.map((item, index) => (
              <div key={item.id} className="item">
                {item.imageSrc && (
                  <div className="item-image">
                    <img src={item.imageSrc} alt={item.name} />
                  </div>
                )}

                <div className="item-details">
                  <p className="item-name">{item.name}</p>
                  <p className="item-price">${Number(item.price).toFixed(2)}</p>
                  <div className="item-qty-control">
                    <label htmlFor={`qty-${item.id}`} style={{ fontSize: "13px", color: "var(--muted)" }}>
                      Qty:
                    </label>
                    <input
                      id={`qty-${item.id}`}
                      type="number"
                      min="1"
                      value={item.qty}
                      onChange={(e) => updateQty(index, e.target.value)}
                    />
                    <span style={{ fontSize: "13px", color: "var(--muted)" }}>
                      = ${(Number(item.price) * item.qty).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="item-actions">
                  <button
                    className="btn-remove"
                    onClick={() => removeItem(index)}
                  >
                    ✕ Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {cart.length > 0 && (
            <div className="cart-summary">
              <div className="summary-section">
                <div className="summary-row">
                  <span className="summary-label">Items:</span>
                  <span className="summary-value">{cart.length}</span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">Subtotal:</span>
                  <span className="summary-value">${totalPrice.toFixed(2)}</span>
                </div>
              </div>

              <div className="summary-total">
                <span>Total</span>
                <span className="summary-value">${totalPrice.toFixed(2)}</span>
              </div>

              <button className="btn-checkout" onClick={checkout}>
                ✓ Checkout
              </button>
              <button className="btn-clear" onClick={clearCart}>
                🗑 Clear Cart
              </button>
            </div>
          )}
        </div>

        <Link to="/customerProducts" className="back-link">
          ⬅ Back to Products
        </Link>
      </div>
    </>
  );
}

export default Cart;
