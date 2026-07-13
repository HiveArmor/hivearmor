const fs = require('fs');
const src = fs.readFileSync('/Users/encryptshell/GIT/UTMStack-11/frontend/dist/utm-stack/2.a089c677471763ea.js', 'utf8');

// Get more context around match 2 (at 56140)
const idx = 56140;
const ctx = src.slice(Math.max(0, idx - 600), idx + 800);
console.log(ctx);
