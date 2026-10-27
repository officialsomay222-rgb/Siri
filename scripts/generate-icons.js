import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Master High-Resolution SVG with stunning Anime Companion & Cyberpunk Headset aesthetics
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradients -->
    <radialGradient id="bgGlow" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#1E293B" />
      <stop offset="60%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#07090E" />
    </radialGradient>
    <radialGradient id="cyanAura" cx="35%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#38BDF8" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="roseAura" cx="65%" cy="45%" r="50%">
      <stop offset="0%" stop-color="#F43F5E" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#F43F5E" stop-opacity="0" />
    </radialGradient>

    <!-- Neon Accents -->
    <linearGradient id="neonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="50%" stop-color="#818CF8" />
      <stop offset="100%" stop-color="#F43F5E" />
    </linearGradient>

    <linearGradient id="hairGradient" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#F1F5F9" />
      <stop offset="45%" stop-color="#BAE6FD" />
      <stop offset="85%" stop-color="#FBCFE8" />
      <stop offset="100%" stop-color="#FDA4AF" />
    </linearGradient>

    <linearGradient id="skinGradient" x1="30%" y1="0%" x2="70%" y2="100%">
      <stop offset="0%" stop-color="#FFF1F2" />
      <stop offset="100%" stop-color="#FFE4E6" />
    </linearGradient>

    <linearGradient id="visorGradient" x1="0%" y1="30%" x2="100%" y2="70%">
      <stop offset="0%" stop-color="#0284C7" stop-opacity="0.9" />
      <stop offset="50%" stop-color="#6366F1" stop-opacity="0.85" />
      <stop offset="100%" stop-color="#E11D48" stop-opacity="0.9" />
    </linearGradient>

    <!-- Drop Shadows & Glow Filters -->
    <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <filter id="strongGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="16" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <!-- Base Canvas / Squircle Background -->
  <rect width="512" height="512" rx="115" fill="url(#bgGlow)" />
  <rect width="512" height="512" rx="115" fill="url(#cyanAura)" />
  <rect width="512" height="512" rx="115" fill="url(#roseAura)" />

  <!-- Outer Cyber Border Ring -->
  <rect x="12" y="12" width="488" height="488" rx="103" fill="none" stroke="url(#neonGradient)" stroke-width="3" stroke-opacity="0.4" />

  <!-- Holographic Audio Wave Rings in Background -->
  <g opacity="0.25">
    <circle cx="256" cy="245" r="175" fill="none" stroke="#38BDF8" stroke-width="1.5" stroke-dasharray="8 6" />
    <circle cx="256" cy="245" r="195" fill="none" stroke="#F43F5E" stroke-width="1.5" stroke-dasharray="12 8" />
  </g>

  <!-- Anime Avatar Bust Composition -->
  <g id="avatarGroup">
    <!-- Back Hair Highlights -->
    <path d="M165 170 Q130 250 170 340 Q210 270 215 220 Z" fill="#0284C7" opacity="0.6" />
    <path d="M347 170 Q382 250 342 340 Q302 270 297 220 Z" fill="#E11D48" opacity="0.6" />

    <!-- Neck & Collar -->
    <path d="M228 290 L228 340 Q228 355 256 355 Q284 355 284 340 L284 290 Z" fill="#FECDD3" />
    <!-- Cyber Jacket / Shoulders -->
    <path d="M140 450 Q175 365 226 345 Q256 355 286 345 Q337 365 372 450 Q256 465 140 450 Z" fill="#0F172A" stroke="#334155" stroke-width="3" />
    <path d="M226 345 L256 400 L286 345" fill="none" stroke="url(#neonGradient)" stroke-width="4" stroke-linecap="round" />

    <!-- Face Silhouette -->
    <path d="M190 195 Q190 285 256 312 Q322 285 322 195 Q322 140 256 140 Q190 140 190 195 Z" fill="url(#skinGradient)" />

    <!-- Cute Anime Blush Marks -->
    <ellipse cx="218" cy="245" rx="14" ry="7" fill="#FB7185" opacity="0.45" />
    <ellipse cx="294" cy="245" rx="14" ry="7" fill="#FB7185" opacity="0.45" />

    <!-- Expressive Anime Eyes (Friendly, Cheerful Spark) -->
    <!-- Left Eye -->
    <path d="M210 215 Q224 205 238 217" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round" />
    <ellipse cx="225" cy="225" rx="7" ry="11" fill="#0284C7" />
    <circle cx="223" cy="221" r="3" fill="#FFFFFF" />
    <circle cx="227" cy="229" r="1.5" fill="#38BDF8" />

    <!-- Right Eye -->
    <path d="M274 217 Q288 205 302 215" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round" />
    <ellipse cx="287" cy="225" rx="7" ry="11" fill="#E11D48" />
    <circle cx="285" cy="221" r="3" fill="#FFFFFF" />
    <circle cx="289" cy="229" r="1.5" fill="#F43F5E" />

    <!-- Sweet Smile -->
    <path d="M246 264 Q256 273 266 264" fill="none" stroke="#E11D48" stroke-width="3.5" stroke-linecap="round" />

    <!-- Detailed Anime Bangs & Hair Strands -->
    <path d="M185 175 Q165 120 235 95 Q270 82 310 100 Q345 125 330 180 Q305 145 285 155 Q265 135 245 158 Q220 140 185 175 Z" fill="url(#hairGradient)" filter="url(#neonGlow)" />
    <!-- Front Dynamic Bangs -->
    <path d="M210 150 Q230 205 248 190 Q240 160 255 150 Q270 195 285 185 Q280 155 305 170" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.8" />

    <!-- Cyber Headphone Band -->
    <path d="M165 210 Q256 95 347 210" fill="none" stroke="#1E293B" stroke-width="14" stroke-linecap="round" />
    <path d="M175 200 Q256 108 337 200" fill="none" stroke="url(#neonGradient)" stroke-width="4" stroke-linecap="round" filter="url(#neonGlow)" />

    <!-- Left Cyber Ear Cup with Audio Neon -->
    <g transform="translate(142, 195)">
      <rect x="0" y="0" width="34" height="62" rx="14" fill="#0F172A" stroke="#38BDF8" stroke-width="3" />
      <!-- Frequency Bars -->
      <line x1="10" y1="20" x2="10" y2="42" stroke="#38BDF8" stroke-width="3" stroke-linecap="round" />
      <line x1="17" y1="14" x2="17" y2="48" stroke="#38BDF8" stroke-width="3" stroke-linecap="round" />
      <line x1="24" y1="24" x2="24" y2="38" stroke="#38BDF8" stroke-width="3" stroke-linecap="round" />
    </g>

    <!-- Right Cyber Ear Cup with Audio Neon -->
    <g transform="translate(336, 195)">
      <rect x="0" y="0" width="34" height="62" rx="14" fill="#0F172A" stroke="#F43F5E" stroke-width="3" />
      <!-- Frequency Bars -->
      <line x1="10" y1="24" x2="10" y2="38" stroke="#F43F5E" stroke-width="3" stroke-linecap="round" />
      <line x1="17" y1="14" x2="17" y2="48" stroke="#F43F5E" stroke-width="3" stroke-linecap="round" />
      <line x1="24" y1="20" x2="24" y2="42" stroke="#F43F5E" stroke-width="3" stroke-linecap="round" />
    </g>

    <!-- Headset Microphone Booming Arm -->
    <path d="M165 240 Q180 282 225 285" fill="none" stroke="#64748B" stroke-width="3.5" stroke-linecap="round" />
    <circle cx="227" cy="285" r="5" fill="#38BDF8" filter="url(#neonGlow)" />
  </g>

  <!-- Glowing AI Sparkle Stars -->
  <g fill="#FFFFFF" filter="url(#strongGlow)">
    <!-- Top-Right Sparkle -->
    <path d="M390 110 Q390 125 405 125 Q390 125 390 140 Q390 125 375 125 Q390 125 390 110 Z" fill="#F43F5E" />
    <path d="M390 115 Q390 125 400 125 Q390 125 390 135 Q390 125 380 125 Q390 125 390 115 Z" fill="#FFFFFF" />

    <!-- Bottom-Left Sparkle -->
    <path d="M120 370 Q120 382 132 382 Q120 382 120 394 Q120 382 108 382 Q120 382 120 370 Z" fill="#38BDF8" />
  </g>
</svg>`;

// 2. Maskable SVG with explicit 15% safe-zone margin (Android requirement)
const maskableSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="mBgGlow" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#1E293B" />
      <stop offset="60%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#07090E" />
    </radialGradient>
    <radialGradient id="mCyanAura" cx="40%" cy="45%" r="45%">
      <stop offset="0%" stop-color="#38BDF8" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#38BDF8" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="mRoseAura" cx="60%" cy="45%" r="45%">
      <stop offset="0%" stop-color="#F43F5E" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#F43F5E" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="mNeonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38BDF8" />
      <stop offset="50%" stop-color="#818CF8" />
      <stop offset="100%" stop-color="#F43F5E" />
    </linearGradient>
  </defs>

  <!-- Full-bleed background extending completely to corners for maskable clipping -->
  <rect width="512" height="512" fill="url(#mBgGlow)" />
  <rect width="512" height="512" fill="url(#mCyanAura)" />
  <rect width="512" height="512" fill="url(#mRoseAura)" />

  <!-- Centered Safe-Zone Content scaled down by 0.78 so outer 15% never clips -->
  <g transform="translate(56, 56) scale(0.78)">
    ${svgContent.replace(/<svg[^>]*>|<\/svg>/g, '')}
  </g>
</svg>`;

async function run() {
  console.log('Generating high-resolution PWA assets...');

  // Save base SVG
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent, 'utf8');
  console.log('Wrote public/icon.svg');

  // Convert to high-resolution PNGs via sharp
  const svgBuffer = Buffer.from(svgContent);
  const maskableSvgBuffer = Buffer.from(maskableSvgContent);

  // 1. 192x192 Standard PWA Icon
  await sharp(svgBuffer)
    .resize(192, 192)
    .png({ quality: 95, compressionLevel: 8 })
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('Generated public/pwa-192x192.png');

  // 2. 512x512 Standard PWA Icon
  await sharp(svgBuffer)
    .resize(512, 512)
    .png({ quality: 95, compressionLevel: 8 })
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('Generated public/pwa-512x512.png');

  // 3. 512x512 Maskable Icon for Android
  await sharp(maskableSvgBuffer)
    .resize(512, 512)
    .png({ quality: 95, compressionLevel: 8 })
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));
  console.log('Generated public/pwa-maskable-512x512.png');

  // 4. 180x180 Apple Touch Icon (Required for iOS Safari Add to Home Screen)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png({ quality: 95, compressionLevel: 8 })
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated public/apple-touch-icon.png');

  // 5. 32x32 Favicon PNG
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));
  console.log('Generated public/favicon-32x32.png');

  console.log('All PWA icons generated successfully!');
}

run().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
