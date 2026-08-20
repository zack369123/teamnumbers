"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseRoster } from "./parse-roster.mjs";
import {
  ArtworkSettings,
  FONTS,
  LayoutStyle,
  Player,
  SizeAxis,
  ViewMode,
  buildArtwork,
  cssStack,
  findFont,
  toExportSvg,
  toPreviewSvg,
} from "./artwork";

const starterRoster: Player[] = [
  { id: 1, name: "RAMIREZ", number: "07" },
  { id: 2, name: "CARTER", number: "12" },
  { id: 3, name: "NGUYEN", number: "23" },
  { id: 4, name: "PATEL", number: "31" },
];

const cleanNumber = (value: string) => value.replace(/\D/g, "").slice(0, 3);

const DPI_CHOICES = [150, 300, 600];
const SIZE_PRESETS = [4, 6, 8, 10, 12];

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const createPngChunk = (type: string, data: Uint8Array) => {
  const chunk = new Uint8Array(data.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(data, 8);
  view.setUint32(data.length + 8, crc32(chunk.subarray(4, data.length + 8)));
  return chunk;
};

/** Stamp the real print resolution into the PNG so design apps place it at true size. */
const addPngDpiMetadata = async (blob: Blob, dpi: number) => {
  const png = new Uint8Array(await blob.arrayBuffer());
  const signature = png.subarray(0, 8);
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const density = new Uint8Array(9);
  const densityView = new DataView(density.buffer);
  densityView.setUint32(0, pixelsPerMeter);
  densityView.setUint32(4, pixelsPerMeter);
  density[8] = 1;
  const densityChunk = createPngChunk("pHYs", density);
  const chunks: Uint8Array[] = [];
  let offset = 8;

  while (offset + 12 <= png.length) {
    const length = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0);
    const end = offset + length + 12;
    if (end > png.length) return blob;

    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    if (type !== "pHYs") chunks.push(png.subarray(offset, end));
    if (type === "IHDR") chunks.push(densityChunk);
    offset = end;
    if (type === "IEND") break;
  }

  const totalLength = signature.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  output.set(signature);
  let outputOffset = signature.length;
  for (const chunk of chunks) {
    output.set(chunk, outputOffset);
    outputOffset += chunk.length;
  }
  return new Blob([output], { type: "image/png" });
};

const renderSvgToPng = (svg: string, width: number, height: number, dpi: number) =>
  new Promise<Blob>((resolve, reject) => {
    const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(svgUrl);
        reject(new Error("Canvas is unavailable."));
        return;
      }

      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob(async (pngBlob) => {
        URL.revokeObjectURL(svgUrl);
        if (!pngBlob) {
          reject(new Error("PNG export failed."));
          return;
        }
        try {
          resolve(await addPngDpiMetadata(pngBlob, dpi));
        } catch (error) {
          reject(error);
        }
      }, "image/png");
    };

    image.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error("Artwork could not be rendered."));
    };
    image.src = svgUrl;
  });

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export default function Home() {
  const [teamName, setTeamName] = useState("NORTHSIDE FC");
  const [season, setSeason] = useState("2026 SEASON");
  const [roster, setRoster] = useState<Player[]>(starterRoster);
  const [activeId, setActiveId] = useState(1);
  const [mode, setMode] = useState<ViewMode>("artwork");
  const [numberColor, setNumberColor] = useState("#2454ff");
  const [outlineColor, setOutlineColor] = useState("#11131a");
  const [accentColor, setAccentColor] = useState("#c8ff45");
  const [backgroundColor, setBackgroundColor] = useState("#f4f0e6");
  const [transparent, setTransparent] = useState(true);
  const [layout, setLayout] = useState<LayoutStyle>("classic");
  const [numberFontId, setNumberFontId] = useState(FONTS[0].id);
  const [nameFontId, setNameFontId] = useState(FONTS[0].id);
  const [outlineRatio, setOutlineRatio] = useState(0.045);
  const [tracking, setTracking] = useState(0);
  const [sizeAxis, setSizeAxis] = useState<SizeAxis>("height");
  const [sizeInches, setSizeInches] = useState(10);
  const [paddingInches, setPaddingInches] = useState(0);
  const [dpi, setDpi] = useState(300);
  const [logoData, setLogoData] = useState<string | null>(null);
  const [logoName, setLogoName] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState("");
  const [fontsReady, setFontsReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Nothing can be measured until the faces are actually resident, and measuring
  // against a fallback would produce a preview that the export then contradicts.
  useEffect(() => {
    let cancelled = false;
    Promise.all(FONTS.map((font) => document.fonts.load(`${font.weight} 100px '${font.family}'`)))
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setFontsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activePlayer = roster.find((player) => player.id === activeId) ?? roster[0];
  const numberFont = findFont(numberFontId);
  const nameFont = findFont(nameFontId);
  const numbersOnly = mode === "numbers";

  const settings = useMemo<ArtworkSettings>(
    () => ({
      mode,
      layout,
      teamName,
      season,
      logoData,
      numberFont,
      nameFont,
      numberColor,
      outlineColor,
      accentColor,
      backgroundColor,
      transparent,
      outlineRatio,
      tracking,
      sizeAxis,
      sizeInches,
      paddingInches,
      dpi,
    }),
    [
      accentColor,
      backgroundColor,
      dpi,
      layout,
      logoData,
      mode,
      nameFont,
      numberColor,
      numberFont,
      outlineColor,
      outlineRatio,
      paddingInches,
      season,
      sizeAxis,
      sizeInches,
      teamName,
      tracking,
      transparent,
    ],
  );

  const artwork = useMemo(
    () => (fontsReady && activePlayer ? buildArtwork(activePlayer, settings) : null),
    [activePlayer, fontsReady, settings],
  );

  const previewMarkup = useMemo(() => (artwork ? toPreviewSvg(artwork) : ""), [artwork]);

  const exportFonts = useMemo(
    () => (numbersOnly ? [numberFont] : [numberFont, nameFont, findFont("archivo-black")]),
    [nameFont, numberFont, numbersOnly],
  );

  const updatePlayer = (id: number, field: "name" | "number", value: string) => {
    const normalized = field === "name" ? value.toUpperCase().slice(0, 18) : cleanNumber(value);
    setRoster((current) =>
      current.map((player) => (player.id === id ? { ...player, [field]: normalized } : player)),
    );
  };

  const addPlayer = () => {
    const id = Math.max(0, ...roster.map((player) => player.id)) + 1;
    setRoster((current) => [...current, { id, name: "", number: String(current.length + 1) }]);
    setActiveId(id);
  };

  const removePlayer = (id: number) => {
    if (roster.length === 1) return;
    const next = roster.filter((player) => player.id !== id);
    setRoster(next);
    if (activeId === id) setActiveId(next[0].id);
  };

  const acceptLogo = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Choose a PNG, JPG, WEBP, or SVG logo.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNotice("That logo is over 10 MB. Try a smaller file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoData(String(reader.result));
      setLogoName(file.name);
      setNotice("Logo added — it stays on this device.");
    };
    reader.readAsDataURL(file);
  };

  const handleLogo = (event: ChangeEvent<HTMLInputElement>) => acceptLogo(event.target.files?.[0]);

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    acceptLogo(event.dataTransfer.files?.[0]);
  };

  const importRoster = () => {
    const next = parseRoster(bulkText);
    if (!next.length) {
      setNotice("Nothing to import — paste numbers or “Smith, 12” lines.");
      return;
    }
    const named = next.some((player) => player.name);
    setRoster(next);
    setActiveId(next[0].id);
    setBulkText("");
    setShowBulk(false);
    if (!named) setMode("numbers");
    setNotice(
      named
        ? `${next.length} players imported.`
        : `${next.length} numbers imported — switched to Numbers only.`,
    );
  };

  const clearIdentity = () => {
    setTeamName("");
    setSeason("");
    setLogoData(null);
    setLogoName("");
    setRoster((current) => current.map((player) => ({ ...player, name: "" })));
    setNotice("Names and team marks cleared — numbers only.");
  };

  const exportPlayer = useCallback(
    async (player: Player, kind: "png" | "svg") => {
      const result = buildArtwork(player, settings);
      if (!result) throw new Error("Add a number first.");
      const svg = await toExportSvg(result, exportFonts);
      const label = numbersOnly || !player.name ? player.number : `${player.name}-${player.number}`;
      const stem = `${label}-${sizeInches}in-${sizeAxis === "height" ? "tall" : "wide"}-${dpi}dpi`;

      if (kind === "svg") {
        download(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${stem}.svg`);
        return;
      }
      download(await renderSvgToPng(svg, result.width, result.height, dpi), `${stem}.png`);
    },
    [dpi, exportFonts, numbersOnly, settings, sizeAxis, sizeInches],
  );

  const runExport = async (key: string, task: () => Promise<void>, done: string) => {
    setExporting(key);
    try {
      await task();
      setNotice(done);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "That export could not be created.");
    } finally {
      setExporting("");
    }
  };

  const downloadPng = () =>
    runExport(
      "png",
      () => exportPlayer(activePlayer, "png"),
      `PNG saved — ${sizeInches}in ${sizeAxis} at ${dpi} DPI.`,
    );

  const downloadSvg = () =>
    runExport("svg", () => exportPlayer(activePlayer, "svg"), "Vector SVG saved — scales to any size.");

  const downloadAll = () =>
    runExport(
      "all",
      async () => {
        for (const player of roster) {
          await exportPlayer(player, "png");
          await wait(320);
        }
      },
      `${roster.length} PNGs saved at ${dpi} DPI.`,
    );

  const outputLabel = artwork
    ? `${artwork.width} × ${artwork.height} px · ${(artwork.width / dpi).toFixed(2)} × ${(artwork.height / dpi).toFixed(2)} in`
    : "Measuring…";
  const numberSizeLabel = artwork
    ? `Number ${artwork.numberWidthInches.toFixed(2)} in wide × ${artwork.numberHeightInches.toFixed(2)} in tall`
    : "";

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="RosterLab home">
          <span className="brand-mark" aria-hidden="true">R/09</span>
          <span>RosterLab</span>
        </a>
        <div className="topbar-center">
          <span className="live-dot" aria-hidden="true" />
          Auto-saving this session
        </div>
        <span className="quality-badge">PRINT READY · {dpi} DPI</span>
      </header>

      <section className="workspace" id="top">
        <aside className="editor-panel" aria-label="Artwork controls">
          <div className="intro-copy">
            <span className="eyebrow">TEAM NUMBER BUILDER</span>
            <h1>Every name.<br />Every number.</h1>
            <p>Build clean, press-ready player graphics in minutes.</p>
          </div>

          <section className="control-section">
            <div className="section-heading">
              <span className="step">01</span>
              <div><h2>What you are printing</h2><p>Numbers only, or the full lockup.</p></div>
            </div>
            <div className="mode-switch" role="group" aria-label="Artwork mode">
              <button className={numbersOnly ? "" : "active"} type="button" onClick={() => setMode("artwork")}>
                <strong>Full artwork</strong>
                <small>Logo, name, number, team</small>
              </button>
              <button className={numbersOnly ? "active" : ""} type="button" onClick={() => setMode("numbers")}>
                <strong>Numbers only</strong>
                <small>Just the digits, cropped tight</small>
              </button>
            </div>
            <p className="hint">
              Any field you leave empty simply disappears from the artwork — no placeholder text is added.
            </p>
          </section>

          <section className={`control-section ${numbersOnly ? "muted-section" : ""}`}>
            <div className="section-heading roster-heading">
              <span className="step">02</span>
              <div><h2>Team identity</h2><p>{numbersOnly ? "Hidden in Numbers only" : "Your logo stays on your device."}</p></div>
              <button className="text-button" type="button" onClick={clearIdentity}>Clear all</button>
            </div>
            <button
              className={`logo-drop ${logoData ? "has-logo" : ""}`}
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              {logoData ? (
                <><img src={logoData} alt="Uploaded team logo" /><span><strong>{logoName}</strong><small>Click to replace</small></span></>
              ) : (
                <><span className="upload-symbol" aria-hidden="true">↑</span><span><strong>Drop your team logo</strong><small>Optional · PNG, JPG, WEBP or SVG</small></span></>
              )}
            </button>
            <input ref={fileInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogo} />
            <div className="field-grid">
              <label><span>Team name</span><input value={teamName} placeholder="Leave empty to hide" onChange={(event) => setTeamName(event.target.value.toUpperCase().slice(0, 22))} /></label>
              <label><span>Edition</span><input value={season} placeholder="Leave empty to hide" onChange={(event) => setSeason(event.target.value.toUpperCase().slice(0, 20))} /></label>
            </div>
          </section>

          <section className="control-section">
            <div className="section-heading roster-heading">
              <span className="step">03</span>
              <div><h2>Numbers &amp; roster</h2><p>{roster.length} graphics in this set</p></div>
              <button className="text-button" type="button" onClick={() => setShowBulk((value) => !value)}>Paste list</button>
            </div>
            {showBulk && (
              <div className="bulk-box">
                <label htmlFor="bulk-roster">
                  Paste numbers (<code>0, 1, 2, 10, 88</code>) or one player per line (<code>Smith, 12</code>)
                </label>
                <textarea id="bulk-roster" value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={"0, 1, 2, 3, 4, 5, 10, 21, 88\n\n— or —\n\nMORGAN, 08\nWILLIAMS, 14"} autoFocus />
                <div className="bulk-actions"><button type="button" onClick={() => setShowBulk(false)}>Cancel</button><button className="apply-button" type="button" onClick={importRoster}>Import</button></div>
              </div>
            )}
            <div className={`roster-list ${numbersOnly ? "numbers-grid" : ""}`}>
              {roster.map((player) => (
                <div className={`roster-row ${player.id === activeId ? "active" : ""} ${numbersOnly ? "numbers-only" : ""}`} key={player.id} onClick={() => setActiveId(player.id)}>
                  <button className="row-select" type="button" aria-label={`Preview number ${player.number}`} style={{ fontFamily: cssStack(numberFont) }}><span>{player.number || "–"}</span></button>
                  {!numbersOnly && (
                    <label><span>Last name</span><input value={player.name} placeholder="Optional" onFocus={() => setActiveId(player.id)} onChange={(event) => updatePlayer(player.id, "name", event.target.value)} /></label>
                  )}
                  <label className="number-field"><span>No.</span><input inputMode="numeric" value={player.number} onFocus={() => setActiveId(player.id)} onChange={(event) => updatePlayer(player.id, "number", event.target.value)} /></label>
                  <button className="remove-button" type="button" aria-label={`Remove ${player.number}`} onClick={(event) => { event.stopPropagation(); removePlayer(player.id); }}>×</button>
                </div>
              ))}
            </div>
            <button className="add-player" type="button" onClick={addPlayer}>+ Add number</button>
          </section>

          <section className="control-section">
            <div className="section-heading">
              <span className="step">04</span>
              <div><h2>Number font</h2><p>Every face shown with your actual number.</p></div>
            </div>
            <div className="font-gallery">
              {FONTS.map((font) => (
                <button
                  key={font.id}
                  className={`font-card ${font.id === numberFontId ? "active" : ""}`}
                  type="button"
                  onClick={() => setNumberFontId(font.id)}
                  aria-pressed={font.id === numberFontId}
                >
                  <span className="font-sample" style={{ fontFamily: cssStack(font), fontWeight: font.weight }}>
                    {activePlayer?.number || "0"}
                  </span>
                  <span className="font-meta"><strong>{font.label}</strong><small>{font.note}</small></span>
                </button>
              ))}
            </div>
            {!numbersOnly && (
              <label className="stacked-field">
                <span>Name font</span>
                <select value={nameFontId} onChange={(event) => setNameFontId(event.target.value)} style={{ fontFamily: cssStack(nameFont) }}>
                  {FONTS.map((font) => <option value={font.id} key={font.id}>{font.label} — {font.family}</option>)}
                </select>
              </label>
            )}
          </section>

          <section className="control-section">
            <div className="section-heading">
              <span className="step">05</span>
              <div><h2>Ink &amp; finish</h2><p>Set the team look once.</p></div>
            </div>
            <div className="color-grid">
              <label><input type="color" value={numberColor} onChange={(event) => setNumberColor(event.target.value)} /><span>Number</span><strong>{numberColor}</strong></label>
              <label className={outlineRatio === 0 ? "disabled" : ""}><input type="color" value={outlineColor} onChange={(event) => setOutlineColor(event.target.value)} /><span>Outline</span><strong>{outlineRatio === 0 ? "Off" : outlineColor}</strong></label>
              {!numbersOnly && <label><input type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} /><span>Accent</span><strong>{accentColor}</strong></label>}
              <label className={transparent ? "disabled" : ""}><input type="color" value={backgroundColor} disabled={transparent} onChange={(event) => setBackgroundColor(event.target.value)} /><span>Background</span><strong>{transparent ? "Clear" : backgroundColor}</strong></label>
            </div>
            <label className="slider-row">
              <span>Outline weight</span>
              <input type="range" min={0} max={0.12} step={0.005} value={outlineRatio} onChange={(event) => setOutlineRatio(Number(event.target.value))} />
              <strong>{outlineRatio === 0 ? "None" : `${(outlineRatio * 100).toFixed(1)}%`}</strong>
            </label>
            <label className="slider-row">
              <span>Number tracking</span>
              <input type="range" min={-0.1} max={0.25} step={0.01} value={tracking} onChange={(event) => setTracking(Number(event.target.value))} />
              <strong>{tracking.toFixed(2)}em</strong>
            </label>
            {!numbersOnly && (
              <div className="layout-controls">
                <span>Composition</span>
                <div className="segment-control">
                  <button className={layout === "classic" ? "active" : ""} type="button" onClick={() => setLayout("classic")}>Classic</button>
                  <button className={layout === "split" ? "active" : ""} type="button" onClick={() => setLayout("split")}>Sideline</button>
                </div>
              </div>
            )}
            <label className="toggle-row"><span><strong>Transparent background</strong><small>Best for heat transfers</small></span><input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} /><i aria-hidden="true" /></label>
          </section>

          <section className="control-section">
            <div className="section-heading">
              <span className="step">06</span>
              <div><h2>Print size</h2><p>Set the number in inches, then download.</p></div>
            </div>
            <div className="layout-controls">
              <span>Measure by</span>
              <div className="segment-control">
                <button className={sizeAxis === "height" ? "active" : ""} type="button" onClick={() => setSizeAxis("height")}>Height</button>
                <button className={sizeAxis === "width" ? "active" : ""} type="button" onClick={() => setSizeAxis("width")}>Width</button>
              </div>
            </div>
            <div className="size-row">
              <label className="stacked-field">
                <span>Number {sizeAxis} (in)</span>
                <input type="number" min={0.25} max={60} step={0.25} value={sizeInches} onChange={(event) => setSizeInches(Math.min(60, Math.max(0.25, Number(event.target.value) || 0.25)))} />
              </label>
              <label className="stacked-field">
                <span>Clear margin (in)</span>
                <input type="number" min={0} max={6} step={0.125} value={paddingInches} onChange={(event) => setPaddingInches(Math.min(6, Math.max(0, Number(event.target.value) || 0)))} />
              </label>
              <label className="stacked-field">
                <span>Resolution</span>
                <select value={dpi} onChange={(event) => setDpi(Number(event.target.value))}>
                  {DPI_CHOICES.map((value) => <option key={value} value={value}>{value} DPI</option>)}
                </select>
              </label>
            </div>
            <div className="preset-row">
              {SIZE_PRESETS.map((preset) => (
                <button key={preset} className={preset === sizeInches ? "active" : ""} type="button" onClick={() => setSizeInches(preset)}>{preset}&quot;</button>
              ))}
            </div>
          </section>
        </aside>

        <section className="preview-panel" aria-label="Live artwork preview">
          <div className="preview-toolbar">
            <div>
              <span className="eyebrow">LIVE PROOF · WHAT YOU DOWNLOAD</span>
              <strong>{numbersOnly ? `Number ${activePlayer?.number || "–"}` : `${activePlayer?.name || "No name"} · ${activePlayer?.number || "–"}`}</strong>
            </div>
            <div className="zoom-pill">{outputLabel}</div>
          </div>

          <div className={`artboard-shell ${transparent ? "checkerboard" : ""}`}>
            {previewMarkup ? (
              <div className="artwork-stage" dangerouslySetInnerHTML={{ __html: previewMarkup }} />
            ) : (
              <p className="stage-empty">{fontsReady ? "Add a number to see the proof." : "Loading fonts…"}</p>
            )}
          </div>

          <div className="download-card">
            <div className="download-summary">
              <span className="ready-check" aria-hidden="true">✓</span>
              <div>
                <strong>{numbersOnly ? "Numbers only" : "Full artwork"} · {dpi} DPI{transparent ? " · transparent" : ""}</strong>
                <span>{numberSizeLabel || outputLabel}</span>
              </div>
            </div>
            <div className="download-actions">
              <button type="button" onClick={downloadSvg} disabled={exporting !== "" || !artwork}>{exporting === "svg" ? "Saving…" : "SVG"}</button>
              <button type="button" onClick={downloadAll} disabled={exporting !== "" || !artwork}>{exporting === "all" ? "Saving…" : `All ${roster.length}`}</button>
              <button className="primary-download" type="button" onClick={downloadPng} disabled={exporting !== "" || !artwork}>{exporting === "png" ? "Rendering…" : "Download PNG"} <span>↓</span></button>
            </div>
          </div>
          <p className="privacy-note">
            The proof above is the exact file that downloads — same fonts, same outline, same crop. Nothing is uploaded.
          </p>
        </section>
      </section>

      {notice && <button className="toast" type="button" onClick={() => setNotice("")} aria-label="Dismiss message">{notice}<span>×</span></button>}
    </main>
  );
}
