import "./Cart.css";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCart,
  updateCartItem,
  removeCartItem,
  clearCartRequest,
  createOrder,
  getPublicSettings,
} from "../api";
import { useSnackbar } from "../components/SnackbarProvider";
import loadingGif from "../assets/loading.gif";

function Cart() {
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [shippingCharge, setShippingCharge] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const { showSnackbar } = useSnackbar();
  const debounceTimers = useRef({});

// Helper function for Indian currency formatting
function formatIndianPrice(price) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

  const fetchCart = useCallback(async () => {
    try {
      // Only set loading to true on initial load
      if (cart.length === 0) {
        setLoading(true);
      }
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
          imageSrc: item.Product?.image_url || "",
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
    getPublicSettings()
      .then((s) => {
        setShippingCharge(s?.shipping_charge != null ? Number(s.shipping_charge) : 0);
      })
      .catch(() => {
        setShippingCharge(0); // fallback if settings unreachable, avoiding hardcoded values
      })
      .finally(() => setSettingsLoading(false));
  }, [navigate, fetchCart]);

  const totalPrice = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [cart]);

  async function updateQty(index, rawValue) {
    // Update local state immediately so the input feels responsive
    setCart((prev) =>
      prev.map((item, i) => (i === index ? { ...item, qty: rawValue } : item))
    );

    const parsed = parseInt(rawValue, 10);
    // Don't fire the API if the field is empty or invalid — wait for the user to finish typing
    if (!rawValue || isNaN(parsed) || parsed < 1) return;

    const cartItemId = cart[index].cartItemId;

    // Debounce: clear any pending call for this item and wait 600ms
    clearTimeout(debounceTimers.current[cartItemId]);
    debounceTimers.current[cartItemId] = setTimeout(async () => {
      try {
        setActionLoading(true);
        const data = await updateCartItem(cartItemId, parsed);
        if (data.message && !data.id) {
          showSnackbar(data.message || "Could not update quantity", "error");
          // Revert to last known good value from server
          await fetchCart();
        }
      } catch (err) {
        showSnackbar("Network error while updating your cart", "error");
        console.error(err);
        await fetchCart();
      } finally {
        setActionLoading(false);
      }
    }, 600);
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
      } else {
        // Re-fetch cart to show updated empty state
        await fetchCart();
      }
    } catch (err) {
      showSnackbar("Network error while clearing the cart", "error");
      console.error(err);
      console.error("Network error");
    } finally {
      setActionLoading(false);
    }
  }

  async function checkout() {
    if (cart.length === 0) {
      showSnackbar("Your cart is empty.", "warning");
      console.warn("Cart is empty!");
      return;
    }

    const invalidItems = cart.filter((item) => !item.qty || parseInt(item.qty, 10) < 1);
    if (invalidItems.length > 0) {
      const names = invalidItems.map((i) => i.name).join(", ");
      showSnackbar(`Fix quantity for: ${names}`, "error");
      return;
    }

    const items = cart.map((item) => ({
      product_id: item.id,
      quantity: parseInt(item.qty, 10),
    }));

    try {
      setCheckoutLoading(true);
      const idempotencyKey =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `ord-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await createOrder(items, {
        idempotencyKey
      });
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

        <div className="cart-container">
          {loading ? (
            <div className="loading-container cart-loading">
              <img src={loadingGif} alt="Loading cart" className="loading-gif" />
              <p>Loading your cart...</p>
            </div>
          ) : (
            <>
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
                      <p className="item-price">{formatIndianPrice(Number(item.price))}</p>
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
                          = {formatIndianPrice(Number(item.price) * item.qty)}
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
                      <span className="summary-value">{formatIndianPrice(totalPrice)}</span>
                    </div>
                    <div className="summary-row">
                      <span className="summary-label">Shipping:</span>
                      <span className="summary-value">
                        {settingsLoading ? "Loading..." : formatIndianPrice(shippingCharge)}
                      </span>
                    </div>
                  </div>

                  <div className="summary-total">
                    <span>Total</span>
                    <span className="summary-value">
                      {settingsLoading
                        ? "Calculating..."
                        : formatIndianPrice(totalPrice + shippingCharge)}
                    </span>
                  </div>

                  <button className="btn-checkout" onClick={checkout} disabled={settingsLoading}>
                    {settingsLoading ? "Loading..." : "Checkout"}
                  </button>
                  <button className="btn-clear" onClick={clearCart}>
                    Clear Cart
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default Cart;
