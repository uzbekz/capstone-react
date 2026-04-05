import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./AddProduct.css";
import { getProductById, addProduct, updateProduct } from "../api";
import loadingGif from "../assets/loading.gif";
import { useSnackbar } from "../components/SnackbarProvider";

function AddProduct({ productId, setProductId, categories }) {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [existingCategory, setExistingCategory] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [weight, setWeight] = useState("");
  const [image, setImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showSnackbar } = useSnackbar();

  useEffect(() => {
    async function loadProduct() {
      if (!productId) {
        if (categories.length > 0) {
          setExistingCategory(categories[0]);
        }
        return;
      }

      const product = await getProductById(productId);

      setName(product.name ?? "");
      setDescription(product.description ?? "");
      setExistingCategory(product.category ?? "");
      setPrice(String(product.price ?? ""));
      setQuantity(String(product.quantity ?? ""));
      setWeight(String(product.weight ?? ""));
    }

    loadProduct();
  }, [productId, categories]);

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);

    const finalCategory =
      customCategory.trim() !== "" ? customCategory : existingCategory;

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("category", finalCategory);
    formData.append("price", price);
    formData.append("quantity", quantity);
    formData.append("weight", weight);

    if (image) {
      formData.append("image", image);
    }

    try {
      if (productId) {
        await updateProduct(productId, formData);
        showSnackbar("Product updated successfully.", "success");
      } else {
        await addProduct(formData);
        showSnackbar("Product added successfully.", "success");
      }
      setProductId(null);
      navigate("/mainPage");
    } catch (err) {
      showSnackbar(err.message || "Failed to save product", "error");
      console.error("Error: " + (err.message || "Failed to save product"));
      setIsSubmitting(false);
    }
  }

  return (
    <div className="add-product-container">
      <div className="form-container">
        {isSubmitting ? (
          <div className="submit-loading-container">
            <img
              src={loadingGif}
              alt="Saving product"
              className="submit-loading-gif"
            />
            <p>Saving product...</p>
          </div>
        ) : (
          <>
            <p className="add-product-kicker">Products &rsaquo; Catalog</p>
            <h2>{productId ? "Edit Product" : "Add New Product"}</h2>
            <p className="add-product-copy">
              {productId
                ? "Update product details, stock information, and image from a single place."
                : "Create a new catalog item with pricing, quantity, category, and product image."}
            </p>

            <form
              className="add-product-form"
              onSubmit={handleSubmit}
              encType="multipart/form-data"
            >
              <div className="form-grid">
              <div className="form-group">
                <label>Product Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows="4"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>New Category</label>
                <input
                  type="text"
                  value={customCategory}
                  onChange={e => setCustomCategory(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Existing Category</label>
                <select
                  value={existingCategory}
                  onChange={e => setExistingCategory(e.target.value)}
                >
                  <option value="" disabled>
                    Select category
                  </option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Price</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  min="0"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Weight (kg/lbs)</label>
                <input
                  type="number"
                  step="any"
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Product Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setImage(e.target.files[0])}
                />
              </div>
              </div>

              <button type="submit">
                {productId ? "Update Product" : "Add Product"}
              </button>
            </form>

          </>
        )}
      </div>
    </div>
  );
}

export default AddProduct;
