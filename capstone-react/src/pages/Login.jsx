import "./Login.css";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import loadingGif from "../assets/loading.gif";
import { login } from "../api";
import { useSnackbar } from "../components/SnackbarProvider";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const data = await login(email, password);
      showSnackbar("Login successful.", "success");

      if (data.role === "customer") {
        navigate("/customerProducts");
      } else {
        navigate("/mainPage");
      }
    } catch (err) {
      const message = err.message || "Login failed";
      const normalizedMessage = message.toLowerCase();
      const isRejectedAdmin = normalizedMessage.includes("rejected");
      const isPendingApproval = normalizedMessage.includes("pending approval");
      const isEmailVerificationPending = normalizedMessage.includes("verify your email");
      const isDisabledUser = normalizedMessage.includes("temporarily disabled");
      const isRateLimited = err.status === 423 || err.status === 429;

      if (isRejectedAdmin || isPendingApproval || isEmailVerificationPending || isDisabledUser || isRateLimited) {
        showSnackbar(message, "warning", 4200);
      } else {
        showSnackbar("Login failed. Please check your credentials and try again.", "error");
        console.error(message);
      }
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="box-login">
        {isSubmitting ? (
          <div className="auth-loading">
            <img src={loadingGif} alt="Logging in" className="auth-loading-gif" />
            <p>Logging in...</p>
          </div>
        ) : (
          <>
            <h2>Login</h2>
            <form id="loginForm" onSubmit={handleSubmit}>
              <input
                type="email"
                id="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <input
                type="password"
                id="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <button type="submit">Login</button>
            </form>

            <p>
              <Link to="/forgot-password">Forgot password?</Link>
            </p>

            <p>
              New user? <Link to="/register">register</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
export default Login;
