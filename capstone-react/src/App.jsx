import Login from "./pages/Login"
import Register from "./pages/Register"
import {Routes, Route} from 'react-router-dom'
import { useEffect, useState } from "react"
import MainPage from "./pages/MainPage"
import AddProduct from "./pages/AddProduct"
import { getProducts } from "./api"
function App() {
  const [productId, setProductId] = useState(null)
  const [categories, setCategories] = useState([]);
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
        <Route path="/mainPage" element={<MainPage setProductId={setProductId} categories={categories}/>}/>
        <Route path ="/addProduct" element={<AddProduct productId={productId} setProductId={setProductId} categories={categories} setCategories={setCategories}/>} />
      </Routes>
    </>
  )
}

export default App
