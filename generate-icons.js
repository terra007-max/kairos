const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const svgContent = fs.readFileSync(path.join(__dirname, 'public', 'icon.svg'), 'utf-8')

async function generateIcon(size, filename, maskable = false) {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // For maskable: add extra safe-zone padding (icons need ~10% padding on all sides)
  const padding = maskable ? Math.round(size * 0.1) : 0
  const innerSize = size - padding * 2

  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${size}px; height: ${size}px;
    background: ${maskable ? '#09090b' : 'transparent'};
    display: flex; align-items: center; justify-content: center;
  }
  img { width: ${innerSize}px; height: ${innerSize}px; display: block; }
</style>
</head>
<body>
  <img src="data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}" />
</body>
</html>`

  await page.setViewportSize({ width: size, height: size })
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.screenshot({
    path: path.join(__dirname, 'public', filename),
    clip: { x: 0, y: 0, width: size, height: size },
    omitBackground: !maskable,
  })

  await browser.close()
  console.log(`✓ ${filename} (${size}×${size})`)
}

;(async () => {
  await generateIcon(192, 'icon-192.png', false)
  await generateIcon(192, 'icon-192-maskable.png', true)
  await generateIcon(512, 'icon-512.png', false)
  await generateIcon(512, 'icon-512-maskable.png', true)
  console.log('All icons generated.')
})()
