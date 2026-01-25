import "./Cart.css";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function Cart() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  // ✅ Initialize from localStorage (KEY FIX)
  const [cart, setCart] = useState(() => {
    return JSON.parse(localStorage.getItem("cart")) || [];
  });

  // 🔐 Auth guard
  useEffect(() => {
    if (!token) navigate("/");
  }, [token, navigate]);

  // 💾 Persist cart changes
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cart));
  }, [cart]);

  // 💰 Total price
  const totalPrice = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }, [cart]);

  function updateQty(index, qty) {
    setCart(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, qty: Number(qty) } : item
      )
    );
  }

  function removeItem(index) {
    setCart(prev => prev.filter((_, i) => i !== index));
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

    const items = cart.map(item => ({
      product_id: item.id,
      quantity: item.qty
    }));

    const res = await fetch("http://localhost:5000/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ items })
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
      <h2>Your Cart</h2>

      <div className="cart-container">
        {cart.length === 0 && <p>Your cart is empty.</p>}

        {cart.map((item, index) => (
          <div key={item.id} className="item">
            <p><b>{item.name}</b></p>
            <p>Price: ${item.price}</p>

            <input
              type="number"
              min="1"
              value={item.qty}
              onChange={e => updateQty(index, e.target.value)}
            />

            <button onClick={() => removeItem(index)}>Remove</button>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <h3>Total: ${totalPrice.toFixed(2)}</h3>
      )}

      <button onClick={checkout}>Checkout</button>
      <button onClick={clearCart}>Clear Cart</button>

      <br /><br />
      <Link to="/customerProducts">⬅ Back to Products</Link>
    </>
  );
}

export default Cart;
