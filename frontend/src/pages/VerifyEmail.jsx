import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import loadingGif from "../assets/loading.gif";
import "./ForgotPassword.css";
import { resendVerification, verifyEmail } from "../api";

function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    const tokenFromUrl = searchParams.get("token");
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    }
  }, [searchParams]);

  async function submitVerification(event) {
    event.preventDefault();
    setVerifyLoading(true);
    setStatusMessage("");

    try {
      const data = await verifyEmail(token);
      setStatusMessage(data.message || "Email verified successfully.");
      setIsVerified(true);
      setTimeout(() => navigate("/"), 2000);
    } catch (err) {
      setStatusMessage(err.message || "Unable to verify email.");
      setVerifyLoading(false);
    }
  }

  async function submitResend(event) {
    event.preventDefault();
    setResendLoading(true);
    setStatusMessage("");

    try {
      const data = await resendVerification(email);
      setStatusMessage(data.message || "Verification email sent.");
    } catch (err) {
      setStatusMessage(err.message || "Unable to resend verification email.");
    } finally {
      setResendLoading(false);
    }
  }

  const isBusy = verifyLoading || resendLoading;

  if (isVerified) {
    return (
      <div className="forgot-password-page">
        <div className="forgot-password-card">
          <div className="auth-success-state" style={{ textAlign: "center", padding: "2rem 0" }}>
            <div style={{ color: "var(--accent)", fontSize: "48px", marginBottom: "1rem" }}>✓</div>
            <h2>Verified!</h2>
            <p style={{ color: "var(--muted)", margin: "1rem 0" }}>{statusMessage}</p>
            <p style={{ fontSize: "14px", fontWeight: "600" }}>Redirecting to login...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="forgot-password-page">
      <div className="forgot-password-card">
        {isBusy ? (
          <div className="auth-loading">
            <img src={loadingGif} alt="Processing verification" className="auth-loading-gif" />
            <p>Please wait...</p>
          </div>
        ) : (
          <>
            <h2>Verify Email</h2>
            <p className="forgot-password-copy">
              Verify your account using the token from your email, or request a fresh verification email if needed.
            </p>

            <section className="forgot-password-section">
              <h3>Confirm Verification</h3>
              <p>Paste the verification token from your email, or use the link directly from the email message.</p>
              <form onSubmit={submitVerification}>
                <input
                  type="text"
                  placeholder="Paste verification token"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  required
                />
                <button type="submit">Verify Email</button>
              </form>
            </section>

            <section className="forgot-password-section">
              <h3>Resend Verification</h3>
              <p>Enter your account email to receive a fresh verification message.</p>
              <form onSubmit={submitResend}>
                <input
                  type="email"
                  placeholder="Enter your account email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <button type="submit">Resend Verification</button>
              </form>
            </section>

            {statusMessage && <p className="status-text">{statusMessage}</p>}

            <p className="forgot-password-footer">
              <Link to="/">Back to login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default VerifyEmail;
