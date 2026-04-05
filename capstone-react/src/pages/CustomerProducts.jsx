import "./CustomerProducts.css";
import { useNavigate } from "react-router-dom";
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

  const [loading, setLoading] = useState(true);
  const [cartByProduct, setCartByProduct] = useState({});
  const cartByProductRef = useRef({});

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("default");
  /** Per-product quantity to add when pressing + (string for controlled input while typing) */
  const [qtyToAddDraft, setQtyToAddDraft] = useState({});

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
    try {
      const data = await getCart();
      if (!Array.isArray(data)) {
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
    } catch {
      setCartByProduct({});
    }
  }

  useEffect(() => {
    loadCart();
  }, []);

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

  function getQtyToAddValue(productId) {
    return qtyToAddDraft[productId] ?? "1";
  }

  function setQtyToAddValue(productId, value) {
    setQtyToAddDraft((prev) => ({ ...prev, [productId]: value }));
  }

  function parseQtyToAdd(product, cartQty) {
    const maxAdd = Math.max(0, product.quantity - cartQty);
    if (maxAdd <= 0) return 0;
    const raw = getQtyToAddValue(product.id);
    const parsed = parseInt(String(raw).replace(/\D/g, "") || "0", 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.min(parsed, maxAdd);
  }

  async function addToCart(product, qty) {
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
    //checking
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
                      <span className="qty-stepper-in-cart" title="In your cart">
                        {cartQty}
                      </span>
                      <label className="qty-add-label">
                        <span className="qty-add-label-text">Add</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          className="qty-add-input"
                          value={getQtyToAddValue(product.id)}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "") {
                              setQtyToAddValue(product.id, "");
                              return;
                            }
                            if (/^\d+$/.test(v)) {
                              const maxAdd = Math.max(0, product.quantity - cartQty);
                              const n = parseInt(v, 10);
                              if (maxAdd <= 0) return;
                              setQtyToAddValue(
                                product.id,
                                String(Math.min(n, maxAdd)),
                              );
                            }
                          }}
                          onBlur={() => {
                            const maxAdd = Math.max(0, product.quantity - cartQty);
                            if (maxAdd <= 0) return;
                            const v = getQtyToAddValue(product.id);
                            if (v === "" || !/^\d+$/.test(v)) {
                              setQtyToAddValue(product.id, "1");
                              return;
                            }
                            const n = parseInt(v, 10);
                            setQtyToAddValue(
                              product.id,
                              String(Math.min(Math.max(1, n), maxAdd)),
                            );
                          }}
                          disabled={cartQty >= product.quantity}
                          aria-label={`Quantity of ${product.name} to add to cart`}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const n = parseQtyToAdd(product, cartQty);
                          if (n <= 0) return;
                          addToCart(product, n);
                        }}
                        disabled={cartQty >= product.quantity}
                        aria-label={`Add ${product.name} to cart`}
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
