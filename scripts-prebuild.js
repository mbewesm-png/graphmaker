// Copies SheetJS from node_modules into app/ and points index.html at it (offline Excel support).
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js');
fs.copyFileSync(src, path.join(__dirname, 'app', 'xlsx.full.min.js'));
const f = path.join(__dirname, 'app', 'index.html');
let h = fs.readFileSync(f, 'utf8');
h = h.replace(/<script src="https:\/\/cdnjs[^"]*xlsx[^"]*"[^>]*><\/script>/, '<script src="xlsx.full.min.js"></script>');
fs.writeFileSync(f, h);
console.log('SheetJS bundled locally');
