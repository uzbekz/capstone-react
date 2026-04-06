import "./Wishlist.css";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getWishlist, removeWishlistItem } from "../api";
import loadingGif from "../assets/loading.gif";
import { useSnackbar } from "../components/SnackbarProvider";

// Helper function for Indian currency formatting
function formatIndianPrice(price) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

function Wishlist() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showSnackbar } = useSnackbar();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWishlist();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      showSnackbar("Could not load wishlist.", "error");
      navigate("/customerProducts");
    } finally {
      setLoading(false);
    }
  }, [navigate, showSnackbar]);

  useEffect(() => {
    load();
  }, [load]);

  function imageSrc(p) {
    if (!p?.image) return "";
    const bytes = new Uint8Array(p.image.data);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return `data:image/jpeg;base64,${btoa(binary)}`;
  }

  async function remove(id) {
    try {
      await removeWishlistItem(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
      showSnackbar("Removed from wishlist.", "success");
    } catch {
      showSnackbar("Could not remove item.", "error");
    }
  }

  if (loading) {
    return (
      <div className="wishlist-page">
        <div className="wishlist-loading">
          <img src={loadingGif} alt="" className="loading-gif" />
        </div>
      </div>
    );
  }

  return (
    <div className="wishlist-page">
      <h1>Wishlist</h1>
      {items.length === 0 ? (
        <p className="wishlist-empty">No saved items yet. Add hearts from the products page.</p>
      ) : (
        <div className="wishlist-grid">
          {items.map((p) => (
            <div key={p.id} className="wishlist-card">
              {imageSrc(p) ? (
                <img src={imageSrc(p)} alt={p.name} className="wishlist-img" />
              ) : (
                <div className="wishlist-img-fallback">No image</div>
              )}
              <div className="wishlist-card-body">
                <h3>{p.name}</h3>
                <p className="wishlist-price">{formatIndianPrice(Number(p.price))}</p>
                <p>Start browsing products to see your wishlist here!</p>
                <button type="button" className="wishlist-remove" onClick={() => remove(p.id)}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Wishlist;
