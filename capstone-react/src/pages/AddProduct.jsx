import {useState, useEffect} from 'react'
import {Link} from 'react-router-dom'
import './AddProduct.css'
import {useNavigate} from 'react-router'
import { getProductById , getProducts, addProduct} from '../api'

function AddProduct({ productId , setProductId, categories, setCategories}) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [customCategory,setCustomCategory] = useState('')
  const [existingCategory, setExistingCategory] = useState('')
  const [price, setPrice] = useState(null)
  const [quantity, setQuantity] = useState(null)
  const [weight, setWeight] = useState(null)
  const [image, setImage] = useState(null)
  

  useEffect(() => {
    async function getAProduct(){
      if(productId){
        const product = await getProductById(productId);
        setName(product.name)
        setDescription(product.description)
        setExistingCategory(product.category)
        setPrice(product.price)
        setQuantity(product.quantity)
        setWeight(product.weight)
        setImage(product.image)
      }
    }
    async function fetchCategories(){
      const products = await getProducts()
      const categories = [...new Set(products.map(p => p.category))]
      setCategories(categories)
    }
    getAProduct()
    fetchCategories()
  },[productId, setCategories])

  async function handleSubmit(event) {
    event.preventDefault();

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("price", price);
    formData.append("quantity", quantity);
    formData.append("weight", weight);
    if (image) formData.append("image", image);

    const finalCategory = customCategory?.trim() ? customCategory : existingCategory;
    formData.append("category", finalCategory);

    await addProduct(formData);

    setProductId(null);
    navigate('/mainPage');
  }

  return (
    <>
      <div class="form-container">
        <h2>{ productId ? <span>Edit Product</span> : <span>Add New Product</span>}</h2>
        <form
          enctype="multipart/form-data"
          class="add-product-form"
          onSubmit={handleSubmit}
        >
          <div class="form-group">
            <label for="name">Product Name</label>
            <input 
              type="text" 
              id="name" 
              name="name" 
              value = {name}
              onChange={(e) => setName(e.target.value)} 
              required 
            />
          </div>

          <div class="form-group">
            <label for="description">Description</label>
            <textarea 
              id="description" 
              name="description" 
              rows="4"
              value = {description}
              onChange={(e) => setDescription(e.target.value)}
              required 
            ></textarea>
          </div>

          <div class="form-group">
            <label>New Category</label>
            <input 
              type="text" 
              id="customCategory" 
              name="customCategory"
              value = {customCategory}
              onChange={(e) => setCustomCategory(e.target.value)} 
            />
          </div>

          <div class="form-group">
            <label>Existing Category</label>
            <select 
              class="existing-category" 
              name="existingCategory"
              value={existingCategory}
              onChange={(e) => setExistingCategory(e.target.value)}
              required
            >
              {categories.map((category) => {
                return(
                  <option key={category} value={category}>{category}</option>
                )
              })}
            </select>
          </div>

          <div class="form-group">
            <label for="price">Price</label>
            <input
              type="number"
              id="price"
              name="price"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>

          <div class="form-group">
            <label for="quantity">Quantity</label>
            <input
              type="number"
              id="quantity"
              name="quantity"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>

          <div class="form-group">
            <label for="weight">Weight (kg/lbs)</label>
            <input 
              type="number" 
              id="weight" 
              name="weight" 
              step="any"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              required 
            />
          </div>

          <div class="form-group">
            <label for="image">Product Image</label>
            <input 
              type="file" 
              id="image" 
              name="image" 
              accept="image/*" 
              value={image}
              onChange={(e) => setImage(e.target.files[0])}
              required
            />
          </div>

          <button type="submit">Submit Product</button>
        </form>
        <div class="form-footer">
          <Link to="/mainPage">Go To Main Page</Link>
        </div>
      </div>
    </>
  );
}
export default AddProduct;
