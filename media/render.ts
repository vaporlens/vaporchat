/**
 * Renders the store screenshots and Play's feature graphic and icon from the captures in
 * `captures/`: each slide is an SVG (caption over the brand gradient, the capture below it)
 * exported by Inkscape, then flattened by ImageMagick, as both stores reject alpha.
 *
 * Run from the repo root: `bun media/render.ts`. Needs `inkscape`, `magick`, `oxipng` and the
 * Inter Display font.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const MEDIA = resolve(import.meta.dir);
const ICON = resolve(MEDIA, '../packages/mobile/assets/icon.png');

type Slide = {
  name: string;
  capture: string;
  /** one string per line, broken by hand so every size wraps the same */
  title: string[];
  subtitle: string[];
  /** where a capture taller than the slide is cut: its bottom (default) or its top */
  keep?: 'top' | 'bottom';
};

/** In store order: the first three show in App Store search results. */
const SLIDES: Slide[] = [
  {
    name: 'vaporlens',
    capture: 'vaporlens',
    title: ['Game reviews', 'at a glance'],
    subtitle: ['VaporLens sums up what players say'],
  },
  {
    name: 'voice-chat',
    capture: 'voice-chat',
    title: ['Steam voice chat', 'on your phone'],
    subtitle: ['Join voice channels and call friends'],
    // the call controls are at the bottom
    keep: 'bottom',
  },
  {
    name: 'review-points',
    capture: 'review-points',
    title: ['What players love', 'and what they don’t'],
    subtitle: ['Gameplay and performance, from reviews'],
  },
  {
    name: 'game-page',
    capture: 'game-page',
    title: ['A fully native', 'Steam experience'],
    subtitle: ['Smooth and fast, built for your phone'],
  },
  {
    name: 'releases',
    capture: 'releases',
    title: ['Find your', 'next game'],
    subtitle: ['New releases, hubs and tags'],
  },
  {
    name: 'events',
    capture: 'events',
    title: ['News and events', 'from your games'],
    subtitle: ['Plus what your friends play'],
  },
];

type Size = {
  dir: string;
  width: number;
  height: number;
};

const SIZES: Size[] = [
  { dir: 'app-store/iphone-6.3', width: 1206, height: 2622 },
  { dir: 'play-store/phone', width: 1080, height: 1920 },
];

const BACKGROUND = `
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#06bfff"/>
    <stop offset="0.5" stop-color="#2d73ff"/>
    <stop offset="0.85" stop-color="#2853c9"/>
    <stop offset="1" stop-color="#1b2838"/>
  </linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="24" stdDeviation="36" flood-color="#0b1730" flood-opacity="0.55"/>
  </filter>`;

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function lines(
  texts: string[],
  y: number,
  size: number,
  weight: number,
  color: string,
  x: number,
) {
  return texts
    .map(
      (text, i) =>
        `<text x="${x}" y="${y + i * size * 1.12}" text-anchor="middle" font-family="Inter Display" font-weight="${weight}" font-size="${size}" fill="${color}">${escape(text)}</text>`,
    )
    .join('\n');
}

function slideSvg(slide: Slide, size: Size, capture: string) {
  const { width: w, height: h } = size;
  const short = Math.min(w, h * 0.56);
  const titleSize = Math.round(short * 0.086);
  const subtitleSize = Math.round(short * 0.042);
  const titleTop = Math.round(short * 0.1) + titleSize;
  const subtitleTop =
    titleTop + (slide.title.length - 1) * titleSize * 1.12 + subtitleSize * 2.3;
  const shotTop = Math.round(
    subtitleTop +
      (slide.subtitle.length - 1) * subtitleSize * 1.12 +
      short * 0.08,
  );
  // the whole capture when it fits at a readable width, else cut by the slide's edge or `keep`
  // the captures' size, the emulator's 1080×2400 without its status and navigation bars
  const aspect = 2274 / 1080;
  const fitWidth = (h - shotTop - short * 0.07) / aspect;
  const shotWidth = Math.round(
    Math.max(Math.min(fitWidth, w * 0.84), w * 0.8),
  );
  const fullHeight = Math.round(shotWidth * aspect);
  const keepBottom = slide.keep === 'bottom';
  const shotHeight = keepBottom
    ? Math.min(fullHeight, Math.round(h - shotTop - short * 0.07))
    : fullHeight;
  const shotX = Math.round((w - shotWidth) / 2);
  const radius = Math.round(shotWidth * 0.06);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}">
<defs>${BACKGROUND}
  <clipPath id="shot"><rect x="${shotX}" y="${shotTop}" width="${shotWidth}" height="${shotHeight}" rx="${radius}"/></clipPath>
</defs>
<rect width="${w}" height="${h}" fill="url(#bg)"/>
${lines(slide.title, titleTop, titleSize, 800, '#ffffff', w / 2)}
${lines(slide.subtitle, subtitleTop, subtitleSize, 500, '#ffffff', w / 2)}
<rect x="${shotX}" y="${shotTop}" width="${shotWidth}" height="${shotHeight}" rx="${radius}" fill="#171d25" filter="url(#shadow)"/>
<image x="${shotX}" y="${shotTop}" width="${shotWidth}" height="${shotHeight}" clip-path="url(#shot)" preserveAspectRatio="xMidY${keepBottom ? 'Max' : 'Min'} slice" xlink:href="file://${capture}"/>
<rect x="${shotX}" y="${shotTop}" width="${shotWidth}" height="${shotHeight}" rx="${radius}" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="${Math.max(2, Math.round(w / 600))}"/>
</svg>`;
}

// vaporlens.app's headline
const TAGLINE = 'Is this Steam game worth it?';

/** A capture as a rounded phone screen, with its own clip `id`. */
function phone(id: string, capture: string, x: number, y: number, width: number) {
  const height = Math.round((width * 2274) / 1080);
  const radius = Math.round(width * 0.06);
  const box = `x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}"`;
  return `<clipPath id="${id}"><rect ${box}/></clipPath>
<rect ${box} fill="#171d25" filter="url(#shadow)"/>
<image x="${x}" y="${y}" width="${width}" height="${height}" clip-path="url(#${id})" preserveAspectRatio="xMidYMin slice" xlink:href="file://${join(MEDIA, 'captures/phone', `${capture}.png`)}"/>
<rect ${box} fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="${Math.max(2, Math.round(width / 150))}"/>`;
}

function icon(x: number, y: number, size: number) {
  const box = `x="${x}" y="${y}" width="${size}" height="${size}" rx="${Math.round(size * 0.23)}"`;
  return `<clipPath id="icon"><rect ${box}/></clipPath>
<rect ${box} fill="#2d73ff" filter="url(#shadow)"/>
<image x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#icon)" xlink:href="file://${ICON}"/>`;
}

function text(x: number, y: number, size: number, weight: number, content: string, anchor = 'start') {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Inter Display" font-weight="${weight}" font-size="${size}" fill="#ffffff">${escape(content)}</text>`;
}

function canvas(width: number, height: number, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}">
<defs>${BACKGROUND}</defs>
<rect width="${width}" height="${height}" fill="url(#bg)"/>
${body}
</svg>`;
}

/** Play's 1024×500 banner: the icon, name and tagline, and a peek at VaporLens. */
function featureGraphicSvg() {
  return canvas(
    1024,
    500,
    `${icon(72, 100, 128)}
${text(68, 330, 88, 800, 'Vaporlens')}
${text(72, 388, 38, 600, TAGLINE)}
${phone('shot', 'vaporlens', 640, 56, 300)}`,
  );
}

/**
 * App Store product page header, 3840×1646. Apple's templates keep text in a centered
 * 1646×661 safe area, the sides are cropped on narrow screens: the tagline there, phones around it.
 */
function appStoreHeaderSvg() {
  return canvas(
    3840,
    1646,
    `${phone('a', 'game-page', 120, 380, 480)}
${phone('b', 'vaporlens', 590, 230, 480)}
${phone('c', 'voice-chat', 2770, 230, 480)}
${phone('d', 'releases', 3240, 380, 480)}
${text(1920, 800, 160, 800, 'Is this Steam game', 'middle')}
${text(1920, 980, 160, 800, 'worth it?', 'middle')}`,
  );
}

/**
 * App Store search results card, 3840×2560. Apple's templates keep text in a centered
 * 2168×1030 safe area: icon, name and tagline centered there, a phone on each side.
 */
function appStoreSearchSvg() {
  return canvas(
    3840,
    2560,
    `${phone('a', 'vaporlens', 140, 420, 900)}
${phone('b', 'voice-chat', 2800, 240, 900)}
${icon(1770, 640, 300)}
${text(1920, 1300, 260, 800, 'Vaporlens', 'middle')}
${text(1920, 1530, 160, 600, 'Is this Steam', 'middle')}
${text(1920, 1720, 160, 600, 'game worth it?', 'middle')}`,
  );
}

async function run(command: string[]) {
  const proc = Bun.spawn(command, { stdout: 'ignore', stderr: 'pipe' });
  if ((await proc.exited) !== 0) {
    throw new Error(
      `${command.join(' ')}: ${await new Response(proc.stderr).text()}`,
    );
  }
}

/** Recompresses a PNG losslessly, keeping its color type and bit depth (`--nx`). */
function optimize(file: string) {
  return run(['oxipng', '-o', 'max', '--strip', 'safe', '--nx', file]);
}

/** Exports an SVG and drops the alpha channel, onto the slide's own dark ground. */
async function render(svg: string, out: string) {
  const svgFile = `${out}.svg`;
  writeFileSync(svgFile, svg);
  await run([
    'inkscape',
    svgFile,
    '--export-type=png',
    `--export-filename=${out}`,
  ]);
  await run([
    'magick',
    out,
    '-background',
    '#1b2838',
    '-alpha',
    'remove',
    '-alpha',
    'off',
    `PNG24:${out}`,
  ]);
  await optimize(out);
  rmSync(svgFile);
}

const only = process.argv[2];
for (const size of SIZES) {
  if (only && !size.dir.includes(only)) continue;
  const dir = join(MEDIA, size.dir);
  mkdirSync(dir, { recursive: true });
  for (const [i, slide] of SLIDES.entries()) {
    const capture = join(MEDIA, 'captures/phone', `${slide.capture}.png`);
    if (!(await Bun.file(capture).exists())) {
      console.warn(`skipped ${size.dir} ${slide.name}: no ${capture}`);
      continue;
    }
    const out = join(dir, `${String(i + 1).padStart(2, '0')}-${slide.name}.png`);
    await render(slideSvg(slide, size, capture), out);
    console.log(out);
  }
}
if (!only || 'play-store'.includes(only)) {
  mkdirSync(join(MEDIA, 'play-store'), { recursive: true });
  await render(featureGraphicSvg(), join(MEDIA, 'play-store/feature-graphic.png'));
  // Play wants 512 px, 32-bit with alpha allowed; the icon is square, Play rounds it
  await run([
    'magick',
    ICON,
    '-resize',
    '512x512',
    `PNG32:${join(MEDIA, 'play-store/icon-512.png')}`,
  ]);
  await optimize(join(MEDIA, 'play-store/icon-512.png'));
  console.log(join(MEDIA, 'play-store/feature-graphic.png'));
}
if (!only || 'app-store'.includes(only)) {
  await render(appStoreHeaderSvg(), join(MEDIA, 'app-store/header.png'));
  await render(appStoreSearchSvg(), join(MEDIA, 'app-store/search-results.png'));
}
