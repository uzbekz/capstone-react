import "./CustomerProducts.css";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getProducts,
  addToCartRequest,
  getCart,
  updateCartItem,
  removeCartItem,
} from "../api";
import loadingGif from "../assets/loading.gif";

function CustomerProducts({ products, setProducts, categories }) {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [loading, setLoading] = useState(true);
  const [cartByProduct, setCartByProduct] = useState({});
  const cartByProductRef = useRef({});

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("default");

  useEffect(() => {
    if (!token) navigate("/");
  }, [token, navigate]);

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      const data = await getProducts();
      setProducts(data);
      setLoading(false);
    }
    loadProducts();
  }, [setProducts]);

  async function loadCart() {
    if (!token) {
      setCartByProduct({});
      return;
    }

    const data = await getCart();
    if (data.message && !Array.isArray(data)) {
      setCartByProduct({});
      return;
    }

    const mapped = data.reduce((acc, item) => {
      acc[item.product_id] = {
        cartItemId: item.id,
        quantity: item.quantity,
      };
      return acc;
    }, {});

    setCartByProduct(mapped);
  }

  useEffect(() => {
    loadCart();
  }, [token]);

  useEffect(() => {
    cartByProductRef.current = cartByProduct;
  }, [cartByProduct]);

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

  async function addToCart(product, qty) {
    if (!token) {
      console.warn("Please login to add items to your cart");
      return;
    }

    const currentEntry = cartByProductRef.current[product.id];
    const currentQty = currentEntry?.quantity || 0;
    const increment = Math.min(qty, Math.max(0, product.quantity - currentQty));
    if (increment <= 0) return;

    setCartByProduct((prev) => {
      const existing = prev[product.id];
      return {
        ...prev,
        [product.id]: {
          cartItemId: existing?.cartItemId,
          quantity: (existing?.quantity || 0) + increment,
        },
      };
    });

    try {
      const data = await addToCartRequest(product.id, increment);
      if (data.id) {
        const latestEntry = cartByProductRef.current[product.id];

        if (!latestEntry || latestEntry.quantity <= 0) {
          await removeCartItem(data.id);
          return;
        }

        setCartByProduct((prev) => {
          const existing = prev[product.id];
          if (!existing) return prev;
          return {
            ...prev,
            [product.id]: {
              ...existing,
              cartItemId: existing.cartItemId || data.id,
            },
          };
        });

        if (
          typeof data.quantity === "number" &&
          latestEntry.quantity !== data.quantity
        ) {
          await updateCartItem(data.id, latestEntry.quantity);
        }
      } else {
        console.error(data.message || "Unable to add to cart");
        setCartByProduct((prev) => {
          const existing = prev[product.id];
          const nextQty = Math.max(0, (existing?.quantity || 0) - increment);
          if (nextQty <= 0) {
            const { [product.id]: _removed, ...rest } = prev;
            return rest;
          }
          return {
            ...prev,
            [product.id]: {
              cartItemId: existing?.cartItemId,
              quantity: nextQty,
            },
          };
        });
      }
    } catch (err) {
      console.error(err);
      console.error("Network error while adding to cart");
      setCartByProduct((prev) => {
        const existing = prev[product.id];
        const nextQty = Math.max(0, (existing?.quantity || 0) - increment);
        if (nextQty <= 0) {
          const { [product.id]: _removed, ...rest } = prev;
          return rest;
        }
        return {
          ...prev,
          [product.id]: {
            cartItemId: existing?.cartItemId,
            quantity: nextQty,
          },
        };
      });
    }
  }

  async function decrementCartItem(product) {
    if (!token) {
      console.warn("Please login to edit your cart");
      return;
    }

    const existing = cartByProductRef.current[product.id];
    if (!existing || existing.quantity <= 0) return;

    const nextQty = existing.quantity - 1;
    setCartByProduct((prev) => {
      const latest = prev[product.id];
      if (!latest) return prev;
      if (nextQty <= 0) {
        const { [product.id]: _removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [product.id]: {
          cartItemId: latest.cartItemId,
          quantity: nextQty,
        },
      };
    });

    if (!existing.cartItemId) return;

    try {
      if (nextQty === 0) {
        await removeCartItem(existing.cartItemId);
      } else {
        await updateCartItem(existing.cartItemId, nextQty);
      }
    } catch (err) {
      console.error(err);
      console.error("Network error while updating cart");
      setCartByProduct((prev) => {
        const latest = prev[product.id];
        return {
          ...prev,
          [product.id]: {
            cartItemId: latest?.cartItemId || existing.cartItemId,
            quantity: (latest?.quantity || 0) + 1,
          },
        };
      });
    }
  }

  const cartCount = useMemo(() => {
    return Object.values(cartByProduct).reduce((sum, item) => sum + item.quantity, 0);
  }, [cartByProduct]);

  return (
    <>
      <div className="toolbar">
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
          <option value="price-high-to-low">Price (high to low)</option>
          <option value="price-low-to-high">Price (low to high)</option>
          <option value="quantity-high-to-low">Quantity (high to low)</option>
          <option value="quantity-low-to-high">Quantity (low to high)</option>
        </select>

        <Link to="/cart" className="cart-link">
          Cart ({cartCount})
        </Link>
        <Link to="/customerOrders">Order History</Link>
        <Link to="/profile">Profile</Link>

        <button
          onClick={() => {
            localStorage.removeItem("token");
            navigate("/");
          }}
        >
          Logout
        </button>
      </div>

      <div className="product-array">
        {loading && (
          <div className="loading-container">
            <img src={loadingGif} alt="Loading products" className="loading-gif" />
          </div>
        )}

        {!loading && filteredProducts.length === 0 && <h3>No products found.</h3>}

        {!loading &&
          filteredProducts.map((product) => {
            const cartQty = cartByProduct[product.id]?.quantity || 0;

            return (
              <div key={product.id} className="product-card">
                {product.imageSrc ? (
                  <img src={product.imageSrc} alt={product.name} />
                ) : (
                  <div className="product-image-fallback">No Image</div>
                )}

                <div className="product-content">
                  <div className="product-header-row">
                    <h3 className="product-title">{product.name}</h3>
                    <p className="product-price">₹{Number(product.price).toFixed(2)}</p>
                  </div>

                  <p className="product-category">{product.category}</p>

                  <div className="product-bottom-row">
                    <p className="stock">
                      Stock: <strong>{product.quantity}</strong>
                    </p>

                    <div className="qty-stepper">
                      <button
                        type="button"
                        onClick={() => decrementCartItem(product)}
                        disabled={cartQty <= 0}
                        aria-label={`Decrease ${product.name}`}
                      >
                        -
                      </button>
                      <span>{cartQty}</span>
                      <button
                        type="button"
                        onClick={() => addToCart(product, 1)}
                        disabled={cartQty >= product.quantity}
                        aria-label={`Increase ${product.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
}

export default CustomerProducts;
