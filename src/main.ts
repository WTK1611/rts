import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { Net } from "./net";
import {
  DAY_LENGTH_SEC,
  dayOfSeasonAt,
  phaseAt,
  phaseLengthsAt,
  SEASON_LEN_DAYS,
  seasonAt,
  ServerMessage,
} from "../shared/protocol";
import { biomeAt, hasTreeAt } from "../shared/worldgen";
import { BIOME_MINI_COLOR } from "./biomeColors";
import {
  LANGUAGES,
  LANGUAGE_FLAG,
  LANGUAGE_LABEL,
  Language,
} from "../shared/names";
import { getLanguage, setLanguage, t } from "./i18n";

declare const __APP_VERSION__: string;
const versionTag = document.getElementById("version-tag");
if (versionTag) versionTag.textContent = `v${__APP_VERSION__}`;

const SERVER_URL = (() => {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  if (window.location.protocol === "https:") {
    return `wss://${window.location.host}/ws`;
  }
  return `ws://${window.location.hostname}:8787`;
})();

const lobby = document.getElementById("lobby") as HTMLDivElement;
const lobbyStatus = document.getElementById("lobby-status") as HTMLDivElement;
const nameInput = document.getElementById("name-input") as HTMLInputElement;
const playBtn = document.getElementById("play-btn") as HTMLButtonElement;
const lobbyHeading = document.getElementById("lobby-heading") as HTMLHeadingElement;
const lobbyTitle = document.getElementById("lobby-title") as HTMLDivElement;
const lobbyLangLabel = document.getElementById("lobby-lang-label") as HTMLDivElement;
const lobbyFlags = document.getElementById("lobby-flags") as HTMLDivElement;
const lobbyIcon = document.getElementById("lobby-icon") as HTMLImageElement;

nameInput.value = localStorage.getItem("rts-name") ?? "";

setLanguage(getLanguage());

function applyLobbyTexts(): void {
  const s = t();
  document.title = s.lobbyTitle;
  if (lobbyHeading) lobbyHeading.textContent = s.lobbyTitle;
  if (lobbyTitle) lobbyTitle.textContent = s.lobbySubtitle;
  if (lobbyIcon) lobbyIcon.alt = s.lobbyTitle;
  nameInput.placeholder = s.lobbyNamePlaceholder;
  playBtn.textContent = s.lobbyPlay;
  if (lobbyLangLabel) lobbyLangLabel.textContent = s.lobbyChooseLanguage;
  for (const child of Array.from(lobbyFlags.children)) {
    const code = (child as HTMLElement).dataset.lang as Language | undefined;
    if (!code) continue;
    (child as HTMLElement).title = LANGUAGE_LABEL[code];
    child.classList.toggle("active", code === getLanguage());
  }
}

function buildFlagPicker(): void {
  lobbyFlags.innerHTML = "";
  for (const lang of LANGUAGES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lobby-flag";
    btn.dataset.lang = lang;
    btn.textContent = LANGUAGE_FLAG[lang];
    btn.title = LANGUAGE_LABEL[lang];
    btn.addEventListener("click", () => {
      setLanguage(lang);
      applyLobbyTexts();
    });
    lobbyFlags.appendChild(btn);
  }
}

buildFlagPicker();
applyLobbyTexts();

const lobbyMap = document.getElementById("lobby-map") as HTMLCanvasElement;
const LOBBY_PX_PER_TILE = 6;

function drawLobbyMap(seed: number): void {
  const ctx = lobbyMap.getContext("2d");
  if (!ctx) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  lobbyMap.width = Math.floor(w * dpr);
  lobbyMap.height = Math.floor(h * dpr);
  lobbyMap.style.width = `${w}px`;
  lobbyMap.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cols = Math.ceil(w / LOBBY_PX_PER_TILE);
  const rows = Math.ceil(h / LOBBY_PX_PER_TILE);
  const i0 = -Math.floor(cols / 2);
  const j0 = -Math.floor(rows / 2);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = i0 + c;
      const j = j0 + r;
      const biome = biomeAt(seed, i, j);
      let color = BIOME_MINI_COLOR[biome];
      if (hasTreeAt(seed, i, j)) {
        color = biome === "wald" ? "#0f2a0f" : "#2c5520";
      }
      ctx.fillStyle = color;
      ctx.fillRect(
        c * LOBBY_PX_PER_TILE,
        r * LOBBY_PX_PER_TILE,
        LOBBY_PX_PER_TILE,
        LOBBY_PX_PER_TILE,
      );
    }
  }
}

let lobbyMapSeed = (Math.random() * 0xffffffff) >>> 0;
drawLobbyMap(lobbyMapSeed);
window.addEventListener("resize", () => drawLobbyMap(lobbyMapSeed));

const lobbyClock = document.getElementById("lobby-clock");
let worldBaseGameTimeSec: number | null = null;
let worldBaseEpochMs = 0;

function currentGameTimeSec(): number | null {
  if (worldBaseGameTimeSec === null) return null;
  return worldBaseGameTimeSec + (Date.now() - worldBaseEpochMs) / 1000;
}

function gameClockString(gameTimeSec: number): string {
  const p = phaseLengthsAt(gameTimeSec);
  const tt = ((gameTimeSec % DAY_LENGTH_SEC) + DAY_LENGTH_SEC) % DAY_LENGTH_SEC;
  let hour: number;
  if (tt < p.morning) {
    hour = 7 + (tt / Math.max(0.001, p.morning)) * 5;
  } else if (tt < p.morning + p.noon) {
    hour = 12 + ((tt - p.morning) / Math.max(0.001, p.noon)) * 3;
  } else if (tt < p.sunsetAt) {
    hour = 15 + ((tt - p.morning - p.noon) / Math.max(0.001, p.afternoon)) * 4;
  } else {
    hour = 19 + ((tt - p.sunsetAt) / Math.max(0.001, p.night)) * 12;
  }
  if (hour >= 24) hour -= 24;
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function updateLobbyClock(): void {
  if (!lobbyClock) return;
  const gt = currentGameTimeSec();
  if (gt === null) {
    lobbyClock.textContent = "…";
    return;
  }
  const s = t();
  const season = seasonAt(gt);
  const day = dayOfSeasonAt(gt);
  const phase = phaseAt(gt);
  lobbyClock.textContent =
    `${s.seasonIcon(season)} ${s.seasonLabel(season)} ${day}/${SEASON_LEN_DAYS} · ` +
    `${s.phaseIcon(phase)} ${gameClockString(gt)}`;
}
updateLobbyClock();
window.setInterval(updateLobbyClock, 1000);

(function fetchWorldInfo() {
  let settled = false;
  try {
    const ws = new WebSocket(SERVER_URL);
    ws.addEventListener("open", () => {
      try { ws.send(JSON.stringify({ type: "fetchWorldInfo" })); } catch {}
    });
    ws.addEventListener("message", (ev) => {
      if (settled) return;
      try {
        const m = JSON.parse(String(ev.data)) as ServerMessage;
        if (m.type === "worldInfo") {
          worldBaseGameTimeSec = m.gameTimeSec;
          worldBaseEpochMs = Date.now();
          settled = true;
          lobbyMapSeed = m.seed;
          updateLobbyClock();
          drawLobbyMap(lobbyMapSeed);
          ws.close();
        }
      } catch {}
    });
    ws.addEventListener("error", () => { ws.close(); });
    window.setTimeout(() => { if (!settled) ws.close(); }, 5000);
  } catch {}
})();

function setStatus(text: string): void {
  lobbyStatus.textContent = text;
}

function play(opts?: { spectator?: boolean }): void {
  const spectator = !!opts?.spectator;
  const s = t();
  let name: string;
  if (spectator) {
    name = "(Beobachter)";
  } else {
    name = nameInput.value.trim().slice(0, 20);
    if (!name) {
      setStatus(s.lobbyEnterName);
      nameInput.focus();
      return;
    }
    localStorage.setItem("rts-name", name);
  }
  const language = getLanguage();

  playBtn.disabled = true;
  nameInput.disabled = true;
  setStatus(spectator ? "Beobachter-Modus …" : s.lobbyConnecting);

  const net = new Net(SERVER_URL);
  let started = false;

  net.onMessage((msg: ServerMessage) => {
    if (msg.type === "init") {
      started = true;
      lobby.style.display = "none";
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: "game",
        backgroundColor: "#1a1a1a",
        scale: {
          mode: Phaser.Scale.RESIZE,
          width: window.innerWidth,
          height: window.innerHeight,
        },
        scene: [GameScene],
        disableContextMenu: true,
        fps: {
          target: 60,
          smoothStep: true,
        },
        render: {
          antialias: false,
          pixelArt: false,
          roundPixels: true,
          powerPreference: "high-performance",
        },
      });
      game.scene.start("GameScene", { net, init: msg });
    } else if (msg.type === "error") {
      setStatus(t().lobbyError(msg.message));
      playBtn.disabled = false;
      nameInput.disabled = false;
    }
  });

  net.connect(
    () => net.send({ type: "join", name, language, spectator: spectator || undefined }),
    () => {
      if (!started) {
        setStatus(t().lobbyConnectionLost);
        playBtn.disabled = false;
        nameInput.disabled = false;
      }
    },
  );
}

playBtn.addEventListener("click", () => play());
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") play();
});

if (lobbyIcon) {
  let clicks = 0;
  let clickTimer: number | null = null;
  lobbyIcon.addEventListener("click", () => {
    clicks += 1;
    if (clickTimer !== null) window.clearTimeout(clickTimer);
    if (clicks >= 3) {
      clicks = 0;
      play({ spectator: true });
      return;
    }
    clickTimer = window.setTimeout(() => {
      clicks = 0;
      clickTimer = null;
    }, 600);
  });
  lobbyIcon.style.cursor = "pointer";
  lobbyIcon.title = "3× klicken: Beobachter-Modus";
}
