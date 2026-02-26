const BASE_URL = "http://localhost:5000";

function getAuthHeader() {
  const token = localStorage.getItem("token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

async function handleResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : null;

  if (!res.ok) {
    const message = data?.error || data?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}

export async function getProducts() {
  const res = await fetch(`${BASE_URL}/products`);
  return await handleResponse(res);
}

export async function getProductById(id) {
  const res = await fetch(`${BASE_URL}/products/${id}`);
  return await handleResponse(res);
}


export async function addProduct(formData) {
  const res = await fetch(`${BASE_URL}/products/add`, {
    method: "POST",
    headers: {
      ...getAuthHeader()
    },
    body: formData
  });

  return await handleResponse(res);
}

export async function deleteProduct(id) {
  const res = await fetch(`${BASE_URL}/products/${id}`, {
    method: "DELETE",
    headers: {
      ...getAuthHeader()
    }
  });
  return await handleResponse(res);
}

export async function updateProduct(id, payload) {
  const isFormData = payload instanceof FormData;
  const res = await fetch(`${BASE_URL}/products/${id}`, {
    method: "PUT",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...getAuthHeader()
    },
    body: isFormData ? payload : JSON.stringify(payload)
  });
  return await handleResponse(res);
}

export async function getFilteredProducts({ search, category, sort }) {
  const params = new URLSearchParams();

  if (search) params.append("search", search);
  if (category) params.append("category", category);
  if (sort) params.append("sort", sort);

  const res = await fetch(`http://localhost:5000/products?${params}`);
  return await res.json();
}

// ---------------- cart helpers ----------------
export async function getCart() {
  const res = await fetch(`${BASE_URL}/cart`, {
    headers: { ...getAuthHeader() }
  });
  return await res.json();
}

export async function addToCartRequest(product_id, quantity) {
  const res = await fetch(`${BASE_URL}/cart`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ product_id, quantity })
  });
  return await res.json();
}

export async function updateCartItem(id, quantity) {
  const res = await fetch(`${BASE_URL}/cart/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ quantity })
  });
  return await res.json();
}

export async function removeCartItem(id) {
  const res = await fetch(`${BASE_URL}/cart/${id}`, {
    method: "DELETE",
    headers: { ...getAuthHeader() }
  });
  return await res.json();
}

export async function clearCartRequest() {
  const res = await fetch(`${BASE_URL}/cart`, {
    method: "DELETE",
    headers: { ...getAuthHeader() }
  });
  return await res.json();
}

// ----- dashboard/report endpoints for product managers -----
export async function getDashboardReports() {
  const res = await fetch(`${BASE_URL}/reports/overview`, {
    headers: { ...getAuthHeader() }
  });
  return await res.json();
}

// profile
export async function getProfile() {
  const res = await fetch(`${BASE_URL}/users/me`, {
    headers: { ...getAuthHeader() }
  });
  return await handleResponse(res);
}

// orders
export async function getOrderDetails(orderId) {
  const res = await fetch(`${BASE_URL}/orders/${orderId}`, {
    headers: { ...getAuthHeader() }
  });
  return await res.json();
}

export async function cancelOrderRequest(orderId) {
  const res = await fetch(`${BASE_URL}/orders/${orderId}/cancel`, {
    method: "PATCH",
    headers: { ...getAuthHeader() }
  });
  return await res.json();
}

// ----- primary admin approval helpers -----
export async function getPendingAdminRequests() {
  const res = await fetch(`${BASE_URL}/auth/admin-requests`, {
    headers: { ...getAuthHeader() }
  });
  return await handleResponse(res);
}

export async function reviewAdminRequest(userId, decision) {
  const res = await fetch(`${BASE_URL}/auth/admin-requests/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ decision })
  });
  return await handleResponse(res);
}
