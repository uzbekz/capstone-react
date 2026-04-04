import Login from "./pages/Login"
import Register from "./pages/Register"
import {Routes, Route, Navigate, useLocation} from 'react-router-dom'
import { useEffect, useState } from "react"
import MainPage from "./pages/MainPage"
import AddProduct from "./pages/AddProduct"
import { getProducts } from "./api"
import Dashboard from './pages/DashBoard.jsx'
import AdminOrders from './pages/AdminOrders.jsx'
import AdminSettings from './pages/AdminSettings.jsx'
import CustomerProducts from './pages/CustomerProducts.jsx'
import Cart from './pages/Cart.jsx'
import CustomerOrders from './pages/CustomerOrders.jsx'
import CustomerProfile from './pages/CustomerProfile.jsx'
import OrderDetails from './pages/OrderDetails.jsx'
import AdminUsers from './pages/AdminUsers.jsx'
import ForgotPassword from "./pages/ForgotPassword.jsx"
import VerifyEmail from "./pages/VerifyEmail.jsx"
import Breadcrumbs from "./components/Breadcrumbs.jsx"
import AppHeader from "./components/AppHeader.jsx"
import { SnackbarProvider } from "./components/SnackbarProvider.jsx"
import "./App.css"

function App() {
  const location = useLocation();
  const [productId, setProductId] = useState(null)
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const hideGlobalChrome = location.pathname === "/verify-email";
  useEffect(() => {
    async function fetchCategories(){
      const products = await getProducts()
      const categories = [...new Set(products.map(p => p.category))]
      setCategories(categories)
    }
    fetchCategories()
  }, [])
  
  return (
    <SnackbarProvider>
      {!hideGlobalChrome && <AppHeader />}
      {!hideGlobalChrome && <Breadcrumbs />}
      <Routes>
        <Route path="/" element={<Login/>}/>
        <Route path="/forgot-password" element={<ForgotPassword />}/>
        <Route path="/verify-email" element={<VerifyEmail />}/>
        <Route path="/register" element={<Register />}/>
        <Route path="/mainPage" element={<MainPage setProductId={setProductId} categories={categories} products={products} setProducts={setProducts}/>}/>
        <Route path ="/addProduct" element={<AddProduct productId={productId} setProductId={setProductId} categories={categories} setCategories={setCategories}/>} />
        <Route path='/dashboard' element={<Dashboard products={products} setProducts={setProducts}/>}/>
        <Route path='/adminSettings' element={<AdminSettings />}/>
        <Route path='/adminOrders' element={<AdminOrders />}/>
        <Route path='/customerProducts' element={<CustomerProducts products={products} setProducts={setProducts} categories={categories}/>}/>
        <Route path="/cart" element={<Cart />}/>
        <Route path="/customerOrders" element={<CustomerOrders />}/>
        <Route path="/order/:id" element={<OrderDetails />}/>
        <Route path="/profile" element={<CustomerProfile />}/>
        <Route path="/adminUsers" element={<AdminUsers />}/>
        <Route path="/adminUsers/approvals" element={<AdminUsers />}/>
        <Route path="/adminApprovals" element={<Navigate to="/adminUsers/approvals" replace />}/>
      </Routes>
    </SnackbarProvider>
  )
}

export default App
