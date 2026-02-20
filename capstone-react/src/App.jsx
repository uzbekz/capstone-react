import Login from "./pages/Login"
import Register from "./pages/Register"
import {Routes, Route} from 'react-router-dom'
import { useEffect, useState } from "react"
import MainPage from "./pages/MainPage"
import AddProduct from "./pages/AddProduct"
import { getProducts } from "./api"
import Dashboard from './pages/DashBoard.jsx'
import AdminOrders from './pages/AdminOrders.jsx'
import CustomerProducts from './pages/CustomerProducts.jsx'
import Cart from './pages/Cart.jsx'
import CustomerOrders from './pages/CustomerOrders.jsx'

function App() {
  const [productId, setProductId] = useState(null)
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  useEffect(() => {
    async function fetchCategories(){
      const products = await getProducts()
      const categories = [...new Set(products.map(p => p.category))]
      setCategories(categories)
    }
    fetchCategories()
  }, [])
  
  return (
    <>
      <Routes>
        <Route path="/" element={<Login/>}/>
        <Route path="/register" element={<Register />}/>
        <Route path="/mainPage" element={<MainPage setProductId={setProductId} categories={categories} products={products} setProducts={setProducts}/>}/>
        <Route path ="/addProduct" element={<AddProduct productId={productId} setProductId={setProductId} categories={categories} setCategories={setCategories}/>} />
        <Route path='/dashboard' element={<Dashboard products={products} setProducts={setProducts}/>}/>
        <Route path='/adminOrders' element={<AdminOrders />}/>
        <Route path='/customerProducts' element={<CustomerProducts products={products} setProducts={setProducts} categories={categories}/>}/>
        <Route path="/cart" element={<Cart />}/>
        <Route path="/customerOrders" element={<CustomerOrders />}/>
      </Routes>
    </>
  )
}

export default App
