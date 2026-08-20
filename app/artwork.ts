// Shared artwork engine.
//
// The preview and the exported file are produced by this one module so that what
// the customer sees on screen is exactly what lands in the PNG/SVG. Every glyph is
// measured with canvas metrics at a reference size, then positioned explicitly, so
// the layout does not depend on the renderer's text engine at draw time.

export type Player = { id: number; name: string; number: string };
export type LayoutStyle = "classic" | "split";
export type ViewMode = "artwork" | "numbers";
export type SizeAxis = "height" | "width";

export type FontDef = {
  id: string;
  label: string;
  family: string;
  weight: number;
  file: string;
  note: string;
};

export const FONTS: FontDef[] = [
  { id: "anton", label: "Stadium", family: "Anton", weight: 400, file: "/fonts/anton.woff2", note: "Bold block" },
  { id: "archivo-black", label: "Pro Block", family: "Archivo Black", weight: 400, file: "/fonts/archivo-black.woff2", note: "Heavy grotesk" },
  { id: "bebas-neue", label: "Sideline", family: "Bebas Neue", weight: 400, file: "/fonts/bebas-neue.woff2", note: "Tall condensed" },
  { id: "oswald", label: "Condensed", family: "Oswald", weight: 700, file: "/fonts/oswald.woff2", note: "Narrow bold" },
  { id: "teko", label: "Athletic", family: "Teko", weight: 700, file: "/fonts/teko.woff2", note: "Squared sport" },
  { id: "big-shoulders", label: "Big Shoulders", family: "Big Shoulders Display", weight: 800, file: "/fonts/big-shoulders.woff2", note: "Industrial" },
  { id: "graduate", label: "Collegiate", family: "Graduate", weight: 400, file: "/fonts/graduate.woff2", note: "Varsity slab" },
  { id: "alfa-slab", label: "Slab", family: "Alfa Slab One", weight: 400, file: "/fonts/alfa-slab.woff2", note: "Fat slab serif" },
  { id: "bungee", label: "Block Party", family: "Bungee", weight: 400, file: "/fonts/bungee.woff2", note: "Signage block" },
  { id: "rubik-mono", label: "Mono Tech", family: "Rubik Mono One", weight: 400, file: "/fonts/rubik-mono.woff2", note: "Even width" },
  { id: "saira-stencil", label: "Stencil", family: "Saira Stencil One", weight: 400, file: "/fonts/saira-stencil.woff2", note: "Cut stencil" },
  { id: "orbitron", label: "Orbit", family: "Orbitron", weight: 900, file: "/fonts/orbitron.woff2", note: "Futuristic" },
  { id: "racing-sans", label: "Racing", family: "Racing Sans One", weight: 400, file: "/fonts/racing-sans.woff2", note: "Motorsport" },
  { id: "playfair", label: "Classic Serif", family: "Playfair Display", weight: 900, file: "/fonts/playfair.woff2", note: "Traditional" },
];

export const DEFAULT_FONT = FONTS[0];
export const findFont = (id: string) => FONTS.find((font) => font.id === id) ?? DEFAULT_FONT;
export const cssStack = (font: FontDef) => `'${font.family}', Impact, sans-serif`;

/** Every glyph is measured once at this size, then scaled linearly. */
const REF = 100;

export const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const round = (value: number) => Math.round(value * 100) / 100;

let measureContext: CanvasRenderingContext2D | null = null;
const getMeasureContext = () => {
  if (typeof document === "undefined") return null;
  if (!measureContext) measureContext = document.createElement("canvas").getContext("2d");
  return measureContext;
};

export type RunMetrics = {
  chars: string[];
  /** Pen x for each glyph, at REF size. */
  positions: number[];
  inkMinX: number;
  inkMaxX: number;
  ascent: number;
  descent: number;
};

/**
 * Measure a line of text at REF size with manual letter tracking. Tracking is applied
 * per glyph rather than through `letter-spacing` because canvas support for that
 * property is uneven, and drifting metrics would break preview/export parity.
 */
export const measureRun = (text: string, font: FontDef, tracking: number): RunMetrics | null => {
  const context = getMeasureContext();
  const chars = Array.from(text);
  if (!context || !chars.length) return null;

  context.font = `${font.weight} ${REF}px ${cssStack(font)}`;
  const positions: number[] = [];
  let pen = 0;
  let inkMinX = Infinity;
  let inkMaxX = -Infinity;
  let ascent = 0;
  let descent = 0;

  for (const char of chars) {
    const metrics = context.measureText(char);
    positions.push(pen);
    if (char.trim()) {
      inkMinX = Math.min(inkMinX, pen - metrics.actualBoundingBoxLeft);
      inkMaxX = Math.max(inkMaxX, pen + metrics.actualBoundingBoxRight);
      ascent = Math.max(ascent, metrics.actualBoundingBoxAscent);
      descent = Math.max(descent, metrics.actualBoundingBoxDescent);
    }
    pen += metrics.width + tracking * REF;
  }

  if (inkMinX === Infinity || inkMaxX <= inkMinX) return null;
  return { chars, positions, inkMinX, inkMaxX, ascent, descent };
};

/** Ink width of a run at REF size, as a multiple of the font size. */
export const runWidthRatio = (metrics: RunMetrics) => (metrics.inkMaxX - metrics.inkMinX) / REF;
/** Ink height of a run at REF size, as a multiple of the font size. */
export const runHeightRatio = (metrics: RunMetrics) => (metrics.ascent + metrics.descent) / REF;

export type RunBox = { width: number; height: number };

export const runBox = (metrics: RunMetrics, fontSize: number, strokeWidth: number): RunBox => ({
  width: runWidthRatio(metrics) * fontSize + strokeWidth,
  height: runHeightRatio(metrics) * fontSize + strokeWidth,
});

type RunPaint = {
  x: number;
  y: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
};

/**
 * Emit a positioned glyph run. `x`/`y` describe the top-left of the inked box
 * (stroke included). Strokes are drawn as a separate pass beneath every fill so
 * tight tracking never lets one glyph's outline cut into its neighbour.
 */
export const runSvg = (metrics: RunMetrics, fontSize: number, font: FontDef, paint: RunPaint) => {
  const scale = fontSize / REF;
  const strokeWidth = paint.strokeWidth ?? 0;
  const penBase = paint.x + strokeWidth / 2 - metrics.inkMinX * scale;
  const baseline = paint.y + strokeWidth / 2 + metrics.ascent * scale;
  const common = `font-family="${escapeXml(cssStack(font))}" font-size="${round(fontSize)}" font-weight="${font.weight}" xml:space="preserve"`;
  const opacity = paint.opacity !== undefined && paint.opacity < 1 ? ` opacity="${paint.opacity}"` : "";

  const glyphs = metrics.chars
    .map((char, index) => (char.trim() ? { char, x: round(penBase + metrics.positions[index] * scale) } : null))
    .filter((glyph): glyph is { char: string; x: number } => glyph !== null);

  const layer = (extra: string) =>
    glyphs
      .map((glyph) => `<text x="${glyph.x}" y="${round(baseline)}" ${common}${extra}>${escapeXml(glyph.char)}</text>`)
      .join("");

  const strokeLayer =
    paint.stroke && strokeWidth > 0
      ? layer(
          ` fill="none" stroke="${paint.stroke}" stroke-width="${round(strokeWidth)}" stroke-linejoin="round" stroke-linecap="round"`,
        )
      : "";

  return `<g${opacity}>${strokeLayer}${layer(` fill="${paint.fill}"`)}</g>`;
};

export type ArtworkSettings = {
  mode: ViewMode;
  layout: LayoutStyle;
  teamName: string;
  season: string;
  logoData: string | null;
  numberFont: FontDef;
  nameFont: FontDef;
  numberColor: string;
  outlineColor: string;
  accentColor: string;
  backgroundColor: string;
  transparent: boolean;
  /** Outline thickness as a fraction of the number's font size. 0 disables it. */
  outlineRatio: number;
  /** Letter tracking for the number, in em. */
  tracking: number;
  sizeAxis: SizeAxis;
  sizeInches: number;
  paddingInches: number;
  dpi: number;
};

export type ArtworkResult = {
  svg: string;
  /** Full output size in pixels at the chosen DPI. */
  width: number;
  height: number;
  /** Measured size of the number itself, in inches, outline included. */
  numberWidthInches: number;
  numberHeightInches: number;
};

const logoSvg = (logoData: string, x: number, y: number, size: number) =>
  `<image href="${escapeXml(logoData)}" x="${round(x)}" y="${round(y)}" width="${round(size)}" height="${round(size)}" preserveAspectRatio="xMidYMid meet"/>`;

/**
 * Build the artwork. Returns null when the number cannot be measured yet — that
 * happens for one frame before the webfonts finish loading.
 */
export const buildArtwork = (player: Player, settings: ArtworkSettings): ArtworkResult | null => {
  const numberText = player.number.trim();
  if (!numberText) return null;

  const numberMetrics = measureRun(numberText, settings.numberFont, settings.tracking);
  if (!numberMetrics) return null;

  const targetPx = Math.max(1, settings.sizeInches) * settings.dpi;
  const widthRatio = runWidthRatio(numberMetrics);
  const heightRatio = runHeightRatio(numberMetrics);
  const outlineRatio = Math.max(0, settings.outlineRatio);

  // Solve the font size that makes the inked number measure exactly the requested
  // number of inches on the chosen axis. Both ratios are linear in font size, so
  // this is a single division rather than an iterative fit.
  const axisRatio = (settings.sizeAxis === "height" ? heightRatio : widthRatio) + outlineRatio;
  const fontSize = targetPx / axisRatio;
  const strokeWidth = fontSize * outlineRatio;

  const numberBox = runBox(numberMetrics, fontSize, strokeWidth);
  const padding = Math.max(0, settings.paddingInches) * settings.dpi;

  const numbersOnly = settings.mode === "numbers";
  const nameText = numbersOnly ? "" : player.name.trim();
  const teamText = numbersOnly ? "" : settings.teamName.trim();
  const seasonText = numbersOnly ? "" : settings.season.trim();
  const logo = numbersOnly ? null : settings.logoData;

  type Row = {
    width: number;
    height: number;
    /** Spans the whole content column instead of being centred on its own width. */
    full?: boolean;
    render: (x: number, y: number, width: number) => string;
  };
  const rows: Row[] = [];
  const gaps: number[] = [];

  const pushRow = (row: Row, gapBefore: number) => {
    if (rows.length) gaps.push(gapBefore);
    rows.push(row);
  };

  const showAccent = !numbersOnly;

  if (logo) {
    const size = fontSize * 0.42;
    pushRow({ width: size, height: size, render: (x, y) => logoSvg(logo, x, y, size) }, 0);
  }

  if (showAccent && settings.layout === "classic" && (nameText || teamText || seasonText)) {
    const ruleHeight = fontSize * 0.035;
    pushRow(
      {
        width: 0,
        height: ruleHeight,
        full: true,
        render: (x, y, width) =>
          `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(ruleHeight)}" rx="${round(ruleHeight / 2)}" fill="${settings.accentColor}"/>`,
      },
      fontSize * 0.09,
    );
  }

  if (nameText) {
    const nameMetrics = measureRun(nameText, settings.nameFont, 0.05);
    if (nameMetrics) {
      // Keep long surnames from outgrowing the number they sit above.
      const naturalSize = fontSize * 0.2;
      const maxWidth = numberBox.width * 1.05;
      const nameSize = Math.min(naturalSize, maxWidth / runWidthRatio(nameMetrics));
      const box = runBox(nameMetrics, nameSize, 0);
      pushRow(
        {
          ...box,
          render: (x, y) => runSvg(nameMetrics, nameSize, settings.nameFont, { x, y, fill: settings.outlineColor }),
        },
        fontSize * 0.1,
      );
    }
  }

  pushRow(
    {
      ...numberBox,
      render: (x, y) =>
        runSvg(numberMetrics, fontSize, settings.numberFont, {
          x,
          y,
          fill: settings.numberColor,
          stroke: outlineRatio > 0 ? settings.outlineColor : undefined,
          strokeWidth,
        }),
    },
    fontSize * 0.08,
  );

  const supportFont = findFont("archivo-black");

  if (teamText) {
    const teamMetrics = measureRun(teamText, supportFont, 0.28);
    if (teamMetrics) {
      const naturalSize = fontSize * 0.085;
      const teamSize = Math.min(naturalSize, (numberBox.width * 1.05) / runWidthRatio(teamMetrics));
      const box = runBox(teamMetrics, teamSize, 0);
      const isPill = settings.layout === "classic";
      const padX = isPill ? teamSize * 1.6 : 0;
      const padY = isPill ? teamSize * 0.9 : 0;
      pushRow(
        {
          width: box.width + padX * 2,
          height: box.height + padY * 2,
          render: (x, y) => {
            const pill = isPill
              ? `<rect x="${round(x)}" y="${round(y)}" width="${round(box.width + padX * 2)}" height="${round(box.height + padY * 2)}" rx="${round((box.height + padY * 2) / 2)}" fill="${settings.outlineColor}"/>`
              : "";
            return `${pill}${runSvg(teamMetrics, teamSize, supportFont, {
              x: x + padX,
              y: y + padY,
              fill: isPill ? "#ffffff" : settings.outlineColor,
            })}`;
          },
        },
        fontSize * 0.13,
      );
    }
  }

  if (seasonText) {
    const seasonMetrics = measureRun(seasonText, supportFont, 0.3);
    if (seasonMetrics) {
      const naturalSize = fontSize * 0.055;
      const seasonSize = Math.min(naturalSize, (numberBox.width * 1.05) / runWidthRatio(seasonMetrics));
      const box = runBox(seasonMetrics, seasonSize, 0);
      pushRow(
        {
          ...box,
          render: (x, y) =>
            runSvg(seasonMetrics, seasonSize, supportFont, { x, y, fill: settings.outlineColor, opacity: 0.58 }),
        },
        fontSize * 0.07,
      );
    }
  }

  const sizedRows = rows.filter((row) => !row.full);
  const contentWidth = Math.max(...(sizedRows.length ? sizedRows : rows).map((row) => row.width));
  const contentHeight = rows.reduce((sum, row) => sum + row.height, 0) + gaps.reduce((sum, gap) => sum + gap, 0);

  // A bare number crops tight to the ink; full artwork gets a proportional margin
  // plus room for the accent bar so nothing sits on the trim edge.
  const margin = numbersOnly ? padding : padding + fontSize * 0.16;
  const sidelineGutter = showAccent && settings.layout === "split" ? fontSize * 0.14 : 0;

  const width = contentWidth + margin * 2 + sidelineGutter;
  const height = contentHeight + margin * 2;
  const contentLeft = margin + sidelineGutter;

  let cursorY = margin;
  const body = rows
    .map((row, index) => {
      if (index) cursorY += gaps[index - 1];
      const x = row.full ? contentLeft : contentLeft + (contentWidth - row.width) / 2;
      const svg = row.render(x, cursorY, row.full ? contentWidth : row.width);
      cursorY += row.height;
      return svg;
    })
    .join("");

  const decoration =
    showAccent && settings.layout === "split" && rows.length > 1
      ? `<rect x="${round(margin)}" y="${round(margin)}" width="${round(fontSize * 0.05)}" height="${round(contentHeight)}" rx="${round(fontSize * 0.025)}" fill="${settings.accentColor}"/>`
      : "";

  const background = settings.transparent
    ? ""
    : `<rect width="${round(width)}" height="${round(height)}" fill="${settings.backgroundColor}"/>`;

  const outWidth = Math.max(1, Math.round(width));
  const outHeight = Math.max(1, Math.round(height));

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${outWidth}" height="${outHeight}" viewBox="0 0 ${round(width)} ${round(height)}">__FONT_CSS__${background}${decoration}${body}</svg>`,
    width: outWidth,
    height: outHeight,
    numberWidthInches: numberBox.width / settings.dpi,
    numberHeightInches: numberBox.height / settings.dpi,
  };
};

/** Preview markup: no fixed pixel size, so it scales to whatever box it sits in. */
export const toPreviewSvg = (result: ArtworkResult) =>
  result.svg
    .replace(/ width="\d+" height="\d+"/, ' width="100%" height="100%" preserveAspectRatio="xMidYMid meet"')
    .replace("__FONT_CSS__", "");

const fontCssCache = new Map<string, string>();

/**
 * Inline the webfont as a data URI. An SVG rasterised through an <img> element has
 * no access to the page's fonts, so without this the PNG would silently fall back
 * to a system face and stop matching the preview.
 */
export const embeddedFontCss = async (fonts: FontDef[]) => {
  const unique = [...new Map(fonts.map((font) => [font.id, font])).values()];
  const faces = await Promise.all(
    unique.map(async (font) => {
      const cached = fontCssCache.get(font.id);
      if (cached) return cached;
      const response = await fetch(font.file);
      if (!response.ok) throw new Error(`Could not load ${font.label}.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 8192) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
      }
      const face = `@font-face{font-family:'${font.family}';font-style:normal;font-weight:${font.weight};src:url(data:font/woff2;base64,${btoa(binary)}) format('woff2');}`;
      fontCssCache.set(font.id, face);
      return face;
    }),
  );
  return `<defs><style type="text/css">${faces.join("")}</style></defs>`;
};

export const toExportSvg = async (result: ArtworkResult, fonts: FontDef[]) =>
  result.svg.replace("__FONT_CSS__", await embeddedFontCss(fonts));
