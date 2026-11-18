import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs'
import fs from 'fs'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' })
const p = await b.newPage()
for (const [f, w, h] of [['sheet', 1600, 1000], ['icon', 512, 512], ['logo-light', 620, 160], ['logo-dark', 620, 160]]) {
  await p.setViewportSize({ width: w, height: h })
  await p.setContent(`<html><body style="margin:0">${fs.readFileSync(`out/${f}.svg`, 'utf8')}</body></html>`)
  await p.waitForTimeout(150)
  await p.screenshot({ path: `out/${f}.png`, omitBackground: true })
}
await b.close()
