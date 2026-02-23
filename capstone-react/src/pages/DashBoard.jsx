import "./DashBoard.css";
import { useEffect, useRef, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { getProducts, getDashboardReports } from "../api.js";
import Chart from "chart.js/auto";

function Dashboard({ products }) {

  const token = localStorage.getItem("token");
  const [localProducts, setLocalProducts] = useState([]);
  const [reports, setReports] = useState({});
  const categoryChartRef = useRef(null);
  const stockChartRef = useRef(null);
  const topProductsChartRef = useRef(null);
  const revenueChartRef = useRef(null);
  const ordersChartRef = useRef(null);

  const chartsRef = useRef([]);

  // low stock items list for table
  const lowStockItems = useMemo(
    () => localProducts.filter(p => p.quantity < 10).sort((a,b)=>a.quantity - b.quantity),
    [localProducts]
  );

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

  // fetch report data
  useEffect(() => {
    async function loadReports() {
      if (!token) return;
      try {
        const data = await getDashboardReports();
        setReports(data);
      } catch (err) {
        console.error(err);
      }
    }
    loadReports();
  }, [token]);

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

    // destroy previous charts before rebuilding
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

    // revenue over time line chart
    if (reports.revenueByMonth) {
      const revChart = new Chart(revenueChartRef.current, {
        type: "line",
        data: {
          labels: reports.revenueByMonth.map(r => r.month),
          datasets: [{
            label: "Revenue",
            data: reports.revenueByMonth.map(r => r.revenue),
            borderColor: "#2563eb",
            backgroundColor: "rgba(37,99,235,0.2)",
            tension: 0.3
          }]
        },
        options: { scales: { y: { beginAtZero: true } } }
      });
      chartsRef.current.push(revChart);
    }

    // monthly orders
    if (reports.monthlyOrders) {
      const ordChart = new Chart(ordersChartRef.current, {
        type: "bar",
        data: {
          labels: reports.monthlyOrders.map(r => r.month),
          datasets: [{
            label: "Orders",
            data: reports.monthlyOrders.map(r => r.orders),
            backgroundColor: "#10b981"
          }]
        },
        options: { scales: { y: { beginAtZero: true } } }
      });
      chartsRef.current.push(ordChart);
    }

    chartsRef.current.push(categoryChart, stockChart, topChart);

    return () => {
      chartsRef.current.forEach(chart => chart.destroy());
      chartsRef.current = [];
    };

  }, [categoryMap, topProducts, stockProducts, reports]);

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
      <header className="dashboard-header">
        <h1>Inventory Dashboard</h1>
        <p className="subtitle">Real‑time overview of products, stock and value</p>
      </header>

      <div className="stats">
        <div className="card">
          <span className="icon">🧾</span>
          <h3>Total Products</h3>
          <p>{totalProducts}</p>
        </div>

        <div className="card">
          <span className="icon">📦</span>
          <h3>Total Stock</h3>
          <p>{totalStock}</p>
        </div>

        <div className="card">
          <span className="icon">⚠️</span>
          <h3>Low Stock</h3>
          <p>{lowStock}</p>
        </div>

        <div className="card">
          <span className="icon">💰</span>
          <h3>Inventory Value</h3>
          <p>${inventoryValue.toFixed(2)}</p>
        </div>

        {reports.mostSoldProduct && (
          <div className="card">
            <span className="icon">🔥</span>
            <h3>Top Seller</h3>
            <p>{reports.mostSoldProduct.name} ({reports.mostSoldProduct.sold})</p>
          </div>
        )}

        {reports.mostProfitableCategory && (
          <div className="card">
            <span className="icon">🏷️</span>
            <h3>Best Category</h3>
            <p>{reports.mostProfitableCategory.category}</p>
          </div>
        )}
      </div>

      <div className="charts">
        <div className="chart-card">
          <h4>Products by Category</h4>
          <canvas ref={categoryChartRef}></canvas>
        </div>
        <div className="chart-card">
          <h4>Stock Distribution (Top 10)</h4>
          <canvas ref={stockChartRef} className="pie-chart"></canvas>
        </div>
        <div className="chart-card">
          <h4>Top 5 Stocked Products</h4>
          <canvas ref={topProductsChartRef}></canvas>
        </div>
        <div className="chart-card">
          <h4>Revenue Over Time</h4>
          <canvas ref={revenueChartRef}></canvas>
        </div>
        <div className="chart-card">
          <h4>Monthly Orders</h4>
          <canvas ref={ordersChartRef}></canvas>
        </div>
      </div>

      {lowStockItems.length > 0 && (
        <section className="low-stock-table">
          <h3>Low stock items (&lt; 10 units)</h3>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {lowStockItems.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.category}</td>
                  <td>{p.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Link to="/mainPage" className="back-link">
        ⬅ Back to Products
      </Link>
    </div>
  );
}

export default Dashboard;