import AuditLog from "../models/AuditLog.js";

export async function writeAudit(userId, action, details = null) {
  try {
    await AuditLog.create({
      user_id: userId ?? null,
      action,
      details: details ? JSON.stringify(details) : null
    });
  } catch (err) {
    console.error("audit log failed", action, err.message);
  }
}
