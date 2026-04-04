import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import UserSession from "../models/UserSession.js";

const ACCESS_TOKEN_COOKIE = "access_token";
const ACCESS_TOKEN_ALGORITHM = "HS256";
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET must be set");
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.split(" ")[1];
}

function getAccessToken(req) {
  return req.cookies?.[ACCESS_TOKEN_COOKIE] || getBearerToken(req);
}

export async function authenticate(req, res, next) {
  const token = getAccessToken(req);

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [ACCESS_TOKEN_ALGORITHM]
    });

    const session = await UserSession.findByPk(decoded.sessionId);
    if (!session || session.revoked_at || new Date(session.expires_at) <= new Date()) {
      return res.status(401).json({ message: "Session expired or revoked" });
    }

    const user = await User.findByPk(decoded.sub);
    if (!user || !user.isValid) {
      return res.status(401).json({ message: "Account is unavailable" });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      admin_status: user.admin_status,
      isValid: user.isValid,
      sessionId: session.id
    };
    req.auth = decoded;
    req.session = session;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
}

export function hashToken(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
