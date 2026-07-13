const fs = require('fs');
const src = fs.readFileSync('/Users/encryptshell/GIT/UTMStack-11/frontend/dist/utm-stack/main.js', 'utf8');

// Find the standalone formControl write - in the unoptimized build the 
// component name is readable
// _setUpStandalone calls fs(this.control, this, ...)
// fs = the writeValue caller

// Find ALL ngOnChanges that call _setUpControl (which calls _setUpStandalone)
// The pattern in unoptimized: ngOnChanges(changes) { ... this._setUpControl() }
// preceded by class declaration

// Search for 'formControl' as a bound property name
const matches = [];
let idx = 0;
while ((idx = src.indexOf('[formControl]', idx + 1)) !== -1) {
  matches.push({ pos: idx, ctx: src.slice(Math.max(0, idx-100), idx+200) });
  if (matches.length > 20) break;
}

console.log('Found [formControl] usages:', matches.length);
matches.forEach((m, i) => {
  console.log(`\n--- Match ${i+1} at ${m.pos} ---`);
  console.log(m.ctx);
});
