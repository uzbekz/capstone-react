import "./MainPage.css";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { getProducts } from "../api.js";

function MainPage({ setProductId, categories, products, setProducts }) {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("default");

  // Load products once on mount
  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      const data = await getProducts();
      setProducts(data);
      setLoading(false);
    }
    loadProducts();
  }, [setProducts]);

  // Convert buffer to base64
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

  // Filter and sort instantly
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

  function editProduct(id) {
    setProductId(id);
    navigate("/addProduct");
  }

  async function deleteItem(id) {
    if (!window.confirm("Delete this product?")) return;
    setProducts(products.filter(p => p.id !== id));
  }

  async function restock(id, amount) {
    const product = products.find(p => p.id === id);
    if (product) {
      const updatedProducts = products.map(p =>
        p.id === id ? { ...p, quantity: p.quantity + amount } : p
      );
      setProducts(updatedProducts);
    }
  }

  return (
    <>
      <div className="search-bar-container">
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
          <option value="price-low-to-high">Price ↑</option>
          <option value="price-high-to-low">Price ↓</option>
          <option value="quantity-low-to-high">Qty ↑</option>
          <option value="quantity-high-to-low">Qty ↓</option>
        </select>

        <Link to="/adminOrders">Manage Orders</Link>
        <Link to="/addProduct">Add Product</Link>
        <Link to="/dashboard">Dashboard</Link>

        <button
          onClick={() => {
            localStorage.clear();
            navigate("/");
          }}
        >
          Logout
        </button>
      </div>

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
                  alt={product.name}
                  width={300}
                  height={300}
                  style={{ objectFit: "cover" }}
                />

                <p><b>{product.name}</b></p>
                <p>{product.description}</p>
                <p>Category: {product.category}</p>
                <p>Price: ${product.price}</p>
                <p>Qty: {product.quantity}</p>

                <button onClick={() => editProduct(product.id)}>Edit</button>
                <button onClick={() => deleteItem(product.id)}>Delete</button>
                <button onClick={() => restock(product.id, 100)}>+100</button>
              </div>
            );
          })}
      </div>
    </>
  );
}

export default MainPage;
