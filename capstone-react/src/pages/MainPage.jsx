import "./MainPage.css";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { getFilteredProducts, deleteProduct, updateProduct } from "../api.js";

function MainPage({ setProductId, categories,products, setProducts }) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  

  
  const [searchInput, setSearchInput] = useState("");

  
  const [searchText, setSearchText] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("default");

 
  async function fetchProducts(filters = {}) {
    setLoading(true);
    const data = await getFilteredProducts(filters);
    setProducts(data);
    setLoading(false);
  }

  
  useEffect(() => {
    fetchProducts({});
  }, []);

  
  useEffect(() => {
    fetchProducts({ search: searchText, category, sort });
  }, [category, sort]);

  
  function convertToBase64(buffer) {
    if (!buffer) return "";
    const bytes = new Uint8Array(buffer.data);
    let binary = "";
    bytes.forEach(b => (binary += String.fromCharCode(b)));
    return `data:image/jpeg;base64,${btoa(binary)}`;
  }

  
  const processedProducts = useMemo(() => {
    return products.map(p => ({
      ...p,
      imageSrc: p.image ? convertToBase64(p.image) : ""
    }));
  }, [products]);

  function editProduct(id) {
    setProductId(id);
    navigate("/addProduct");
  }

  async function deleteItem(id) {
    if (!window.confirm("Delete this product?")) return;
    await deleteProduct(id);
    fetchProducts({ search: searchText, category, sort });
  }

  async function restock(id, amount) {
    const product = products.find(p => p.id === id);
    const formData = new FormData();
    formData.set("quantity", product.quantity + amount);

    await updateProduct(id, formData);
    fetchProducts({ search: searchText, category, sort });
  }

  return (
    <>
      
      <div className="search-bar-container">
        <input
          className="search-bar"
          placeholder="Search products..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              const text = searchInput.toLowerCase();
              setSearchText(text);
              fetchProducts({ search: text, category, sort });
            }
          }}
        />

        <select onChange={e => setCategory(e.target.value)}>
          <option value="all">All</option>
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

        {!loading && processedProducts.length === 0 && (
          <h3>No products found.</h3>
        )}

        {!loading &&
          processedProducts.map(product => {
            const lowStock = product.quantity < 10;

            return (
              <div key={product.id} className="product-card">
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
