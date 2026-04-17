const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const ACCESS_TOKEN_STORAGE_KEY = "access_token";

function redirectToLogin() {
  if (typeof window !== "undefined" && window.location.pathname !== "/") {
    window.location.href = "/";
  }
}

function getStoredAccessToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || "";
}

function setStoredAccessToken(token) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  } else {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  }
}

function getCookie(name) {
  const cookie = document.cookie
    .split("; ")
    .find((value) => value.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
}

async function handleResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : null;

  if (!res.ok) {
    const message = data?.error || data?.message || `Request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function refreshSession() {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include"
  });

  const data = await handleResponse(res);
  setStoredAccessToken(data?.accessToken || "");
  return data;
}

async function request(path, options = {}, retry = true) {
  const method = options.method || "GET";
  const headers = new Headers(options.headers || {});
  const accessToken = getStoredAccessToken();

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
    const csrfToken = getCookie("csrf_token");
    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    try {
      await refreshSession();
      return request(path, options, false);
    } catch (error) {
      redirectToLogin();
      throw error;
    }
  }

  if (res.status === 401 && !path.startsWith("/auth/")) {
    redirectToLogin();
  }

  return handleResponse(res);
}

export async function login(email, password) {
  const data = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  setStoredAccessToken(data?.accessToken || "");
  return data;
}

export async function register(payload) {
  return request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function verifyEmail(token) {
  return request("/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
}

export async function resendVerification(email) {
  return request("/auth/resend-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
}

export async function requestPasswordReset(email) {
  return request("/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
}

export async function resetPassword(token, newPassword) {
  return request("/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword })
  });
}

export async function logout() {
  try {
    return await request("/auth/logout", {
      method: "POST"
    });
  } finally {
    setStoredAccessToken("");
  }
}

export async function getProducts() {
  return request("/products");
}

export async function getProductById(id) {
  return request(`/products/${id}`);
}

export async function addProduct(formData) {
  return request("/products/add", {
    method: "POST",
    body: formData
  });
}

export async function deleteProduct(id) {
  return request(`/products/${id}`, {
    method: "DELETE"
  });
}

export async function updateProduct(id, payload) {
  const isFormData = payload instanceof FormData;
  return request(`/products/${id}`, {
    method: "PUT",
    headers: isFormData ? undefined : { "Content-Type": "application/json" },
    body: isFormData ? payload : JSON.stringify(payload)
  });
}

export async function getFilteredProducts({ search, category, sort }) {
  const params = new URLSearchParams();

  if (search) params.append("search", search);
  if (category) params.append("category", category);
  if (sort) params.append("sort", sort);

  return request(`/products?${params.toString()}`);
}

export async function getCart() {
  return request("/cart");
}

export async function addToCartRequest(product_id, quantity) {
  return request("/cart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id, quantity })
  });
}

export async function updateCartItem(id, quantity) {
  return request(`/cart/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quantity })
  });
}

export async function removeCartItem(id) {
  return request(`/cart/${id}`, {
    method: "DELETE"
  });
}

export async function clearCartRequest() {
  return request("/cart", {
    method: "DELETE"
  });
}

export async function createOrder(items, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }
  return request("/orders", {
    method: "POST",
    headers,
    body: JSON.stringify({
      items,
      ship_line1: options.ship_line1,
      ship_city: options.ship_city,
      ship_postal: options.ship_postal,
      ship_country: options.ship_country
    })
  });
}

export async function getCustomerOrders() {
  return request("/orders");
}

export async function getPublicSettings() {
  return request("/public-settings");
}

export async function getAllOrders(page = 1, limit = 20, dateFrom = null, dateTo = null, status = null, email = null) {
  const params = new URLSearchParams({ page, limit });
  if (dateFrom) params.append("dateFrom", dateFrom);
  if (dateTo)   params.append("dateTo", dateTo);
  if (status)   params.append("status", status);
  if (email)    params.append("email", email);
  return request(`/orders/all?${params.toString()}`);
}

export async function dispatchOrderRequest(orderId) {
  return request(`/orders/${orderId}/dispatch`, {
    method: "PATCH"
  });
}

export async function bulkDispatchOrdersRequest() {
  return request("/orders/bulk-dispatch", {
    method: "PATCH"
  });
}

export async function bulkCancelOrdersRequest() {
  return request("/orders/bulk-cancel", {
    method: "PATCH"
  });
}

export async function getDashboardReports() {
  return request("/reports/overview");
}

export async function getAuditLog(limit = 50) {
  return request(`/reports/audit-log?limit=${limit}`);
}

export async function downloadAdminCsv(path, filename) {
  const res = await fetch(`${BASE_URL}${path}`, { credentials: "include" });
  if (!res.ok) {
    const err = new Error(`Export failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function getProfile() {
  return request("/users/me");
}

export async function updateProfileAddress(payload) {
  return request("/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function getWishlist() {
  return request("/wishlist");
}

export async function addWishlistItem(productId) {
  return request("/wishlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: productId })
  });
}

export async function removeWishlistItem(productId) {
  return request(`/wishlist/${productId}`, {
    method: "DELETE"
  });
}

export async function getUsers() {
  return request("/users");
}

export async function deleteUser(userId) {
  return request(`/users/${userId}`, {
    method: "DELETE"
  });
}

export async function updateUserValidity(userId, isValid) {
  return request(`/users/${userId}/validity`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isValid })
  });
}

export async function getAppSettings() {
  return request("/settings");
}

export async function updateAppSettings(payload) {
  return request("/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function getOrderDetails(orderId) {
  return request(`/orders/${orderId}`);
}

export async function cancelOrderRequest(orderId, internalNote) {
  return request(`/orders/${orderId}/cancel`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      internalNote != null && internalNote !== ""
        ? { internal_note: internalNote }
        : {}
    )
  });
}

export async function returnOrderRequest(orderId) {
  return request(`/orders/${orderId}/return`, {
    method: "PATCH"
  });
}

export async function getPendingAdminRequests() {
  return request("/auth/admin-requests");
}

export async function reviewAdminRequest(userId, decision) {
  return request(`/auth/admin-requests/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision })
  });
}
