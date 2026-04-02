import "./Login.css";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import loadingGif from "../assets/loading.gif";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("http://localhost:5000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("role", data.role);
        console.info("Login successful");

        if (data.role === "customer") {
          navigate("/customerProducts");
        } else {
          navigate("/mainPage");
        }
      } else {
        const message = data?.message || "Login failed";
        const normalizedMessage = message.toLowerCase();
        const isMissingAccount = normalizedMessage.includes("user not found");
        const isRejectedAdmin = normalizedMessage.includes("rejected");
        const isPendingApproval = normalizedMessage.includes("pending approval");
        const isDisabledUser = normalizedMessage.includes("temporarily disabled");

        if (isMissingAccount || isRejectedAdmin || isPendingApproval || isDisabledUser) {
          alert(message);
        } else {
          alert("Login failed. Please check your credentials and try again.");
          console.error(message);
        }
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error("Network error :" + err.message);
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
