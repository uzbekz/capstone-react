import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import './Register.css'

function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("customer");
  async function handleSubmit(event) {
    event.preventDefault();

    try {
      const res = await fetch("http://localhost:5000/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });

      const data = await res.json();

      if (res.ok) {
        // res is a Response object returned by fetch() //// res.ok is a boolean property on that object. It is true if the HTTP status code is in the 200–299 range (successful response). It is false otherwise (e.g., 400, 404, 500).
        alert("Registered successfully!");
        navigate("/");
      } else {
        alert(data.error || data.message);
      }
    } catch (err) {
      alert("Network error :" + err.message);
    }
  }
  return (
    <div className="register-container">
      <div className="box">
        <h2>Register</h2>
        <form id="registerForm" onSubmit={handleSubmit}>
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

          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="customer">Customer</option>
            <option value="product_manager">Product Manager</option>
          </select>

          <button type="submit">Register</button>
        </form>

        <p>
          Already have an account? <Link to="/">Login</Link>
        </p>
      </div>
    </div>
  );
}
export default Register;
