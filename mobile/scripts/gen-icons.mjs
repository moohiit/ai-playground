// One-off icon generator. Requires `sharp` (install transiently with
// `npm i sharp --no-save`). Renders the app icon set from inline SVG.
import sharp from "sharp";
import { mkdirSync } from "fs";

const dir = "assets";
mkdirSync(dir, { recursive: true });

// Full app icon: brand gradient + a white "card" with a gold chip + wordmark.
const FONT = "Arial, 'Segoe UI', 'Helvetica Neue', Helvetica, sans-serif";
const iconSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="0.55" stop-color="#7c3aed"/>
      <stop offset="1" stop-color="#db2777"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <g transform="rotate(-7 512 392)">
    <rect x="266" y="214" width="492" height="316" rx="40" fill="#ffffff"/>
    <rect x="322" y="276" width="104" height="76" rx="14" fill="#fbbf24"/>
    <rect x="322" y="408" width="384" height="30" rx="15" fill="#c7d2fe"/>
    <rect x="322" y="456" width="248" height="24" rx="12" fill="#e5e7eb"/>
  </g>
  <text x="512" y="730" text-anchor="middle" font-family="${FONT}"
        font-size="150" font-weight="800" fill="#ffffff" letter-spacing="-2">Expense</text>
  <text x="512" y="872" text-anchor="middle" font-family="${FONT}"
        font-size="150" font-weight="800" fill="#ffffff" letter-spacing="-2">Tracker</text>
</svg>`;

// Android adaptive foreground / splash: same card, transparent bg, sized to
// sit inside the adaptive "safe zone" (centred, no tilt).
const glyphSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="none"/>
  <g>
    <rect x="272" y="392" width="480" height="300" rx="38" fill="#ffffff"/>
    <rect x="324" y="452" width="96" height="68" rx="12" fill="#fbbf24"/>
    <rect x="324" y="566" width="372" height="28" rx="14" fill="#c7d2fe"/>
    <rect x="324" y="608" width="236" height="22" rx="11" fill="#e5e7eb"/>
  </g>
</svg>`;

await sharp(Buffer.from(iconSvg)).resize(1024, 1024).png().toFile(`${dir}/icon.png`);
await sharp(Buffer.from(glyphSvg)).resize(1024, 1024).png().toFile(`${dir}/adaptive-icon.png`);
await sharp(Buffer.from(glyphSvg)).resize(1024, 1024).png().toFile(`${dir}/splash-icon.png`);
await sharp(Buffer.from(iconSvg)).resize(48, 48).png().toFile(`${dir}/favicon.png`);

console.log("icons written to assets/");
