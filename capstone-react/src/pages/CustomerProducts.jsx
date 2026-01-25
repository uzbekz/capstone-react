import "./CustomerProducts.css";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { getProducts } from "../api";

function CustomerProducts({ products, setProducts, categories }) {
  const navigate = useNavigate();

  const token = localStorage.getItem("token");

  const [loading, setLoading] = useState(true);

  // UI filters
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("default");

  // 🔐 Auth guard
  useEffect(() => {
    if (!token) navigate("/");
  }, [token, navigate]);

  // 📦 Initial load
  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      const data = await getProducts();
      setProducts(data);
      setLoading(false);
    }
    loadProducts();
  }, [setProducts]);

  // 🖼 Base64 conversion — ONLY when products change
  const processedProducts = useMemo(() => {
    return products.map(p => ({
      ...p,
      imageSrc: p.image
        ? (() => {
            const bytes = new Uint8Array(p.image.data);
            let binary = "";
            bytes.forEach(b => (binary += String.fromCharCode(b)));
            return `data:image/jpeg;base64,${btoa(binary)}`;
          })()
        : ""
    }));
  }, [products]);

  // 🔍 Filtering (cheap, client-side)
  const filteredProducts = useMemo(() => {
    let filtered = [...processedProducts];

    if (search) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search)
      );
    }

    if (category !== "all") {
      filtered = filtered.filter(p => p.category === category);
    }

    if (sort === "price-low-to-high") filtered.sort((a, b) => a.price - b.price);
    if (sort === "price-high-to-low") filtered.sort((a, b) => b.price - a.price);
    if (sort === "quantity-low-to-high") filtered.sort((a, b) => a.quantity - b.quantity);
    if (sort === "quantity-high-to-low") filtered.sort((a, b) => b.quantity - a.quantity);

    return filtered;
  }, [processedProducts, search, category, sort]);

  // 🛒 Cart logic (unchanged, but React-safe)
  function addToCart(product, qty) {
    let cart = JSON.parse(localStorage.getItem("cart")) || [];

    const existing = cart.find(item => item.id === product.id);

    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        qty
      });
    }

    localStorage.setItem("cart", JSON.stringify(cart));
    alert("Added to cart!");
  }

  return (
    <>
      {/* 🔧 Toolbar */}
      <div className="toolbar">
        <input
          className="search-bar"
          placeholder="Search products..."
          onChange={e => setSearch(e.target.value.toLowerCase())}
        />

        <select onChange={e => setCategory(e.target.value)}>
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <select onChange={e => setSort(e.target.value)}>
          <option value="default">Sort By</option>
          <option value="price-high-to-low">Price (high to low)</option>
          <option value="price-low-to-high">Price (low to high)</option>
          <option value="quantity-high-to-low">Quantity (high to low)</option>
          <option value="quantity-low-to-high">Quantity (low to high)</option>
        </select>

        <Link to="/cart">🛒 Cart</Link>
        <Link to="/customerOrders">Order History</Link>

        <button
          onClick={() => {
            localStorage.clear();
            navigate("/");
          }}
        >
          Logout
        </button>
      </div>

      {/* 📦 Products */}
      <div className="product-array">
        {loading && <h3>Loading products...</h3>}

        {!loading && filteredProducts.length === 0 && (
          <h3>No products found.</h3>
        )}

        {!loading &&
          filteredProducts.map(product => {
            const lowStock = product.quantity < 10;

            return (
              <div
                key={product.id}
                className="product-card"
                style={{ borderColor: lowStock ? "red" : "#ccc" }}
              >
                {lowStock && <p style={{ color: "red" }}>⚠ Low Stock</p>}

                <img
                  src={product.imageSrc}
                  width={300}
                  height={300}
                  style={{ objectFit: "cover" }}
                  alt={product.name}
                />

                <p><b>{product.name}</b></p>
                <p>{product.description}</p>
                <p>Category: {product.category}</p>
                <p>Price: ${product.price}</p>
                <p>Stock: {product.quantity}</p>

                <input
                  type="number"
                  min="1"
                  max={product.quantity}
                  defaultValue="1"
                  id={`qty-${product.id}`}
                />

                <button
                  onClick={() => {
                    const qty = Number(
                      document.getElementById(`qty-${product.id}`).value
                    );
                    addToCart(product, qty);
                  }}
                >
                  Add to Cart
                </button>
              </div>
            );
          })}
      </div>
    </>
  );
}

export default CustomerProducts;
