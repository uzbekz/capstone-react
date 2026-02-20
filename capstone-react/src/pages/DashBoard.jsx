import "./DashBoard.css";
import { useEffect, useRef, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { getProducts } from "../api.js";
import Chart from "chart.js/auto";

function Dashboard({ products }) {

  const [localProducts, setLocalProducts] = useState([]);
  const categoryChartRef = useRef(null);
  const stockChartRef = useRef(null);
  const topProductsChartRef = useRef(null);

  const chartsRef = useRef([]);

  // ✅ Fetch once only if products not provided
  useEffect(() => {
    async function load() {
      if (products && products.length) {
        setLocalProducts(products);
      } else {
        const data = await getProducts();
        setLocalProducts(data);
      }
    }
    load();
  }, [products]);

  // ✅ Memoize computed data (prevents recalculation)
  const { categoryMap, topProducts, stockProducts } = useMemo(() => {

    const categoryMap = {};
    localProducts.forEach(p => {
      categoryMap[p.category] = (categoryMap[p.category] || 0) + 1;
    });

    const topProducts = [...localProducts]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // 🔥 IMPORTANT: Limit pie chart to top 10 only
    const stockProducts = [...localProducts]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    return { categoryMap, topProducts, stockProducts };

  }, [localProducts]);

  // ✅ Create charts only when data changes
  useEffect(() => {
    if (!localProducts.length) return;

    chartsRef.current.forEach(chart => chart.destroy());
    chartsRef.current = [];

    const categoryChart = new Chart(categoryChartRef.current, {
      type: "bar",
      data: {
        labels: Object.keys(categoryMap),
        datasets: [{
          label: "Products per Category",
          data: Object.values(categoryMap)
        }]
      }
    });

    const stockChart = new Chart(stockChartRef.current, {
      type: "pie",
      data: {
        labels: stockProducts.map(p => p.name),
        datasets: [{
          label: "Stock Distribution (Top 10)",
          data: stockProducts.map(p => p.quantity)
        }]
      }
    });

    const topChart = new Chart(topProductsChartRef.current, {
      type: "bar",
      data: {
        labels: topProducts.map(p => p.name),
        datasets: [{
          label: "Top 5 Stocked Products",
          data: topProducts.map(p => p.quantity)
        }]
      }
    });

    chartsRef.current.push(categoryChart, stockChart, topChart);

    return () => {
      chartsRef.current.forEach(chart => chart.destroy());
      chartsRef.current = [];
    };

  }, [categoryMap, topProducts, stockProducts]);

  // KPIs
  const totalProducts = localProducts.length;
  const totalStock = localProducts.reduce((sum, p) => sum + p.quantity, 0);
  const lowStock = localProducts.filter(p => p.quantity < 10).length;
  const inventoryValue = localProducts.reduce(
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
        <canvas ref={stockChartRef} className="pie-chart"></canvas>
        <canvas ref={topProductsChartRef}></canvas>
      </div>

      <Link to="/mainPage" className="back-link">
        ⬅ Back to Products
      </Link>
    </div>
  );
}

export default Dashboard;