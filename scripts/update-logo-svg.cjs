const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, '../frontend/public/cfr-mark.png');
const svgPath = path.join(__dirname, '../frontend/public/logo.svg');

const b = fs.readFileSync(pngPath).toString('base64');
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 182 195" width="182" height="195">
  <image href="data:image/png;base64,${b}" width="182" height="195" />
</svg>
`;

fs.writeFileSync(svgPath, svgContent);
console.log('Successfully updated frontend/public/logo.svg');

