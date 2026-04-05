import "./CustomerProfile.css";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProfile, updateProfileAddress } from "../api";
import loadingGif from "../assets/loading.gif";
import { useSnackbar } from "../components/SnackbarProvider";

function CustomerProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    address_line1: "",
    address_line2: "",
    city: "",
    postal_code: "",
    country: "",
  });
  const { showSnackbar } = useSnackbar();

  useEffect(() => {
    async function load() {
      try {
        const data = await getProfile();
        setProfile(data);
        setForm({
          address_line1: data.address_line1 || "",
          address_line2: data.address_line2 || "",
          city: data.city || "",
          postal_code: data.postal_code || "",
          country: data.country || "",
        });
      } catch {
        navigate("/");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  async function saveAddress(e) {
    e.preventDefault();
    try {
      setSaving(true);
      const data = await updateProfileAddress(form);
      setProfile((prev) => ({ ...prev, ...data }));
      showSnackbar("Address saved.", "success");
    } catch (err) {
      showSnackbar(err.message || "Could not save address", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="profile-container">
        <div className="profile-loading">
          <img src={loadingGif} alt="Loading profile" className="profile-loading-gif" />
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <h2>My Profile</h2>
      <div className="profile-card">
        <p>
          <strong>Email:</strong> {profile.email}
        </p>
        <p>
          <strong>Role:</strong> {profile.role}
        </p>
        <p>
          <strong>Member since:</strong> {new Date(profile.created_at).toLocaleDateString()}
        </p>
      </div>

      <h3 className="profile-section-title">Default shipping address</h3>
      <p className="profile-hint">Used when you check out (you can still override later).</p>
      <form className="profile-address-form" onSubmit={saveAddress}>
        <label>
          Address line 1
          <input
            value={form.address_line1}
            onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
            autoComplete="street-address"
          />
        </label>
        <label>
          Address line 2
          <input
            value={form.address_line2}
            onChange={(e) => setForm((f) => ({ ...f, address_line2: e.target.value }))}
          />
        </label>
        <div className="profile-address-row">
          <label>
            City
            <input
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              autoComplete="address-level2"
            />
          </label>
          <label>
            Postal code
            <input
              value={form.postal_code}
              onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
              autoComplete="postal-code"
            />
          </label>
        </div>
        <label>
          Country
          <input
            value={form.country}
            onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
            autoComplete="country-name"
          />
        </label>
        <button type="submit" className="profile-save-btn" disabled={saving}>
          {saving ? "Saving…" : "Save address"}
        </button>
      </form>
    </div>
  );
}

export default CustomerProfile;
