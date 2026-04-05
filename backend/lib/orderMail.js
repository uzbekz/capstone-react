import nodemailer from "nodemailer";

const hasSmtpConfig =
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  process.env.SMTP_FROM;

const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })
  : null;

export async function sendOrderEmail(to, subject, text, html) {
  if (!to) return;
  if (!transporter) {
    console.log(`[order-email] (no SMTP) to=${to} subject=${subject}\n${text}`);
    return;
  }
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      html: html || `<pre style="font-family:sans-serif">${text}</pre>`
    });
  } catch (err) {
    console.error("sendOrderEmail failed", err.message);
  }
}

export function orderPlacedBody(orderId, total) {
  const text = `Your order #${orderId} was placed successfully.\nTotal: Rs ${Number(total).toFixed(2)}\n\nWe will notify you when it ships.`;
  return { subject: `Order #${orderId} confirmed`, text };
}

export function orderDispatchedBody(orderId, etaMinutes) {
  const text = `Order #${orderId} has been dispatched.\nEstimated delivery in about ${etaMinutes} minutes.`;
  return { subject: `Order #${orderId} dispatched`, text };
}

export function orderCancelledBody(orderId) {
  const text = `Order #${orderId} has been cancelled.\nIf you did not request this, please contact support.`;
  return { subject: `Order #${orderId} cancelled`, text };
}

export function orderDeliveredBody(orderId) {
  const text = `Order #${orderId} has been successfully delivered!\nThank you for shopping with us!`;
  return { subject: `Order #${orderId} delivered!`, text };
}
