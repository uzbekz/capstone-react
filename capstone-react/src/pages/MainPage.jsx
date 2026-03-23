import "./MainPage.css";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { deleteProduct, getProducts, updateProduct } from "../api.js";
import loadingGif from "../assets/loading.gif";

function MainPage({ setProductId, categories, products, setProducts }) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [restockedProducts, setRestockedProducts] = useState({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("default");

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      const data = await getProducts();
      setProducts(data);
      setLoading(false);
    }
    loadProducts();
  }, [setProducts]);

  const processedProducts = useMemo(() => {
    return products.map((p) => ({
      ...p,
      imageSrc: p.image
        ? (() => {
            const bytes = new Uint8Array(p.image.data);
            let binary = "";
            bytes.forEach((b) => (binary += String.fromCharCode(b)));
            return `data:image/jpeg;base64,${btoa(binary)}`;
          })()
        : "",
    }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    let filtered = [...processedProducts];

    if (search) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.category.toLowerCase().includes(search),
      );
    }

    if (category !== "all") {
      filtered = filtered.filter((p) => p.category === category);
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
    try {
      setActionLoadingId(id);
      await deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete product: " + (err.message || "Unknown error"));
    } finally {
      setActionLoadingId(null);
    }
  }

  async function restock(id, amount) {
    const product = products.find((p) => p.id === id);
    if (!product) return;

    const newQuantity = Number(product.quantity) + amount;
    const shouldUseGridLoader = amount >= 100;

    try {
      setActionLoadingId(id);
      if (shouldUseGridLoader) setGridLoading(true);
      await updateProduct(id, { quantity: newQuantity });
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, quantity: newQuantity } : p)),
      );
      setRestockedProducts((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setRestockedProducts((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 2200);
    } catch (err) {
      console.error("Failed to restock product: " + (err.message || "Unknown error"));
    } finally {
      if (shouldUseGridLoader) setGridLoading(false);
      setActionLoadingId(null);
    }
  }

  return (
    <>
      <div className="search-bar-container">
        <input
          className="search-bar"
          placeholder="Search products..."
          onChange={(e) => setSearch(e.target.value.toLowerCase())}
        />

        <select onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select onChange={(e) => setSort(e.target.value)}>
          <option value="default">Sort By</option>
          <option value="price-low-to-high">Price low-high</option>
          <option value="price-high-to-low">Price high-low</option>
          <option value="quantity-low-to-high">Qty low-high</option>
          <option value="quantity-high-to-low">Qty high-low</option>
        </select>
      </div>

      {gridLoading ? (
        <div className="content-loader">
          <img src={loadingGif} alt="Updating product stock" className="loading-gif" />
        </div>
      ) : (
        <div className="product-array">
          {loading && (
            <div className="loading-container">
              <img src={loadingGif} alt="Loading products" className="loading-gif" />
            </div>
          )}

          {!loading && filteredProducts.length === 0 && <h3>No products found.</h3>}

          {!loading &&
            filteredProducts.map((product) => {
              const lowStock = product.quantity < 10;

              return (
                <div
                  key={product.id}
                  className="product-card"
                  style={{ borderColor: lowStock ? "red" : "#ccc" }}
                >
                  {lowStock && <p style={{ color: "red" }}>Low Stock</p>}

                  <img
                    src={product.imageSrc}
                    alt={product.name}
                    width={300}
                    height={300}
                    style={{ objectFit: "cover" }}
                  />

                  <h3 className="product-title">{product.name}</h3>
                  <p className="product-description">{product.description}</p>

                  <div className="product-details">
                    <p>Category: {product.category}</p>
                    <p className="product-price">Price: Rs {product.price}</p>
                    <p className={restockedProducts[product.id] ? "qty-restocked" : ""}>
                      Qty: {product.quantity}
                    </p>
                    <p>Weight: {product.weight}</p>
                  </div>

                  <button onClick={() => editProduct(product.id)}>Edit</button>
                  <button onClick={() => deleteItem(product.id)} disabled={actionLoadingId === product.id}>
                    {actionLoadingId === product.id ? "Deleting..." : "Delete"}
                  </button>
                  <button onClick={() => restock(product.id, 100)} disabled={actionLoadingId === product.id}>
                    {actionLoadingId === product.id ? "Updating..." : "+100"}
                  </button>
                </div>
              );
            })}
        </div>
      )}
    </>
  );
}

export default MainPage;
