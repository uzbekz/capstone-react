import "./Login.css";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  async function handleSubmit(event) {
    event.preventDefault();

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

        alert("Login successful!");

        if (data.role === "customer") {
          navigate("/customerProducts");
        } else {
          navigate("/mainPage");
        }
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Network error :" + err.message);
    }
  }
  return (
    <div className="login-page">
      <div className="box-login">
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
          New user? <Link to="/register">register</Link>
        </p>
      </div>
    </div>
  );
}
export default Login;
