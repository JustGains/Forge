/**
 * Regenerate assets/banner.svg from the canonical JustGains logo paths
 * (vendored in src/shared/assets/logo-paths.ts), so the banner always uses
 * the real brand marks rather than a redrawn approximation.
 *
 *   bun scripts/build-banner.ts
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  LOGO_ICON_PATH,
  LOGO_ICON_VIEWBOX,
  LOGO_TEXT_PATH,
  LOGO_TEXT_VIEWBOX,
} from '../src/shared/assets/logo-paths.ts'

const BRAND_YELLOW = '#FFD200'

// Wordmark tight bounds: x y width height from its viewBox.
const [textX, textY, textWidth, textHeight] = LOGO_TEXT_VIEWBOX.split(' ').map(Number) as [number, number, number, number]
const [, , iconWidth, iconHeight] = LOGO_ICON_VIEWBOX.split(' ').map(Number) as [number, number, number, number]

// Lockup: kettlebell icon + wordmark, scaled to a shared cap height.
const LOCKUP_HEIGHT = 44
const iconScale = LOCKUP_HEIGHT / iconHeight
const textScale = LOCKUP_HEIGHT / textHeight
const iconOutWidth = iconWidth * iconScale
const textOutWidth = textWidth * textScale
const GAP = 18
const lockupWidth = iconOutWidth + GAP + textOutWidth

const WIDTH = 1200
const HEIGHT = 190
const lockupLeft = (WIDTH - lockupWidth) / 2
const lockupTop = 46

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Forge, by JustGains">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0B0B0D"/>

  <!-- floor line -->
  <rect x="0" y="168" width="${WIDTH}" height="2" fill="#1C1C21"/>
  <rect x="0" y="170" width="${WIDTH}" height="20" fill="#101014"/>

  <!-- JustGains lockup: the real kettlebell icon and wordmark paths -->
  <g transform="translate(${lockupLeft.toFixed(1)},${lockupTop})">
    <g transform="scale(${iconScale.toFixed(4)})">
      <path d="${LOGO_ICON_PATH}" fill="${BRAND_YELLOW}"/>
    </g>
    <g transform="translate(${(iconOutWidth + GAP).toFixed(1)},0) scale(${textScale.toFixed(4)}) translate(${(-textX).toFixed(2)},${(-textY).toFixed(2)})">
      <path d="${LOGO_TEXT_PATH}" fill="#FFFFFF"/>
    </g>
  </g>

  <!-- tagline -->
  <g font-family="'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif" text-anchor="middle">
    <text x="${WIDTH / 2}" y="136" font-size="24" font-weight="500" letter-spacing="1.5" fill="#9A9AA3">the JustGains workout generator, on the athlete's device</text>
  </g>
</svg>
`

const target = join(dirname(fileURLToPath(import.meta.url)), '../assets/banner.svg')
writeFileSync(target, svg)
console.log(`banner written: ${target}`)
