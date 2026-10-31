const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../docs/cfr-os-design-system.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const logoMatch = html.match(/--logo:url\("data:image\/png;base64,([^"]+)"\)/);
if (logoMatch) {
  const buf = Buffer.from(logoMatch[1], 'base64');
  fs.writeFileSync(path.join(__dirname, '../assets/cfr-logo.png'), buf);
  fs.writeFileSync(path.join(__dirname, '../frontend/public/cfr-logo.png'), buf);
  console.log('Saved cfr-logo.png, bytes:', buf.length);
} else {
  console.log('logoMatch not found');
}

const iconMatch = html.match(/--icon:url\("data:image\/png;base64,([^"]+)"\)/);
if (iconMatch) {
  const buf = Buffer.from(iconMatch[1], 'base64');
  fs.writeFileSync(path.join(__dirname, '../assets/cfr-mark.png'), buf);
  fs.writeFileSync(path.join(__dirname, '../frontend/public/cfr-mark.png'), buf);
  console.log('Saved cfr-mark.png, bytes:', buf.length);
} else {
  console.log('iconMatch not found');
}
