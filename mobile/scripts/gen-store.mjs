// Generates Play Store listing graphics into assets/play/.
// Run: npm i sharp --no-save && node scripts/gen-store.mjs
import sharp from "sharp";
import { mkdirSync } from "fs";

mkdirSync("assets/play", { recursive: true });
const FONT = "Arial, 'Segoe UI', 'Helvetica Neue', Helvetica, sans-serif";

// 1) 512x512 app icon — reuse the app icon design.
await sharp("assets/icon.png").resize(512, 512).png().toFile("assets/play/icon-512.png");

// 2) 1024x500 feature graphic — wordmark + tagline on the left, card on the right.
const feature = `
<svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="0.55" stop-color="#7c3aed"/>
      <stop offset="1" stop-color="#db2777"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#g)"/>
  <!-- card on the right -->
  <g transform="rotate(-8 800 250)">
    <rect x="636" y="150" width="330" height="210" rx="26" fill="#ffffff"/>
    <rect x="672" y="188" width="70" height="50" rx="10" fill="#fbbf24"/>
    <rect x="672" y="270" width="258" height="20" rx="10" fill="#c7d2fe"/>
    <rect x="672" y="302" width="170" height="16" rx="8" fill="#e5e7eb"/>
  </g>
  <!-- wordmark + tagline on the left -->
  <text x="64" y="210" font-family="${FONT}" font-size="80" font-weight="800" fill="#ffffff" letter-spacing="-2">Expense</text>
  <text x="64" y="300" font-family="${FONT}" font-size="80" font-weight="800" fill="#ffffff" letter-spacing="-2">Tracker</text>
  <text x="66" y="358" font-family="${FONT}" font-size="30" font-weight="500" fill="#ffffff" opacity="0.9">Split bills · Scan receipts · Smart reports</text>
</svg>`;
await sharp(Buffer.from(feature)).resize(1024, 500).png().toFile("assets/play/feature-1024x500.png");

console.log("store graphics written to assets/play/");
