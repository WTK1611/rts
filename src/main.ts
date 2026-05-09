import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { Net } from "./net";
import { ServerMessage } from "../shared/protocol";

const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  `ws://${window.location.hostname}:8787`;

const lobby = document.getElementById("lobby") as HTMLDivElement;
const lobbyTitle = document.getElementById("lobby-title") as HTMLDivElement;
const lobbyStatus = document.getElementById("lobby-status") as HTMLDivElement;
const nameInput = document.getElementById("name-input") as HTMLInputElement;
const playBtn = document.getElementById("play-btn") as HTMLButtonElement;

nameInput.value = localStorage.getItem("rts-name") ?? "";

function setStatus(text: string): void {
  lobbyStatus.textContent = text;
}

function play(): void {
  const name = nameInput.value.trim().slice(0, 20);
  if (!name) {
    setStatus("Bitte Namen eingeben");
    nameInput.focus();
    return;
  }
  localStorage.setItem("rts-name", name);

  playBtn.disabled = true;
  nameInput.disabled = true;
  setStatus("Verbinde …");

  const net = new Net(SERVER_URL);
  let started = false;

  net.onMessage((msg: ServerMessage) => {
    if (msg.type === "queued") {
      lobbyTitle.textContent = `Hi ${name}!`;
      setStatus("Suche Mitspieler …");
    } else if (msg.type === "init") {
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
      });
      game.scene.start("GameScene", { net, init: msg });
    } else if (msg.type === "opponentLeft") {
      alert("Mitspieler hat das Spiel verlassen.");
      window.location.reload();
    } else if (msg.type === "error") {
      setStatus(`Fehler: ${msg.message}`);
      playBtn.disabled = false;
      nameInput.disabled = false;
    }
  });

  net.connect(
    () => net.send({ type: "join", name }),
    () => {
      if (!started) {
        setStatus("Verbindung verloren");
        playBtn.disabled = false;
        nameInput.disabled = false;
      }
    },
  );
}

playBtn.addEventListener("click", play);
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") play();
});
