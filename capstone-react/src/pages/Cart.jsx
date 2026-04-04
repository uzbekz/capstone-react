import "./Cart.css";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCart,
  updateCartItem,
  removeCartItem,
  clearCartRequest,
  createOrder,
} from "../api";
import loadingGif from "../assets/loading.gif";
import { useSnackbar } from "../components/SnackbarProvider";

function Cart() {
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const { showSnackbar } = useSnackbar();

  const fetchCart = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getCart();
      if (data.message && !Array.isArray(data)) {
        showSnackbar(data.message || "Failed to load cart", "error");
        console.error(data.message || "Failed to load cart");
        setCart([]);
      } else {
        const items = data.map((item) => ({
          cartItemId: item.id,
          id: item.product_id,
          name: item.Product?.name || "",
          price: parseFloat(item.Product?.price || 0),
          qty: item.quantity,
          imageSrc: item.Product?.image
            ? `data:image/jpeg;base64,${item.Product.image}`
            : "",
        }));
        setCart(items);
      }
    } catch (err) {
      showSnackbar("Network error loading cart", "error");
      console.error(err);
      console.error("Network error loading cart");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCart().catch(() => navigate("/"));
  }, [navigate, fetchCart]);

  const totalPrice = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [cart]);

  async function updateQty(index, qty) {
    const item = cart[index];
    try {
      setActionLoading(true);
      const data = await updateCartItem(item.cartItemId, Number(qty));
      if (data.message && !data.id) {
        showSnackbar(data.message || "Could not update quantity", "error");
        console.error(data.message || "Could not update quantity");
      } else {
        setCart((prev) =>
          prev.map((currentItem, itemIndex) =>
            itemIndex === index ? { ...currentItem, qty: Number(qty) } : currentItem,
          ),
        );
      }
    } catch (err) {
      showSnackbar("Network error while updating your cart", "error");
      console.error(err);
      console.error("Network error");
    } finally {
      setActionLoading(false);
    }
  }

  async function removeItem(index) {
    const item = cart[index];
    try {
      setActionLoading(true);
      await removeCartItem(item.cartItemId);
      setCart((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    } catch (err) {
      showSnackbar("Network error while removing this item", "error");
      console.error(err);
      console.error("Network error");
    } finally {
      setActionLoading(false);
    }
  }

  async function clearCart() {
    try {
      setActionLoading(true);
      const data = await clearCartRequest();
      if (data.message && data.message.includes("Unable")) {
        showSnackbar(data.message, "error");
        console.error(data.message);
      }
    } catch (err) {
      showSnackbar("Network error while clearing the cart", "error");
      console.error(err);
      console.error("Network error");
    } finally {
      setActionLoading(false);
    }
    setCart([]);
  }

  async function checkout() {
    if (cart.length === 0) {
      showSnackbar("Your cart is empty.", "warning");
      console.warn("Cart is empty!");
      return;
    }

    const items = cart.map((item) => ({
      product_id: item.id,
      quantity: item.qty,
    }));

    try {
      setCheckoutLoading(true);
      await createOrder(items);
      showSnackbar("Order placed successfully.", "success");
      await clearCartRequest();
      setCart([]);
      navigate("/customerOrders");
    } catch (err) {
      showSnackbar(err.message || "Network error while checking out", "error");
      console.error(err);
      console.error("Network error while checking out");
    } finally {
      setCheckoutLoading(false);
    }
  }

  if (checkoutLoading) {
    return (
      <div className="full-page-loader">
        <img src={loadingGif} alt="Processing checkout" className="loading-gif" />
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: "24px" }}>
        <h2>Your Cart</h2>

        {loading && (
          <div className="loading-container">
            <img src={loadingGif} alt="Loading cart" className="loading-gif" />
          </div>
        )}

        {actionLoading && (
          <div className="loading-container">
            <img src={loadingGif} alt="Processing cart action" className="loading-gif" />
          </div>
        )}

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
              <div key={item.cartItemId || item.id} className="item">
                {item.imageSrc && (
                  <div className="item-image">
                    <img src={item.imageSrc} alt={item.name} />
                  </div>
                )}

                <div className="item-details">
                  <p className="item-name">{item.name}</p>
                  <p className="item-price">Rs {Number(item.price).toFixed(2)}</p>
                  <div className="item-qty-control">
                    <label
                      htmlFor={`qty-${item.id}`}
                      style={{ fontSize: "13px", color: "var(--muted)" }}
                    >
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
                      = Rs {(Number(item.price) * item.qty).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="item-actions">
                  <button className="btn-remove" onClick={() => removeItem(index)}>
                    Remove
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
                  <span className="summary-value">Rs {totalPrice.toFixed(2)}</span>
                </div>
              </div>

              <div className="summary-total">
                <span>Total</span>
                <span className="summary-value">Rs {totalPrice.toFixed(2)}</span>
              </div>

              <button className="btn-checkout" onClick={checkout}>
                Checkout
              </button>
              <button className="btn-clear" onClick={clearCart}>
                Clear Cart
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default Cart;
