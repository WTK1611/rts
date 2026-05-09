import { ClientMessage, ServerMessage } from "../shared/protocol";

export type NetHandler = (msg: ServerMessage) => void;

export class Net {
  ws: WebSocket | null = null;
  private handler: NetHandler | null = null;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  connect(onOpen: () => void, onClose: () => void): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener("open", onOpen);
    ws.addEventListener("close", onClose);
    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        this.handler?.(msg);
      } catch {
        // ignore
      }
    });
  }

  onMessage(h: NetHandler): void {
    this.handler = h;
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
