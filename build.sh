#!/bin/bash
set -e
# transpile JSX (classic runtime to match UMD React global)
node -e "const b=require('@babel/core'),fs=require('fs');fs.writeFileSync('app.compiled.js',b.transformSync(fs.readFileSync('app.jsx','utf8'),{presets:[['@babel/preset-react',{runtime:'classic'}]]}).code);"
# assemble single-file index.html
cat > _h.html << 'HEAD'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>VAYU-IQ · Air-Quality Intelligence Layer</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
HEAD
cat > _m.html << 'MID'
</style>
</head>
<body>
<div id="root">
  <div style="display:grid;place-items:center;height:100vh;color:#8a99ad;font-family:Inter,system-ui,sans-serif;background:#090d15">
    <div style="text-align:center">
      <div style="width:46px;height:46px;border-radius:10px;margin:0 auto 14px;display:grid;place-items:center;font-weight:800;font-size:20px;color:#001016;background:linear-gradient(135deg,#22d3ee,#0891b2)">वा</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#22d3ee">Booting VAYU-IQ…</div>
      <div style="font-size:12px;margin-top:6px">Fusing signals · attributing sources · forecasting</div>
    </div>
  </div>
</div>
<script>
MID
printf '</script>\n</body>\n</html>\n' > _f.html
cat _h.html styles.css _m.html app.compiled.js _f.html > index.html
rm _h.html _m.html _f.html
echo "built index.html ($(wc -c < index.html) bytes)"
