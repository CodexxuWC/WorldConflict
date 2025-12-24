// utils/mailer.js
import nodemailer from "nodemailer";

/**
 * Mailer configuration (reads env vars)
 */
const HOST = process.env.MAIL_HOST || process.env.SMTP_HOST || null;
const PORT = process.env.MAIL_PORT ? Number(process.env.MAIL_PORT) : (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587);
const SECURE = (process.env.MAIL_SECURE === 'true') || (PORT === 465);
const USER = process.env.MAIL_USER || process.env.SMTP_USER || null;
const PASS = process.env.MAIL_PASS || process.env.SMTP_PASS || null;

const DEFAULT_FROM = process.env.MAIL_FROM || process.env.EMAIL_FROM || `"WorldConflict" <no-reply@worldconflict.local>`;

/**
 * Fallback transporter used in dev when SMTP is not configured.
 * It matches the nodemailer interface enough for our uses (sendMail).
 */
function makeFallbackTransporter() {
  return {
    sendMail: async (opts) => {
      // Keep the payload readable in logs for debugging
      console.log("=== Email (dev fallback) ===");
      if (opts.from) console.log("From:", opts.from);
      console.log("To:", opts.to);
      console.log("Subject:", opts.subject);
      if (opts.text) console.log("Text:", opts.text);
      if (opts.html) console.log("HTML:", opts.html);
      console.log("============================");
      // Return shape similar to nodemailer (accepted array)
      return Promise.resolve({ accepted: [opts.to] });
    }
  };
}

/**
 * transporter: the active transport object (nodemailer Transporter or fallback)
 * We initialize it below based on env config.
 */
let transporter;

(function initTransporter() {
  if (HOST && USER && PASS) {
    try {
      transporter = nodemailer.createTransport({
        host: HOST,
        port: PORT,
        secure: SECURE,
        auth: {
          user: USER,
          pass: PASS,
        },
      });

      // verify transporter (best-effort) and log result
      transporter.verify()
        .then(() => console.log("Mailer: SMTP transporter ready"))
        .catch((e) => console.warn("Mailer: SMTP verify failed:", e && e.message ? e.message : e));
    } catch (e) {
      console.warn("Mailer: createTransport failed:", e);
      transporter = makeFallbackTransporter();
    }
  } else {
    // no SMTP config -> dev fallback
    transporter = makeFallbackTransporter();
  }
})();

/**
 * sendMail(opts)
 * Generic wrapper around transporter.sendMail.
 * opts: { from?, to, subject, text?, html? }
 * Ensures a sensible default `from` and returns the underlying promise.
 */
export async function sendMail(opts = {}) {
  if (!opts) throw new Error("sendMail: missing options");
  if (!opts.to) throw new Error("sendMail: missing 'to' field");

  // ensure from is set
  if (!opts.from) opts.from = DEFAULT_FROM;

  // transporter may be either nodemailer's transporter or fallback (with sendMail)
  return transporter.sendMail(opts);
}

/**
 * sendVerificationEmail(email, verifyUrl)
 * Convenience wrapper that composes a verification message and calls sendMail.
 */
export async function sendVerificationEmail(email, verifyUrl) {
  if (!email) throw new Error("sendVerificationEmail: missing email");
  const from = process.env.MAIL_FROM || process.env.EMAIL_FROM || DEFAULT_FROM;

  const mailOptions = {
    from,
    to: email,
    subject: "Vérifie ton email — WorldConflict",
    text: `Bienvenue sur WorldConflict !\nVérifie ton email : ${verifyUrl}`,
    html: `<div style="font-family: Arial, sans-serif;">
             <p>Bienvenue sur <strong>WorldConflict</strong> !</p>
             <p>Vérifie ton adresse email en cliquant sur le lien ci-dessous :</p>
             <p><a href="${verifyUrl}">${verifyUrl}</a></p>
           </div>`,
  };

  return sendMail(mailOptions);
}

/**
 * Exports:
 * - sendMail: generic wrapper
 * - sendVerificationEmail: convenience wrapper
 * - mailer: the underlying transporter object (useful if other modules expect it)
 * - default export for compatibility
 */
export const mailer = transporter;

export default {
  sendMail,
  sendVerificationEmail,
  mailer,
};
