// generateSoloTicket.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, 'public', 'tickets', 'quantum_solo.png');
const OUTPUT_DIR = path.join(__dirname, 'public', 'generated_tickets');
const accessCode = 'SOLOABC123';
const issuedDate = new Date().toISOString().split('T')[0]; // örnek: 2025-06-14
const outputFileName = `solo_${accessCode.toLowerCase()}.png`;
const outputPath = path.join(OUTPUT_DIR, outputFileName);

async function generateTicket() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const image = sharp(INPUT_PATH);
  const metadata = await image.metadata();

  const svgOverlay = `
    <svg width="${metadata.width}" height="${metadata.height}">
      <style>
        .text { fill: #00f5ff; font-size: 36px; font-family: 'Segoe UI', sans-serif; font-weight: bold; }
      </style>
      <text x="50" y="${metadata.height - 160}" class="text">ACCESS GRANT CODE: ${accessCode}</text>
      <text x="50" y="${metadata.height - 100}" class="text">ISSUED: ${issuedDate}</text>
    </svg>
  `;

  await image
    .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
    .toFile(outputPath);

  console.log(`✅ Ticket created: ${outputPath}`);
}

generateTicket().catch(err => console.error('Error generating ticket:', err));
