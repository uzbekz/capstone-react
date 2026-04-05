import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  deleteUser,
  getPendingAdminRequests,
  getProfile,
  getUsers,
  reviewAdminRequest,
  updateUserValidity
} from "../api";
import loadingGif from "../assets/loading.gif";
import { useSnackbar } from "../components/SnackbarProvider";
import "./AdminUsers.css";

function formatRole(role) {
  return role === "product_manager" ? "Admin" : "Customer";
}

function formatStatus(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatValidity(isValid) {
  return isValid ? "Active" : "Disabled";
}

function formatEmailVerification(emailVerified) {
  return emailVerified ? "Verified" : "Pending";
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-CA");
}

function AdminUsers() {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const activeTab = location.pathname.endsWith("/approvals") ? "approvals" : "users";
  const { showSnackbar } = useSnackbar();

  useEffect(() => {
    async function bootstrap() {
      try {
        const currentProfile = await getProfile();

        if (currentProfile.role !== "product_manager" || currentProfile.admin_status !== "approved") {
          navigate("/mainPage");
          return;
        }

        setProfile(currentProfile);

        const [allUsers, pendingUsers] = await Promise.all([
          getUsers(),
          getPendingAdminRequests()
        ]);

        setUsers(allUsers);
        setRequests(pendingUsers);
      } catch (err) {
        showSnackbar(err.message || "Failed to load user management", "error");
        console.error(err.message || "Failed to load user management");
        navigate("/mainPage");
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, [navigate]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
        const matchesSearch =
          !normalizedSearch ||
          user.email.toLowerCase().includes(normalizedSearch) ||
          formatRole(user.role).toLowerCase().includes(normalizedSearch) ||
          formatStatus(user.admin_status).toLowerCase().includes(normalizedSearch) ||
          formatEmailVerification(user.email_verified).toLowerCase().includes(normalizedSearch) ||
          formatValidity(user.isValid).toLowerCase().includes(normalizedSearch);

      return matchesRole && matchesSearch;
    });
  }, [roleFilter, search, users]);

  const stats = useMemo(() => {
    const adminCount = users.filter((user) => user.role === "product_manager").length;
    const customerCount = users.filter((user) => user.role === "customer").length;
    const pendingCount = users.filter((user) => user.admin_status === "pending").length;

    return {
      total: users.length,
      admins: adminCount,
      customers: customerCount,
      pending: pendingCount
    };
  }, [users]);

  async function handleDecision(userId, decision) {
    try {
      setBusyId(userId);
      await reviewAdminRequest(userId, decision);

      setRequests((prev) => prev.filter((user) => user.id !== userId));
      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId
            ? {
                ...user,
                admin_status: decision === "approve" ? "approved" : "rejected"
              }
            : user
        )
      );
      showSnackbar(
        decision === "approve" ? "User request approved." : "User request rejected.",
        "success"
      );
    } catch (err) {
      showSnackbar(err.message || "Failed to review request", "error");
      console.error(err.message || "Failed to review request");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(user) {
    const shouldDelete = window.confirm(`Remove the account for ${user.email}?`);
    if (!shouldDelete) {
      return;
    }

    try {
      setBusyId(user.id);
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((item) => item.id !== user.id));
      setRequests((prev) => prev.filter((item) => item.id !== user.id));
      showSnackbar("User account removed successfully.", "success");
    } catch (err) {
      showSnackbar(err.message || "Failed to remove user account", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleValidityToggle(user) {
    const nextIsValid = !user.isValid;
    const verb = nextIsValid ? "activate" : "disable";
    const shouldContinue = window.confirm(
      `Do you want to ${verb} the account for ${user.email}?`
    );

    if (!shouldContinue) {
      return;
    }

    try {
      setBusyId(user.id);
      await updateUserValidity(user.id, nextIsValid);
      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id
            ? {
                ...item,
                isValid: nextIsValid
              }
            : item
        )
      );
      setRequests((prev) =>
        prev.map((item) =>
          item.id === user.id
            ? {
                ...item,
                isValid: nextIsValid
              }
            : item
        )
      );
      showSnackbar(
        nextIsValid ? "User account activated successfully." : "User account disabled successfully.",
        "success"
      );
    } catch (err) {
      showSnackbar(err.message || "Failed to update account status", "error");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="user-admin-shell user-admin-loading-screen">
        <div className="user-admin-loading">
          <img src={loadingGif} alt="Loading users" className="user-admin-loading-gif" />
          <p>Loading user management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-admin-shell">
      <div className="user-admin-page">
        <div className="user-admin-tabs" role="tablist" aria-label="User management sections">
          <Link
            to="/adminUsers"
            className={`user-admin-tab ${activeTab === "users" ? "active" : ""}`}
          >
            Users
          </Link>
          <Link
            to="/adminUsers/approvals"
            className={`user-admin-tab ${activeTab === "approvals" ? "active" : ""}`}
          >
            Approvals
          </Link>
        </div>

        {activeTab === "users" ? (
          <>
            <section className="user-admin-hero">
              <div>
                <p className="user-admin-kicker">Products &rsaquo; Users</p>
                <h1>Users</h1>
                <p className="user-admin-copy">
                  Manage and review registered users from the users table.
                </p>
              </div>
              <div className="user-admin-hero-meta">
                <span>Signed in as {profile?.email}</span>
              </div>
            </section>

            <section className="user-admin-stats">
              <article className="user-admin-stat-card">
                <span>Total Visible Users</span>
                <strong>{stats.total}</strong>
              </article>
              <article className="user-admin-stat-card">
                <span>Admins</span>
                <strong>{stats.admins}</strong>
              </article>
              <article className="user-admin-stat-card">
                <span>Customers</span>
                <strong>{stats.customers}</strong>
              </article>
              <article className="user-admin-stat-card">
                <span>Pending Approvals</span>
                <strong>{stats.pending}</strong>
              </article>
            </section>

            <section className="user-admin-filters">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by email, role, or status..."
                aria-label="Search users"
              />

              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                aria-label="Filter users by role"
              >
                <option value="all">All Roles</option>
                <option value="product_manager">Admins</option>
                <option value="customer">Customers</option>
              </select>
            </section>

            <section className="user-admin-table-card">
              <div className="user-admin-card-header">
                <h2>Registered Users</h2>
              </div>

              <div className="user-admin-table-wrap">
                <table className="user-admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Email</th>
                      <th>Approval</th>
                      <th>Validity</th>
                      <th>Created On</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td>{user.id}</td>
                        <td>{user.email}</td>
                        <td>{formatRole(user.role)}</td>
                        <td>
                          <span className={`user-validity-badge ${user.email_verified ? "enabled" : "disabled"}`}>
                            {formatEmailVerification(user.email_verified)}
                          </span>
                        </td>
                        <td>
                          <span className={`user-status-badge ${user.admin_status}`}>
                            {formatStatus(user.admin_status)}
                          </span>
                        </td>
                        <td>
                          <span className={`user-validity-badge ${user.isValid ? "enabled" : "disabled"}`}>
                            {formatValidity(user.isValid)}
                          </span>
                        </td>
                        <td>{formatDate(user.created_at)}</td>
                        <td>
                          <div className="table-action-group compact">
                            {user.admin_status === "pending" ? (
                              <Link to="/adminUsers/approvals" className="table-action-link">
                                Review request
                              </Link>
                            ) : (
                              <span className="table-action-muted">No action needed</span>
                            )}
                            {user.id !== profile?.id ? (
                              <label className={`status-toggle ${busyId === user.id ? "busy" : ""}`}>
                                <input
                                  type="checkbox"
                                  checked={user.isValid}
                                  onChange={() => handleValidityToggle(user)}
                                  disabled={busyId === user.id}
                                />
                                <span className="status-toggle-slider"></span>
                                <span className="status-toggle-label">
                                  {user.isValid ? "Active" : "Disabled"}
                                </span>
                              </label>
                            ) : (
                              <span className="table-action-muted">Protected</span>
                            )}
                            {user.id !== profile?.id ? (
                              <button
                                type="button"
                                className="delete-user-button"
                                onClick={() => handleDelete(user)}
                                disabled={busyId === user.id}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan="8">
                          <div className="user-admin-empty-row">
                            No users matched the current search and filters.
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <>
            <section className="user-admin-hero">
              <div>
                <p className="user-admin-kicker">Products &rsaquo; Users &rsaquo; Approvals</p>
                <h1>User Approvals</h1>
                <p className="user-admin-copy">
                  Approve or reject newly registered users that are waiting for access.
                </p>
              </div>
            </section>

            <section className="user-admin-table-card">
              <div className="user-admin-card-header">
                <h2>Pending Registrations</h2>
              </div>

              <div className="user-admin-table-wrap">
                <table className="user-admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Email</th>
                      <th>Requested On</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((request) => (
                      <tr key={request.id}>
                        <td>{request.id}</td>
                        <td>{request.email}</td>
                        <td>{formatRole(request.role)}</td>
                        <td>
                          <span className={`user-validity-badge ${request.email_verified ? "enabled" : "disabled"}`}>
                            {formatEmailVerification(request.email_verified)}
                          </span>
                        </td>
                        <td>{formatDate(request.created_at)}</td>
                        <td>
                          <div className="approval-actions">
                            <button
                              type="button"
                              className="approve-button"
                              onClick={() => handleDecision(request.id, "approve")}
                              disabled={busyId === request.id || !request.email_verified}
                              title={!request.email_verified ? "User must verify email before approval" : "Approve user"}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="reject-button"
                              onClick={() => handleDecision(request.id, "reject")}
                              disabled={busyId === request.id}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {requests.length === 0 && (
                      <tr>
                        <td colSpan="6">
                          <div className="user-admin-empty-state">
                            <div className="empty-state-icon">+</div>
                            <h3>No pending registrations</h3>
                            <p>New sign-ups that need your approval will appear here.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminUsers;
