// The page's end of the Range Lab's offline room (DECISIONS D-052): looks enough like a WebSocket for
// OnlineConnection, but the "server" is a room in a Web Worker (localRoom.worker.ts).
import type { FromLocalRoom } from "./localRoom.worker.js";

/** What OnlineConnection needs from a socket (a browser WebSocket has all of it). */
export interface SocketLike {
  binaryType: BinaryType;
  readonly readyState: number;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  send(bytes: Uint8Array<ArrayBuffer>): void;
  close(code?: number, reason?: string): void;
}

export class LocalSocket implements SocketLike {
  binaryType: BinaryType = "arraybuffer";
  readyState = 0; // CONNECTING, then 1 OPEN, 3 CLOSED (WebSocket's values)
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  private readonly worker: Worker;

  constructor() {
    this.worker = new Worker(new URL("./localRoom.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<FromLocalRoom>) => {
      const m = e.data;
      if (m.kind === "open") {
        this.readyState = 1;
        this.onopen?.(new Event("open"));
      } else if (m.kind === "data") this.onmessage?.(new MessageEvent("message", { data: m.bytes }));
      else this.ended(m.code, m.reason);
    };
    // Not 1011: the page words that code as a server error, and this message says more.
    this.worker.onerror = (e) => this.ended(4000, `The offline room stopped: ${e.message}`);
  }

  send(bytes: Uint8Array<ArrayBuffer>): void {
    if (this.readyState !== 1) return;
    const copy = bytes.slice();
    this.worker.postMessage(copy.buffer, [copy.buffer]);
  }

  close(code = 1000, reason = "left"): void {
    this.ended(code, reason);
  }

  private ended(code: number, reason: string) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.worker.terminate();
    this.onclose?.(new CloseEvent("close", { code, reason }));
  }
}
