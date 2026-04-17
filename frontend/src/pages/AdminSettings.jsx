import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAppSettings, getProfile, updateAppSettings } from "../api";
import loadingGif from "../assets/loading.gif";
import { useSnackbar } from "../components/SnackbarProvider";
import "./AdminSettings.css";

const fieldConfig = [
  {
    key: "return_window_days",
    label: "Return Period",
    description: "How many days a delivered order can still be returned.",
    suffix: "days"
  },
  {
    key: "delivery_min_minutes",
    label: "Minimum Delivery Time",
    description: "Shortest delivery estimate used after dispatch.",
    suffix: "minutes"
  },
  {
    key: "delivery_max_minutes",
    label: "Maximum Delivery Time",
    description: "Longest delivery estimate used after dispatch.",
    suffix: "minutes"
  },
  {
    key: "low_stock_threshold",
    label: "Low Stock Threshold",
    description: "Products below this quantity should be treated as low stock in admin views.",
    suffix: "units"
  },
  {
    key: "default_restock_increment",
    label: "Default Restock Increment",
    description: "Suggested quick-restock amount for the products page.",
    suffix: "units"
  },
  {
    key: "max_product_quantity",
    label: "Max Product Quantity",
    description: "Maximum units of a single product a customer can keep in cart.",
    suffix: "units"
  },
  {
    key: "shipping_charge",
    label: "Shipping Charge",
    description: "Flat shipping fee added to every customer order at checkout.",
    suffix: "₹"
  }
];

function AdminSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [values, setValues] = useState({});
  const { showSnackbar } = useSnackbar();

  useEffect(() => {
    async function bootstrap() {
      try {
        const [currentProfile, settings] = await Promise.all([getProfile(), getAppSettings()]);
        if (currentProfile.role !== "product_manager" || currentProfile.admin_status !== "approved") {
          navigate("/mainPage");
          return;
        }
        setProfile(currentProfile);
        setValues(settings);
      } catch (err) {
        showSnackbar(err.message || "Failed to load settings", "error");
        console.error(err.message || "Failed to load settings");
        navigate("/mainPage");
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [navigate]);

  function handleChange(key, value) {
    setValues((prev) => ({
      ...prev,
      [key]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const payload = Object.fromEntries(
      fieldConfig.map((field) => [field.key, Number.parseInt(values[field.key], 10) || 0])
    );

    try {
      setSaving(true);
      const response = await updateAppSettings(payload);
      setValues(response.settings);
      showSnackbar("Settings updated successfully.", "success");
    } catch (err) {
      showSnackbar(err.message || "Failed to update settings", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="admin-settings-page admin-settings-loading-screen">
        <div className="admin-settings-loading">
          <img src={loadingGif} alt="Loading settings" className="admin-settings-loading-gif" />
          <p>Loading admin settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-settings-page">
      <div className="admin-settings-shell">
        <section className="admin-settings-hero">
          <div>
            <p className="admin-settings-kicker">Products &rsaquo; Settings</p>
            <h1>Admin Settings</h1>
            <p className="admin-settings-copy">
              Manage the operational defaults that control deliveries, returns, stock alerts, cart limits, and shipping charges.
            </p>
          </div>
          <div className="admin-settings-account">
            <span>{profile?.email}</span>
          </div>
        </section>

        <section className="admin-settings-summary">
          <article className="settings-summary-card">
            <span>Return Window</span>
            <strong>{values.return_window_days} days</strong>
          </article>
          <article className="settings-summary-card">
            <span>Delivery Range</span>
            <strong>
              {values.delivery_min_minutes}-{values.delivery_max_minutes} min
            </strong>
          </article>
          <article className="settings-summary-card">
            <span>Low Stock Alert</span>
            <strong>{values.low_stock_threshold} units</strong>
          </article>
          <article className="settings-summary-card">
            <span>Product Limit</span>
            <strong>{values.max_product_quantity} units</strong>
          </article>
        </section>

        <form className="admin-settings-form" onSubmit={handleSubmit}>
          <div className="admin-settings-grid">
            {fieldConfig.map((field) => (
              <label key={field.key} className="admin-setting-card">
                <span className="admin-setting-title">{field.label}</span>
                <span className="admin-setting-description">{field.description}</span>
                <div className="admin-setting-input-row">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={values[field.key] ?? ""}
                    onChange={(event) => handleChange(field.key, event.target.value)}
                  />
                  <span className="admin-setting-suffix">{field.suffix}</span>
                </div>
              </label>
            ))}
          </div>

          <div className="admin-settings-note">
            Delivery estimates are randomized between the configured minimum and maximum time after an order is dispatched.
          </div>

          <div className="admin-settings-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminSettings;
