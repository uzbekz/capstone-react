import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import loadingGif from "../assets/loading.gif";
import "./Register.css";
import { register } from "../api";
import { useSnackbar } from "../components/SnackbarProvider";

function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState("customer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showSnackbar } = useSnackbar();

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await register({ email, password, role });
      showSnackbar("Registration created. Please verify your email before admin approval.", "success");
      navigate("/");
    } catch (err) {
      const message = err.message || "Registration failed";
      const isDuplicateAccount =
        message.toLowerCase().includes("already registered") ||
        message.toLowerCase().includes("duplicate");

      if (isDuplicateAccount) {
        showSnackbar(message, "warning");
      } else {
        showSnackbar(message, "error");
        console.error(message);
      }
      setIsSubmitting(false);
    }
  }

  return (
    <div className="register-container">
      <div className="register-layout">
        <div className="box">
          {isSubmitting ? (
            <div className="auth-loading">
              <img src={loadingGif} alt="Registering user" className="auth-loading-gif" />
              <p>Creating account...</p>
            </div>
          ) : (
            <>
              <h2>Register</h2>
              <form id="registerForm" onSubmit={handleSubmit}>
                <input
                  type="email"
                  id="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />

                <div className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>

                <select id="role" value={role} onChange={e => setRole(e.target.value)}>
                  <option value="customer">Customer</option>
                  <option value="product_manager">Product Manager (Needs Approval)</option>
                </select>

                <button type="submit">Register</button>
              </form>

              <p>
                Already have an account? <Link to="/">Login</Link>
              </p>
            </>
          )}
        </div>

        <div className="register-guide-panel">
          <h3>Authentication Guide</h3>
          <ul>
            <li>
              <strong>1. Email Verification</strong>
              <p>After registering, we'll send a verification link to your email. You must verify your email before proceeding.</p>
            </li>
            <li>
              <strong>2. Account Approval</strong>
              <p>Because this platform is invite-only/restricted, <b>all new accounts</b> (both Customers and Product Managers) require manual review. An existing administrator must approve your account.</p>
            </li>
            <li>
              <strong>3. Login Access</strong>
              <p>Once your email is verified and an admin has approved your request, your login will be fully activated!</p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Register;
