const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.join(__dirname, '../public/generated/solo');

async function generateSoloTicketImage({ accessCode, issuedDate }) {
  // Çıkış klasörü yoksa oluştur
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const templatePath = path.join(__dirname, '../public/tickets/quantum_solo.png');
  const outputFileName = `${accessCode}.png`;
  const outputPath = path.join(OUTPUT_DIR, outputFileName);

  const svgOverlay = `
    <svg width="1080" height="720">
      <style>
        .code { fill: #00f5ff; font-size: 36px; font-family: 'Segoe UI', sans-serif; font-weight: bold; }
        .date { fill: #00f5ff; font-size: 24px; font-family: 'Segoe UI', sans-serif; }
      </style>
      <text x="50" y="470" class="code">ACCESS GRANT CODE: ${accessCode}</text>
      <text x="50" y="510" class="date">ISSUED: ${issuedDate}</text>
    </svg>
  `;

  try {
    await sharp(templatePath)
      .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
      .png()
      .toFile(outputPath);

    return outputPath; // başarıyla oluşturuldu
  } catch (err) {
    console.error('Ticket image generation error:', err);
    throw new Error('Ticket image generation failed');
  }
}

module.exports = { generateSoloTicketImage };
