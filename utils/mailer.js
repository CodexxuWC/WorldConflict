import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export async function sendVerificationEmail(email, verifyUrl) {
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: "Vérifie ton email — WorldConflict",
    text: `Bienvenue sur WorldConflict !\nVérifie ton email : ${verifyUrl}`,
    html: `<div><p>Vérifie ton email : <a href="${verifyUrl}">${verifyUrl}</a></p></div>`
  });
}
