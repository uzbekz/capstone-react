import "./Dashboard.css";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { getProducts } from "../api.js";
import Chart from "chart.js/auto";

function Dashboard({products,setProducts}) {


  const categoryChartRef = useRef(null);
  const stockChartRef = useRef(null);
  const topProductsChartRef = useRef(null);

  const chartsRef = useRef([]);

  useEffect(() => {
    async function loadProducts() {
      const data = await getProducts();
      setProducts(data);
    }
    loadProducts();
  }, []);

  useEffect(() => {
    if (!products.length) return;

    // Cleanup old charts
    chartsRef.current.forEach(chart => chart.destroy());
    chartsRef.current = [];

    // KPIs
    const categoryMap = {};
    products.forEach(p => {
      categoryMap[p.category] = (categoryMap[p.category] || 0) + 1;
    });

    const topProducts = [...products]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // CATEGORY BAR CHART
    chartsRef.current.push(
      new Chart(categoryChartRef.current, {
        type: "bar",
        data: {
          labels: Object.keys(categoryMap),
          datasets: [
            {
              label: "Products per Category",
              data: Object.values(categoryMap)
            }
          ]
        }
      })
    );

    // STOCK PIE CHART
    chartsRef.current.push(
      new Chart(stockChartRef.current, {
        type: "pie",
        data: {
          labels: products.map(p => p.name),
          datasets: [
            {
              label: "Stock Distribution",
              data: products.map(p => p.quantity)
            }
          ]
        }
      })
    );

    // TOP PRODUCTS CHART
    chartsRef.current.push(
      new Chart(topProductsChartRef.current, {
        type: "bar",
        data: {
          labels: topProducts.map(p => p.name),
          datasets: [
            {
              label: "Top 5 Stocked Products",
              data: topProducts.map(p => p.quantity)
            }
          ]
        }
      })
    );

    return () => {
      chartsRef.current.forEach(chart => chart.destroy());
      chartsRef.current = [];
    };
  }, [products]);

  // KPIs
  const totalProducts = products.length;
  const totalStock = products.reduce((sum, p) => sum + p.quantity, 0);
  const lowStock = products.filter(p => p.quantity < 10).length;
  const inventoryValue = products.reduce(
    (sum, p) => sum + p.price * p.quantity,
    0
  );

  return (
    <div className="dashboard">
      <h1>Product Manager Dashboard</h1>

      <div className="stats">
        <div className="card">
          <h3>Total Products</h3>
          <p>{totalProducts}</p>
        </div>

        <div className="card">
          <h3>Total Stock</h3>
          <p>{totalStock}</p>
        </div>

        <div className="card">
          <h3>Low Stock</h3>
          <p>{lowStock}</p>
        </div>

        <div className="card">
          <h3>Inventory Value</h3>
          <p>${inventoryValue.toFixed(2)}</p>
        </div>
      </div>

      <div className="charts">
        <canvas ref={categoryChartRef}></canvas>
        <canvas ref={stockChartRef}></canvas>
        <canvas ref={topProductsChartRef}></canvas>
      </div>

      <Link to="/mainPage" className="back-link">
        ⬅ Back to Products
      </Link>
    </div>
  );
}

export default Dashboard;
