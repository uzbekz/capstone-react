import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import loadingGif from "../assets/loading.gif";
import "./Register.css";

function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("customer");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("http://localhost:5000/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role })
      });

      const data = await res.json();

      if (res.ok) {
        console.info("Registered successfully");
        navigate("/");
      } else {
        const message = data?.error || data?.message || "Registration failed";
        const isDuplicateAccount =
          message.toLowerCase().includes("already registered") ||
          message.toLowerCase().includes("duplicate");

        if (isDuplicateAccount) {
          alert(message);
        } else {
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
    <div className="register-container">
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

              <input
                type="password"
                id="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />

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
    </div>
  );
}

export default Register;
