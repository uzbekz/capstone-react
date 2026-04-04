import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import loadingGif from "../assets/loading.gif";
import "./ForgotPassword.css";
import { requestPasswordReset, resetPassword } from "../api";

function ForgotPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    const tokenFromUrl = searchParams.get("token");
    if (tokenFromUrl) setToken(tokenFromUrl);
  }, [searchParams]);

  async function requestReset(event) {
    event.preventDefault();
    setRequestLoading(true);
    setStatusMessage("");

    try {
      const data = await requestPasswordReset(email);
      setStatusMessage(data.message || "Reset request submitted.");
    } catch (err) {
      setStatusMessage(err.message || "Network error while requesting reset.");
    } finally {
      setRequestLoading(false);
    }
  }

  async function submitReset(event) {
    event.preventDefault();
    setResetLoading(true);
    setStatusMessage("");

    try {
      const data = await resetPassword(token, newPassword);
      setStatusMessage(data.message || "Password reset successful.");
      setTimeout(() => navigate("/"), 800);
    } catch (err) {
      setStatusMessage(err.message || "Network error while resetting password.");
    } finally {
      setResetLoading(false);
    }
  }

  const isBusy = requestLoading || resetLoading;

  return (
    <div className="forgot-password-page">
      <div className="forgot-password-card">
        {isBusy ? (
          <div className="auth-loading">
            <img src={loadingGif} alt="Processing request" className="auth-loading-gif" />
            <p>Please wait...</p>
          </div>
        ) : (
          <>
            <h2>Forgot Password</h2>

            <form onSubmit={requestReset}>
              <input
                type="email"
                placeholder="Enter your account email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <button type="submit">Send Reset Token</button>
            </form>

            <form onSubmit={submitReset}>
              <input
                type="text"
                placeholder="Paste reset token"
                value={token}
                onChange={e => setToken(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
              <button type="submit">Reset Password</button>
            </form>

            {statusMessage && <p className="status-text">{statusMessage}</p>}

            <p>
              <Link to="/">Back to login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default ForgotPassword;
