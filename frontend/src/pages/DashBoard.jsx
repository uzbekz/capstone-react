import "./DashBoard.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getProducts,
  getDashboardReports,
  getAppSettings,
  downloadAdminCsv,
} from "../api.js";
import Chart from "chart.js/auto";
import { useSnackbar } from "../components/SnackbarProvider";
import loadingGif from "../assets/loading.gif";

// Helper function for Indian currency formatting
function formatIndianPrice(price) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

function formatDateForInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function getDefaultDateRange() {
  const today = new Date();
  const yearStart = new Date(today.getFullYear(), 0, 1);

  return {
    start: formatDateForInput(yearStart),
    end: formatDateForInput(today),
  };
}

function Dashboard() {
  const defaultDateRange = useMemo(() => getDefaultDateRange(), []);
  const [products, setProducts] = useState([]);
  const [reports, setReports] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportBusy, setExportBusy] = useState(false);
  const [dateFrom, setDateFrom] = useState(defaultDateRange.start);
  const [dateTo, setDateTo] = useState(defaultDateRange.end);
  const [selectedCategory, setSelectedCategory] = useState("all");

  const trendChartRef = useRef(null);
  const categoryChartRef = useRef(null);
  const ordersChartRef = useRef(null);
  const stockChartRef = useRef(null);
  const chartsRef = useRef([]);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);

      const productsPromise = getProducts();
      const reportsPromise = getDashboardReports();
      const settingsPromise = getAppSettings();

      const [productData, reportData, settingsData] = await Promise.all([
        productsPromise,
        reportsPromise,
        settingsPromise,
      ]);

      setProducts(productData);
      setReports(reportData);
      setSettings(settingsData);
      setLoading(false);
    };

    loadDashboard();
  }, [dateFrom, dateTo, selectedCategory]);

  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category).filter(Boolean))].sort(),
    [products],
  );

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const createdDate = formatDateForInput(product.created_at || product.createdAt);
      const matchesFrom = !dateFrom || (createdDate && createdDate >= dateFrom);
      const matchesTo = !dateTo || (createdDate && createdDate <= dateTo);
      const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;

      return matchesFrom && matchesTo && matchesCategory;
    });
  }, [products, dateFrom, dateTo, selectedCategory]);

  const filteredMetrics = useMemo(() => {
    const totalProducts = filteredProducts.length;
    const totalStock = filteredProducts.reduce((sum, product) => sum + Number(product.quantity), 0);
    const inventoryValue = filteredProducts.reduce(
      (sum, product) => sum + Number(product.price) * Number(product.quantity),
      0,
    );
    const lowStockCount = filteredProducts.filter(
      (product) => Number(product.quantity) < (settings?.low_stock_threshold || 10),
    ).length;
    const activeCategories = [...new Set(filteredProducts.map((product) => product.category))].length;

    return {
      totalProducts,
      totalStock,
      inventoryValue,
      lowStockCount,
      activeCategories,
    };
  }, [filteredProducts, settings?.low_stock_threshold]);

  const categoryMap = useMemo(() => {
    const map = {};
    filteredProducts.forEach((product) => {
      map[product.category] = (map[product.category] || 0) + 1;
    });
    return map;
  }, [filteredProducts]);

  const stockBreakdown = useMemo(() => {
    return [...filteredProducts]
      .sort((a, b) => Number(b.quantity) - Number(a.quantity))
      .slice(0, 6);
  }, [filteredProducts]);

  const topProducts = useMemo(() => {
    return [...filteredProducts]
      .sort((a, b) => Number(b.quantity) - Number(a.quantity))
      .slice(0, 6);
  }, [filteredProducts]);

  const lowStockItems = useMemo(() => {
    return [...filteredProducts]
      .filter((product) => Number(product.quantity) < (settings?.low_stock_threshold || 10))
      .sort((a, b) => Number(a.quantity) - Number(b.quantity))
      .slice(0, 6);
  }, [filteredProducts, settings?.low_stock_threshold]);

  useEffect(() => {
    chartsRef.current.forEach((chart) => chart.destroy());
    chartsRef.current = [];

    if (trendChartRef.current && reports?.revenueByMonth?.length) {
      const trendChart = new Chart(trendChartRef.current, {
        type: "line",
        data: {
          labels: reports.revenueByMonth.map((item) => item.month),
          datasets: [
            {
              label: "Cost (INR)",
              data: reports.revenueByMonth.map((item) => item.revenue),
              borderColor: "#4ea66d",
              backgroundColor: "rgba(78,166,109,0.16)",
              pointBackgroundColor: "#ffffff",
              pointBorderColor: "#4ea66d",
              pointBorderWidth: 2,
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: "bottom",
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (value) => formatIndianPrice(value),
              },
              grid: {
                color: "rgba(148, 163, 184, 0.2)",
              },
            },
            x: {
              grid: {
                color: "rgba(148, 163, 184, 0.12)",
              },
            },
          },
        },
      });
      chartsRef.current.push(trendChart);
    }

    if (categoryChartRef.current && Object.keys(categoryMap).length) {
      const categoryChart = new Chart(categoryChartRef.current, {
        type: "bar",
        data: {
          labels: Object.keys(categoryMap),
          datasets: [
            {
              label: "Products",
              data: Object.values(categoryMap),
              backgroundColor: "#5d7bd4",
              borderRadius: 10,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: "rgba(148, 163, 184, 0.18)" },
            },
            x: {
              grid: { display: false },
            },
          },
        },
      });
      chartsRef.current.push(categoryChart);
    }

    if (ordersChartRef.current && reports?.monthlyOrders?.length) {
      const ordersChart = new Chart(ordersChartRef.current, {
        type: "bar",
        data: {
          labels: reports.monthlyOrders.map((item) => item.month),
          datasets: [
            {
              label: "Orders",
              data: reports.monthlyOrders.map((item) => item.orders),
              backgroundColor: "#df9244",
              borderRadius: 10,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: "bottom",
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: "rgba(148, 163, 184, 0.18)" },
            },
            x: {
              grid: { display: false },
            },
          },
        },
      });
      chartsRef.current.push(ordersChart);
    }

    if (stockChartRef.current && stockBreakdown.length) {
      const stockChart = new Chart(stockChartRef.current, {
        type: "doughnut",
        data: {
          labels: stockBreakdown.map((product) => product.name),
          datasets: [
            {
              data: stockBreakdown.map((product) => Number(product.quantity)),
              backgroundColor: ["#2e7d9a", "#5d7bd4", "#4ea66d", "#df9244", "#9d7ad4", "#d46b86"],
              borderWidth: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
            },
          },
        },
      });
      chartsRef.current.push(stockChart);
    }

    return () => {
      chartsRef.current.forEach((chart) => chart.destroy());
      chartsRef.current = [];
    };
  }, [reports, categoryMap, stockBreakdown]);

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
    <div className="dashboard dashboard-redesign">
      <header className="dashboard-hero">
        <div>
          <p className="dashboard-kicker">Analytics & Insights</p>
          <h1>Operations Dashboard</h1>
          <p className="subtitle">
            Review filtered inventory insights by date and category, while the cost trend stays pinned to full historical reporting data.
          </p>
        </div>
      </header>

      <section className="dashboard-filter-bar">
        <label>
          <span>Product Added From</span>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label>
          <span>Product Added To</span>
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>
        <label className="dashboard-filter-wide">
          <span>Category</span>
          <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
            <option value="all">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="dashboard-stats">
        <article className="dashboard-stat-card">
          <span>Filtered Products</span>
          <strong>{filteredMetrics.totalProducts}</strong>
        </article>
        <article className="dashboard-stat-card">
          <span>Total Inventory Value</span>
          <strong>{formatIndianPrice(filteredMetrics.inventoryValue)}</strong>
        </article>
        <article className="dashboard-stat-card">
          <span>Total Stock Units</span>
          <strong>{filteredMetrics.totalStock}</strong>
        </article>
        <article className="dashboard-stat-card">
          <span>Low Stock Alerts</span>
          <strong>{filteredMetrics.lowStockCount}</strong>
        </article>
      </section>

      {reports?.funnel && (
        <section className="dashboard-stats dashboard-funnel-row">
          <article className="dashboard-stat-card">
            <span>Pending orders</span>
            <strong>{reports.funnel.pendingOrders ?? "—"}</strong>
          </article>
          <article className="dashboard-stat-card">
            <span>Orders (7 days)</span>
            <strong>{reports.funnel.ordersLast7Days ?? "—"}</strong>
          </article>
          <article className="dashboard-stat-card">
            <span>Cancelled (30 days)</span>
            <strong>{reports.funnel.cancelledLast30Days ?? "—"}</strong>
          </article>
          <article className="dashboard-stat-card">
            <span>Orders with coupon</span>
            <strong>{reports.funnel.ordersWithCoupon ?? "—"}</strong>
          </article>
        </section>
      )}

      <section className="dashboard-filtered-section">
        <div className="dashboard-section-head">
          <div>
            <p className="dashboard-section-kicker">Filtered Inventory View</p>
            <h2>Insights From Current Filters</h2>
            <p>Every panel in this section responds to the selected product-added date range and category.</p>
          </div>
          <div className="dashboard-filter-badge">
            <span>Scope</span>
            <strong>{selectedCategory === "all" ? "All Categories" : selectedCategory}</strong>
            <small>{filteredMetrics.activeCategories} active categories</small>
          </div>
        </div>

        <div className="dashboard-grid dashboard-grid-two">
          <article className="dashboard-panel">
            <div className="panel-header">
              <div>
                <h3>Inventory Volume by Category</h3>
                <p>How many filtered products are present in each category.</p>
              </div>
            </div>
            <div className="chart-frame">
              <canvas ref={categoryChartRef}></canvas>
            </div>
          </article>

          <article className="dashboard-panel">
            <div className="panel-header">
              <div>
                <h3>Top Stock Distribution</h3>
                <p>Highest-volume products within the active filter scope.</p>
              </div>
            </div>
            <div className="chart-frame stock-frame">
              <canvas ref={stockChartRef}></canvas>
            </div>
          </article>
        </div>

        <div className="dashboard-grid dashboard-grid-two">
          <article className="dashboard-panel">
            <div className="panel-header">
              <div>
                <h3>Top Stocked Products</h3>
                <p>Highest-quantity products inside the current filtered view.</p>
              </div>
            </div>
            <div className="insight-table-wrap">
              <table className="insight-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((product) => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>{product.category}</td>
                      <td>{product.quantity}</td>
                    </tr>
                  ))}
                  {topProducts.length === 0 && (
                    <tr>
                      <td colSpan="3" className="empty-cell">No products matched the current filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="dashboard-panel">
            <div className="panel-header">
              <div>
                <h3>Low Stock Watchlist</h3>
                <p>Products below the threshold of {settings?.low_stock_threshold || 10} units.</p>
              </div>
            </div>
            <div className="insight-table-wrap">
              <table className="insight-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.map((product) => (
                    <tr key={product.id}>
                      <td>{product.name}</td>
                      <td>{product.category}</td>
                      <td>
                        <span className="status-pill warning">{product.quantity} units</span>
                      </td>
                    </tr>
                  ))}
                  {lowStockItems.length === 0 && (
                    <tr>
                      <td colSpan="3" className="empty-cell">No low-stock products in the current filter scope.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </section>

      <section className="dashboard-reporting-section">
        <div className="dashboard-section-head dashboard-section-head-compact">
          <div>
            <p className="dashboard-section-kicker">Reporting Overview</p>
            <h2>Unfiltered Historical Signals</h2>
            <p>These reporting panels stay independent from the dashboard filters.</p>
          </div>
        </div>

        <section className="dashboard-panel trend-panel">
          <div className="panel-header">
            <div>
              <h3>Cost Trend</h3>
              <p>Full historical cost pattern from the reporting service. Filters do not affect this chart.</p>
            </div>
          </div>
          <div className="chart-frame trend-frame">
            <canvas ref={trendChartRef}></canvas>
          </div>
        </section>

        <div className="dashboard-grid dashboard-grid-reporting">
          <article className="dashboard-panel">
            <div className="panel-header">
              <div>
                <h3>Monthly Order Flow</h3>
                <p>All recorded order volume by month from the reporting service.</p>
              </div>
            </div>
            <div className="chart-frame compact-chart-frame">
              <canvas ref={ordersChartRef}></canvas>
            </div>
          </article>

          <article className="dashboard-panel">
            <div className="panel-header">
              <div>
                <h3>Reporting Summary</h3>
                <p>Highlights from order and profitability analytics.</p>
              </div>
            </div>
            <div className="summary-list">
              <div className="summary-row">
                <span>Top Seller</span>
                <strong>
                  {reports?.mostSoldProduct ? `${reports.mostSoldProduct.name} (${reports.mostSoldProduct.sold})` : "N/A"}
                </strong>
              </div>
              <div className="summary-row">
                <span>Most Profitable Category</span>
                <strong>{reports?.mostProfitableCategory?.category || "N/A"}</strong>
              </div>
              <div className="summary-row">
                <span>Product Added Window</span>
                <strong>
                  {dateFrom || "Start"} to {dateTo || "Today"}
                </strong>
              </div>
              <div className="summary-row">
                <span>Filtered Category Scope</span>
                <strong>{selectedCategory === "all" ? "All Categories" : selectedCategory}</strong>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* Export buttons moved to bottom */}
      <section className="dashboard-exports-section">
        <div className="dashboard-export-buttons">
          <button
            type="button"
            className="dashboard-export-btn"
            disabled={exportBusy}
            onClick={async () => {
              try {
                setExportBusy(true);
                await downloadAdminCsv("/reports/export/orders", "orders.csv");
              } catch (e) {
                console.error(e);
              } finally {
                setExportBusy(false);
              }
            }}
          >
            Export orders CSV
          </button>
          <button
            type="button"
            className="dashboard-export-btn secondary"
            disabled={exportBusy}
            onClick={async () => {
              try {
                setExportBusy(true);
                await downloadAdminCsv("/reports/export/low-stock", "low-stock.csv");
              } catch (e) {
                console.error(e);
              } finally {
                setExportBusy(false);
              }
            }}
          >
            Export low-stock CSV
          </button>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
