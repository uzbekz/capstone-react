import "./DashBoard.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDashboardReports, getProducts } from "../api.js";
import Chart from "chart.js/auto";
import loadingGif from "../assets/loading.gif";

function Dashboard({ products }) {
  const token = localStorage.getItem("token");
  const [localProducts, setLocalProducts] = useState([]);
  const [reports, setReports] = useState({});
  const [loading, setLoading] = useState(true);

  const categoryChartRef = useRef(null);
  const stockChartRef = useRef(null);
  const topProductsChartRef = useRef(null);
  const revenueChartRef = useRef(null);
  const ordersChartRef = useRef(null);
  const chartsRef = useRef([]);

  const lowStockItems = useMemo(
    () => localProducts.filter((product) => product.quantity < 10).sort((a, b) => a.quantity - b.quantity),
    [localProducts],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      try {
        const productsPromise =
          products && products.length ? Promise.resolve(products) : getProducts();
        const reportsPromise = token ? getDashboardReports() : Promise.resolve({});

        const [productData, reportData] = await Promise.all([productsPromise, reportsPromise]);
        if (cancelled) return;

        setLocalProducts(productData || []);
        setReports(reportData || {});
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [products, token]);

  const { categoryMap, topProducts, stockProducts } = useMemo(() => {
    const nextCategoryMap = {};
    localProducts.forEach((product) => {
      nextCategoryMap[product.category] = (nextCategoryMap[product.category] || 0) + 1;
    });

    const nextTopProducts = [...localProducts]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const nextStockProducts = [...localProducts]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    return {
      categoryMap: nextCategoryMap,
      topProducts: nextTopProducts,
      stockProducts: nextStockProducts,
    };
  }, [localProducts]);

  useEffect(() => {
    if (!localProducts.length) return;

    chartsRef.current.forEach((chart) => chart.destroy());
    chartsRef.current = [];

    const categoryChart = new Chart(categoryChartRef.current, {
      type: "bar",
      data: {
        labels: Object.keys(categoryMap),
        datasets: [
          {
            label: "Products per Category",
            data: Object.values(categoryMap),
          },
        ],
      },
    });

    const stockChart = new Chart(stockChartRef.current, {
      type: "pie",
      data: {
        labels: stockProducts.map((product) => product.name),
        datasets: [
          {
            label: "Stock Distribution (Top 10)",
            data: stockProducts.map((product) => product.quantity),
          },
        ],
      },
    });

    const topChart = new Chart(topProductsChartRef.current, {
      type: "bar",
      data: {
        labels: topProducts.map((product) => product.name),
        datasets: [
          {
            label: "Top 5 Stocked Products",
            data: topProducts.map((product) => product.quantity),
          },
        ],
      },
    });

    if (reports.revenueByMonth) {
      const revChart = new Chart(revenueChartRef.current, {
        type: "line",
        data: {
          labels: reports.revenueByMonth.map((item) => item.month),
          datasets: [
            {
              label: "Revenue",
              data: reports.revenueByMonth.map((item) => item.revenue),
              borderColor: "#2563eb",
              backgroundColor: "rgba(37,99,235,0.2)",
              tension: 0.3,
            },
          ],
        },
        options: { scales: { y: { beginAtZero: true } } },
      });
      chartsRef.current.push(revChart);
    }

    if (reports.monthlyOrders) {
      const ordersChart = new Chart(ordersChartRef.current, {
        type: "bar",
        data: {
          labels: reports.monthlyOrders.map((item) => item.month),
          datasets: [
            {
              label: "Orders",
              data: reports.monthlyOrders.map((item) => item.orders),
              backgroundColor: "#10b981",
            },
          ],
        },
        options: { scales: { y: { beginAtZero: true } } },
      });
      chartsRef.current.push(ordersChart);
    }

    chartsRef.current.push(categoryChart, stockChart, topChart);

    return () => {
      chartsRef.current.forEach((chart) => chart.destroy());
      chartsRef.current = [];
    };
  }, [categoryMap, topProducts, stockProducts, reports, localProducts.length]);

  const totalProducts = localProducts.length;
  const totalStock = localProducts.reduce((sum, product) => sum + product.quantity, 0);
  const lowStock = localProducts.filter((product) => product.quantity < 10).length;
  const inventoryValue = localProducts.reduce(
    (sum, product) => sum + product.price * product.quantity,
    0,
  );

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-loading">
          <img src={loadingGif} alt="Loading dashboard" className="dashboard-loading-gif" />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Inventory Dashboard</h1>
        <p className="subtitle">Real-time overview of products, stock and value</p>
      </header>

      <div className="stats">
        <div className="card">
          <span className="icon">P</span>
          <h3>Total Products</h3>
          <p>{totalProducts}</p>
        </div>

        <div className="card">
          <span className="icon">S</span>
          <h3>Total Stock</h3>
          <p>{totalStock}</p>
        </div>

        <div className="card">
          <span className="icon">L</span>
          <h3>Low Stock</h3>
          <p>{lowStock}</p>
        </div>

        <div className="card">
          <span className="icon">V</span>
          <h3>Inventory Value</h3>
          <p>Rs {inventoryValue.toFixed(2)}</p>
        </div>

        {reports.mostSoldProduct && (
          <div className="card">
            <span className="icon">T</span>
            <h3>Top Seller</h3>
            <p>
              {reports.mostSoldProduct.name} ({reports.mostSoldProduct.sold})
            </p>
          </div>
        )}

        {reports.mostProfitableCategory && (
          <div className="card">
            <span className="icon">C</span>
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
              {lowStockItems.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.category}</td>
                  <td>{product.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export default Dashboard;
