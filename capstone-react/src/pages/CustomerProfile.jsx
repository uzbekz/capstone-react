import "./CustomerProfile.css";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProfile } from "../api";
import loadingGif from "../assets/loading.gif";

function CustomerProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getProfile();
        setProfile(data);
      } catch {
        navigate("/");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

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
    </div>
  );
}

export default CustomerProfile;
