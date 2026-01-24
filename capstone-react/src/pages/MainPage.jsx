import "./MainPage.css";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { getProducts, deleteProduct, updateProduct } from "../api.js";

function MainPage({ setProductId, categories }) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [allProducts, setAllProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("default");

  
  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      const data = await getProducts();
      setAllProducts(data);
      setProducts(data);
      setLoading(false);
    }
    loadProducts();
  }, []);

  
  useEffect(() => {
    let filtered = [...allProducts];

    
    if (searchText) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchText) ||
        p.category.toLowerCase().includes(searchText)
      );
    }

    // Category
    if (category !== "all") {
      filtered = filtered.filter(p => p.category === category);
    }

    // Sort
    if (sort === "price-low-to-high") filtered.sort((a, b) => a.price - b.price);
    if (sort === "price-high-to-low") filtered.sort((a, b) => b.price - a.price);
    if (sort === "quantity-low-to-high") filtered.sort((a, b) => a.quantity - b.quantity);
    if (sort === "quantity-high-to-low") filtered.sort((a, b) => b.quantity - a.quantity);

    setProducts(filtered);
  }, [searchText, category, sort, allProducts]);

  
  function convertToBase64(buffer) {
    if (!buffer) return "";
    const bytes = new Uint8Array(buffer.data);
    let binary = "";
    bytes.forEach(b => (binary += String.fromCharCode(b)));
    return `data:image/jpeg;base64,${btoa(binary)}`;
  }

  
  function editProduct(id) {
    setProductId(id);
    navigate("/addProduct");
  }

  
  async function deleteItem(id) {
    if (!window.confirm("Delete this product?")) return;

    await deleteProduct(id);
    const updated = allProducts.filter(p => p.id !== id);
    setAllProducts(updated);
  }

  
  async function restock(id, amount) {
    const product = allProducts.find(p => p.id === id);
    const formData = new FormData();
    formData.set("quantity", product.quantity + amount);

    await updateProduct(id, formData);

    setAllProducts(prev =>
      prev.map(p =>
        p.id === id
          ? { ...p, quantity: p.quantity + amount }
          : p
      )
    );
  }

  return (
    <>
      
      <div className="search-bar-container">
        <input
          type="text"
          className="search-bar"
          placeholder="Search products..."
          onChange={(e) => setSearchText(e.target.value.toLowerCase())}
        />

        <select
          className="category-filter"
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">All</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <select
          className="sort-filter"
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="default">Sort By</option>
          <option value="price-high-to-low">Price (high to low)</option>
          <option value="price-low-to-high">Price (low to high)</option>
          <option value="quantity-high-to-low">Quantity (high to low)</option>
          <option value="quantity-low-to-high">Quantity (low to high)</option>
        </select>

        <Link to="/adminOrders">Manage Orders</Link>
        <Link to="/addProduct">Add product</Link>
        <Link to="/dashboard">View Dashboard</Link>

        <button
          onClick={() => {
            localStorage.clear();
            navigate("/login");
          }}
        >
          Logout
        </button>
      </div>

      
      <div className="product-array">
        {loading && (
          <div className="loading">
            <h3>Loading products...</h3>
          </div>
        )}

        {!loading && products.length === 0 && (
          <div className="empty-state">
            <h3>No products found.</h3>
          </div>
        )}

        {products.map(product => {
          const imageSrc = convertToBase64(product.image);
          const lowStock = product.quantity < 10;

          return (
            <div key={product.id} className="product-card">
              {lowStock && <p style={{ color: "red" }}>⚠ Low Stock</p>}

              <img
                src={imageSrc}
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

              <div style={{ marginTop: "10px" }}>
                <button onClick={() => restock(product.id, 100)}>+100</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default MainPage;
