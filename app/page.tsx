"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";

type Player = {
  id: number;
  name: string;
  number: string;
};

type LayoutStyle = "classic" | "split";

const starterRoster: Player[] = [
  { id: 1, name: "RAMIREZ", number: "07" },
  { id: 2, name: "CARTER", number: "12" },
  { id: 3, name: "NGUYEN", number: "23" },
  { id: 4, name: "PATEL", number: "31" },
];

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export default function Home() {
  const [teamName, setTeamName] = useState("NORTHSIDE FC");
  const [season, setSeason] = useState("2026 SEASON");
  const [roster, setRoster] = useState<Player[]>(starterRoster);
  const [activeId, setActiveId] = useState(1);
  const [numberColor, setNumberColor] = useState("#2454ff");
  const [outlineColor, setOutlineColor] = useState("#11131a");
  const [accentColor, setAccentColor] = useState("#c8ff45");
  const [backgroundColor, setBackgroundColor] = useState("#f4f0e6");
  const [transparent, setTransparent] = useState(true);
  const [layout, setLayout] = useState<LayoutStyle>("classic");
  const [logoData, setLogoData] = useState<string | null>(null);
  const [logoName, setLogoName] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const activePlayer =
    roster.find((player) => player.id === activeId) ?? roster[0];

  const artworkStyle = useMemo(
    () =>
      ({
        "--number": numberColor,
        "--outline": outlineColor,
        "--accent": accentColor,
        "--art-bg": transparent ? "transparent" : backgroundColor,
      }) as React.CSSProperties,
    [accentColor, backgroundColor, numberColor, outlineColor, transparent],
  );

  const updatePlayer = (id: number, field: "name" | "number", value: string) => {
    const normalized =
      field === "name"
        ? value.toUpperCase().slice(0, 18)
        : value.replace(/\D/g, "").slice(0, 3);
    setRoster((current) =>
      current.map((player) =>
        player.id === id ? { ...player, [field]: normalized } : player,
      ),
    );
  };

  const addPlayer = () => {
    const id = Math.max(0, ...roster.map((player) => player.id)) + 1;
    setRoster((current) => [
      ...current,
      { id, name: "NEW PLAYER", number: String(current.length + 1).padStart(2, "0") },
    ]);
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

  const handleLogo = (event: ChangeEvent<HTMLInputElement>) => {
    acceptLogo(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    acceptLogo(event.dataTransfer.files?.[0]);
  };

  const importRoster = () => {
    const lines = bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return;

    const next = lines.map((line, index) => {
      const match = line.match(/^(.+?)(?:\s*[,;\t]\s*|\s{2,})(\d{1,3})$/);
      return {
        id: Date.now() + index,
        name: (match?.[1] ?? line).trim().toUpperCase().slice(0, 18),
        number: (match?.[2] ?? String(index + 1)).padStart(2, "0").slice(0, 3),
      };
    });
    setRoster(next);
    setActiveId(next[0].id);
    setBulkText("");
    setShowBulk(false);
    setNotice(`${next.length} players imported.`);
  };

  const buildSvg = (player: Player) => {
    const name = escapeXml(player.name || "PLAYER");
    const number = escapeXml(player.number || "00");
    const team = escapeXml(teamName || "YOUR TEAM");
    const year = escapeXml(season || "TEAM EDITION");
    const background = transparent
      ? ""
      : `<rect width="800" height="1000" fill="${backgroundColor}"/>`;
    const logo = logoData
      ? `<image href="${escapeXml(logoData)}" x="315" y="72" width="170" height="170" preserveAspectRatio="xMidYMid meet"/>`
      : `<circle cx="400" cy="148" r="58" fill="${accentColor}"/><text x="400" y="163" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="40" font-weight="900" fill="${outlineColor}">${escapeXml(
          teamName.slice(0, 2).toUpperCase() || "TN",
        )}</text>`;

    if (layout === "split") {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="3000" viewBox="0 0 800 1000">${background}<rect x="54" y="52" width="12" height="896" rx="6" fill="${accentColor}"/>${logo}<text x="400" y="308" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="74" font-weight="900" letter-spacing="3" fill="${outlineColor}">${name}</text><text x="420" y="720" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="430" font-weight="900" letter-spacing="-20" fill="${numberColor}" stroke="${outlineColor}" stroke-width="20" paint-order="stroke fill" stroke-linejoin="round">${number}</text><text x="400" y="860" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="800" letter-spacing="10" fill="${outlineColor}">${team}</text><text x="400" y="912" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" letter-spacing="7" fill="${outlineColor}" opacity=".58">${year}</text></svg>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="3000" viewBox="0 0 800 1000">${background}<path d="M114 238H686" stroke="${accentColor}" stroke-width="12" stroke-linecap="round"/>${logo}<text x="400" y="324" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="74" font-weight="900" letter-spacing="3" fill="${outlineColor}">${name}</text><text x="400" y="724" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="430" font-weight="900" letter-spacing="-20" fill="${numberColor}" stroke="${outlineColor}" stroke-width="20" paint-order="stroke fill" stroke-linejoin="round">${number}</text><rect x="150" y="812" width="500" height="72" rx="36" fill="${outlineColor}"/><text x="400" y="859" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="27" font-weight="800" letter-spacing="9" fill="#ffffff">${team}</text><text x="400" y="932" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" letter-spacing="7" fill="${outlineColor}" opacity=".58">${year}</text></svg>`;
  };

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadSvg = () => {
    if (!activePlayer) return;
    download(
      new Blob([buildSvg(activePlayer)], { type: "image/svg+xml;charset=utf-8" }),
      `${activePlayer.name || "player"}-${activePlayer.number || "00"}.svg`,
    );
    setNotice("Editable SVG downloaded.");
  };

  const downloadPng = () => {
    if (!activePlayer) return;
    const svgBlob = new Blob([buildSvg(activePlayer)], {
      type: "image/svg+xml;charset=utf-8",
    });
    const svgUrl = URL.createObjectURL(svgBlob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 2400;
      canvas.height = 3000;
      const context = canvas.getContext("2d");
      context?.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          download(
            blob,
            `${activePlayer.name || "player"}-${activePlayer.number || "00"}.png`,
          );
          setNotice("High-resolution PNG downloaded.");
        }
        URL.revokeObjectURL(svgUrl);
      }, "image/png");
    };
    image.src = svgUrl;
  };

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
        <span className="quality-badge">PRINT READY · 300 DPI</span>
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
              <div><h2>Team identity</h2><p>Your logo stays on your device.</p></div>
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
                <><span className="upload-symbol" aria-hidden="true">↑</span><span><strong>Drop your team logo</strong><small>PNG, JPG, WEBP or SVG · up to 10 MB</small></span></>
              )}
            </button>
            <input ref={fileInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogo} />
            <div className="field-grid">
              <label><span>Team name</span><input value={teamName} onChange={(event) => setTeamName(event.target.value.toUpperCase().slice(0, 22))} /></label>
              <label><span>Edition</span><input value={season} onChange={(event) => setSeason(event.target.value.toUpperCase().slice(0, 20))} /></label>
            </div>
          </section>

          <section className="control-section">
            <div className="section-heading roster-heading">
              <span className="step">02</span>
              <div><h2>Player roster</h2><p>{roster.length} graphics in this set</p></div>
              <button className="text-button" type="button" onClick={() => setShowBulk((value) => !value)}>Paste list</button>
            </div>
            {showBulk && (
              <div className="bulk-box">
                <label htmlFor="bulk-roster">One player per line — use “Smith, 12”</label>
                <textarea id="bulk-roster" value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={"MORGAN, 08\nWILLIAMS, 14\nLEE, 27"} autoFocus />
                <div className="bulk-actions"><button type="button" onClick={() => setShowBulk(false)}>Cancel</button><button className="apply-button" type="button" onClick={importRoster}>Import roster</button></div>
              </div>
            )}
            <div className="roster-list">
              {roster.map((player) => (
                <div className={`roster-row ${player.id === activeId ? "active" : ""}`} key={player.id} onClick={() => setActiveId(player.id)}>
                  <button className="row-select" type="button" aria-label={`Preview ${player.name}`}><span>{player.number || "00"}</span></button>
                  <label><span>Last name</span><input value={player.name} onFocus={() => setActiveId(player.id)} onChange={(event) => updatePlayer(player.id, "name", event.target.value)} /></label>
                  <label className="number-field"><span>No.</span><input inputMode="numeric" value={player.number} onFocus={() => setActiveId(player.id)} onChange={(event) => updatePlayer(player.id, "number", event.target.value)} /></label>
                  <button className="remove-button" type="button" aria-label={`Remove ${player.name}`} onClick={(event) => { event.stopPropagation(); removePlayer(player.id); }}>×</button>
                </div>
              ))}
            </div>
            <button className="add-player" type="button" onClick={addPlayer}>+ Add player</button>
          </section>

          <section className="control-section">
            <div className="section-heading">
              <span className="step">03</span>
              <div><h2>Ink & layout</h2><p>Set the team look once.</p></div>
            </div>
            <div className="color-grid">
              <label><input type="color" value={numberColor} onChange={(event) => setNumberColor(event.target.value)} /><span>Number</span><strong>{numberColor}</strong></label>
              <label><input type="color" value={outlineColor} onChange={(event) => setOutlineColor(event.target.value)} /><span>Outline</span><strong>{outlineColor}</strong></label>
              <label><input type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} /><span>Accent</span><strong>{accentColor}</strong></label>
              <label className={transparent ? "disabled" : ""}><input type="color" value={backgroundColor} disabled={transparent} onChange={(event) => setBackgroundColor(event.target.value)} /><span>Background</span><strong>{transparent ? "Clear" : backgroundColor}</strong></label>
            </div>
            <div className="layout-controls">
              <span>Composition</span>
              <div className="segment-control">
                <button className={layout === "classic" ? "active" : ""} type="button" onClick={() => setLayout("classic")}>Classic</button>
                <button className={layout === "split" ? "active" : ""} type="button" onClick={() => setLayout("split")}>Sideline</button>
              </div>
            </div>
            <label className="toggle-row"><span><strong>Transparent background</strong><small>Best for heat transfers</small></span><input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} /><i aria-hidden="true" /></label>
          </section>
        </aside>

        <section className="preview-panel" aria-label="Live artwork preview">
          <div className="preview-toolbar">
            <div><span className="eyebrow">LIVE PROOF</span><strong>{activePlayer?.name || "PLAYER"} · {activePlayer?.number || "00"}</strong></div>
            <div className="zoom-pill">FIT · 64%</div>
          </div>

          <div className={`artboard-shell ${transparent ? "checkerboard" : ""}`}>
            <div className={`artboard artboard-${layout}`} style={artworkStyle}>
              {layout === "split" && <span className="sideline" aria-hidden="true" />}
              {layout === "classic" && <span className="top-rule" aria-hidden="true" />}
              <div className={`logo-preview ${logoData ? "logo-present" : ""}`}>
                {logoData ? <img src={logoData} alt="" /> : <span>{teamName.slice(0, 2) || "TN"}</span>}
              </div>
              <div className="player-name">{activePlayer?.name || "PLAYER"}</div>
              <div className="player-number">{activePlayer?.number || "00"}</div>
              <div className="team-lockup">{teamName || "YOUR TEAM"}</div>
              <div className="season-lockup">{season || "TEAM EDITION"}</div>
            </div>
          </div>

          <div className="download-card">
            <div className="download-summary"><span className="ready-check" aria-hidden="true">✓</span><div><strong>Artwork ready</strong><span>2400 × 3000 px · transparent · 300 DPI</span></div></div>
            <div className="download-actions"><button type="button" onClick={downloadSvg}>SVG</button><button className="primary-download" type="button" onClick={downloadPng}>Download PNG <span>↓</span></button></div>
          </div>
          <p className="privacy-note">No uploads. No cloud storage. Your artwork is built entirely in this browser.</p>
        </section>
      </section>

      {notice && <button className="toast" type="button" onClick={() => setNotice("")} aria-label="Dismiss message">{notice}<span>×</span></button>}
    </main>
  );
}
