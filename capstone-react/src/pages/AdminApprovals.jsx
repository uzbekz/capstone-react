import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getPendingAdminRequests, getProfile, reviewAdminRequest } from "../api";
import "./AdminApprovals.css";
import loadingGif from "../assets/loading.gif";

function AdminApprovals() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    async function bootstrap() {
      try {
        const profile = await getProfile();
        const isPrimaryAdmin = profile.role === "product_manager" && profile.id === 1;

        if (!isPrimaryAdmin) {
          console.warn("Only primary admin can access admin approvals.");
          navigate("/mainPage");
          return;
        }

        const pending = await getPendingAdminRequests();
        setRequests(pending);
      } catch (err) {
        console.error(err.message || "Failed to load admin requests");
        navigate("/mainPage");
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [navigate]);

  async function handleDecision(userId, decision) {
    try {
      setBusyId(userId);
      await reviewAdminRequest(userId, decision);
      setRequests(prev => prev.filter(req => req.id !== userId));
    } catch (err) {
      console.error(err.message || "Failed to review request");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-approvals-container">
      <div className="admin-approvals-card">
        <div className="admin-approvals-header">
          <h2>Admin Approval Requests</h2>
          <Link to="/mainPage">Back to Main Page</Link>
        </div>

        {loading && (
          <div className="approvals-loading">
            <img src={loadingGif} alt="Loading requests" className="approvals-loading-gif" />
            <p>Loading requests...</p>
          </div>
        )}

        {!loading && requests.length === 0 && (
          <p className="empty-state">No pending admin requests.</p>
        )}

        {!loading && requests.length > 0 && (
          <div className="requests-list">
            {requests.map(req => (
              <div key={req.id} className="request-row">
                <div>
                  <p className="request-email">{req.email}</p>
                  <p className="request-meta">Requested on: {new Date(req.created_at).toLocaleString()}</p>
                </div>
                <div className="request-actions">
                  <button
                    onClick={() => handleDecision(req.id, "approve")}
                    disabled={busyId === req.id}
                  >
                    Approve
                  </button>
                  <button
                    className="reject-btn"
                    onClick={() => handleDecision(req.id, "reject")}
                    disabled={busyId === req.id}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminApprovals;
