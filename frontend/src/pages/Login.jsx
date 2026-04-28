import "./Login.css";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import loadingGif from "../assets/loading.gif";
import { login } from "../api";
import { useSnackbar } from "../components/SnackbarProvider";
import { Button, Input } from "../components/UI";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
            <h2>Welcome Back</h2>
            <p>Sign in to your account to continue</p>
            <form id="loginForm" onSubmit={handleSubmit}>
              <Input
                id="email"
                type="email"
                label="Email Address"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                fullWidth
              />

              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                fullWidth
                className="password-input"
                rightIcon={(
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                )}
              />

              <Button 
                type="submit" 
                variant="primary" 
                size="lg" 
                loading={isSubmitting}
                fullWidth
              >
                Sign In
              </Button>
            </form>

            <div className="login-links">
              <p>Don't have an account? <Link to="/register">Sign up</Link></p>
              <p><Link to="/forgot-password">Forgot your password?</Link></p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
export default Login;
