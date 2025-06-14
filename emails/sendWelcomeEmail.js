const { Resend } = require('resend');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const resend = new Resend(process.env.RESEND_API_KEY);

const TICKET_IMAGE_PATH = path.resolve('public/tickets/quantum_solo.png');

async function generateTicketImage(accessGrantCode, issuedDate) {
  const image = sharp(TICKET_IMAGE_PATH);
  const textColor = "#00f5ff";

  const svgText = `
  <svg width="800" height="400">
    <style>
      .code { fill: ${textColor}; font-size: 32px; font-weight: bold; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
      .issued { fill: ${textColor}; font-size: 24px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    </style>
    <text x="50" y="150" class="code">ACCESS GRANT CODE: ${accessGrantCode}</text>
    <text x="50" y="250" class="issued">ISSUED: ${issuedDate}</text>
  </svg>`;

  const svgBuffer = Buffer.from(svgText);

  return await image
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

async function sendWelcomeEmail({ to, accessGrantCode, issuedDate, inviteLink }) {
  const ticketImageBuffer = await generateTicketImage(accessGrantCode, issuedDate);

  const htmlTemplatePath = path.resolve("emails/welcome.html");
  let htmlContent = await fs.readFile(htmlTemplatePath, "utf-8");

  htmlContent = htmlContent
    .replace("{{ACCESS_GRANT_CODE}}", accessGrantCode)
    .replace("{{INVITE_LINK}}", inviteLink);

  await resend.emails.send({
    from: "Deepelynx Quantum Labs <noreply@deepelynx.io>",
    to,
    subject: "Welcome to Deepelynx Quantum Labs! Your Access Grant Inside",
    html: htmlContent,
    attachments: [
      {
        content: ticketImageBuffer.toString("base64"),
        filename: "quantum_solo_ticket.png",
        type: "image/png",
        disposition: "inline",
        content_id: "ticketimage",
      },
    ],
  });
}

module.exports = sendWelcomeEmail;
