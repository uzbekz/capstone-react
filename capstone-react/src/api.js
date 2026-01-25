const BASE_URL = "http://localhost:5000";

function getAuthHeader() {
  const token = localStorage.getItem("token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

export async function getProducts() {
  const res = await fetch(`${BASE_URL}/products`);
  return await res.json();
}

export async function getProductById(id) {
  const res = await fetch(`${BASE_URL}/products/${id}`);
  return await res.json();
}

// PROTECTED (Product Manager
export async function addProduct(formData) {
  const res = await fetch(`${BASE_URL}/products/add`, {
    method: "POST",
    headers: {
      ...getAuthHeader()
    },
    body: formData
  });

  return await res.json();
}

export async function deleteProduct(id) {
  await fetch(`${BASE_URL}/products/${id}`, {
    method: "DELETE",
    headers: {
      ...getAuthHeader()
    }
  });
}

export async function updateProduct(id, formData) {
  await fetch(`${BASE_URL}/products/${id}`, {
    method: "PUT",
    headers: {
      ...getAuthHeader()
    },
    body: formData
  });
}

export async function getFilteredProducts({ search, category, sort }) {
  const params = new URLSearchParams();

  if (search) params.append("search", search);
  if (category) params.append("category", category);
  if (sort) params.append("sort", sort);

  const res = await fetch(`http://localhost:5000/products?${params}`);
  return await res.json();
}
