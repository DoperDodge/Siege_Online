// The browser end of a match connection (PLAN §5): a WebSocket to the server's /ws, a network condition
// simulator for testing (PLAN §16.9: latency, jitter and loss; PLAN §17 Phase 2: "two PCs with 100 ms
// simulated latency"), and the shared ClientSession that predicts our own movement and interpolates
// everyone else.
import { ClientSession, encodeCreateRoom, encodeHello, encodeJoinRoom, loadGameData, type ClientSessionOptions } from "@redmond/shared";
import type { SocketLike } from "./local.js";

/** The game server's WebSocket address: same host as the page (`?server=host:port` overrides it). */
export function serverUrl(): string {
  const override = new URLSearchParams(location.search).get("server");
  const u = new URL("/ws", override ? `${location.protocol}//${override}` : location.href);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.href;
}

/** Holds messages back by a delay without ever reordering them (a later message never overtakes, as in TCP). */
class DelayLine {
  private readonly queue: { at: number; fn: () => void }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly delayMs: () => number) {}

  push(fn: () => void) {
    const d = this.delayMs();
    if (d <= 0 && this.queue.length === 0) return fn();
    const at = Math.max(performance.now() + d, this.queue.at(-1)?.at ?? 0);
    this.queue.push({ at, fn });
    this.schedule();
  }

  private schedule() {
    if (this.timer || this.queue.length === 0) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const now = performance.now();
      while (this.queue.length && this.queue[0].at <= now + 0.5) this.queue.shift()!.fn();
      this.schedule();
    }, Math.max(0, this.queue[0].at - performance.now()));
  }
}

const CLOSE_REASONS: Record<number, string> = {
  1006: "Lost connection to the server.",
  1008: "The server closed the connection (too many messages).",
  1002: "The server rejected a message from this client.",
  1011: "The server hit an error.",
  1012: "The server is restarting. Reconnect in a moment.",
};

/** Simulated network conditions, read for every message so they can change mid-game. */
export interface NetConditions {
  /** Extra round trip, ms (half each way). */
  rttMs: number;
  /** Extra random delay per message, 0..jitterMs each way (order is kept, as in TCP). */
  jitterMs: number;
  /**
   * Percent of messages "lost". Over TCP a lost packet is resent after a timeout and everything behind it
   * waits (head-of-line blocking), so a loss shows up as a LOSS_STALL_MS stall of that direction.
   */
  lossPct: number;
}
const LOSS_STALL_MS = 200;

export interface OnlineOptions {
  name: string;
  /** Join this room code, or create a new room when null. */
  room: string | null;
  /** The level a room created here loads (a joined room has its own). */
  levelId: string;
  conditions: () => NetConditions;
  session: Omit<ClientSessionOptions, "send" | "now">;
  onClose(reason: string): void;
  /** Where the "server" is: the game server's WebSocket by default, or a room in the page (net/local.ts). */
  socket?: () => SocketLike;
}

export class OnlineConnection {
  readonly session: ClientSession;
  private readonly ws: SocketLike;
  private readonly up: DelayLine;
  private readonly down: DelayLine;
  private readonly pinger: ReturnType<typeof setInterval>;
  closed = false;

  constructor(private readonly o: OnlineOptions) {
    const delay = () => {
      const c = o.conditions();
      return c.rttMs / 2 + Math.random() * c.jitterMs + (Math.random() * 100 < c.lossPct ? LOSS_STALL_MS : 0);
    };
    this.up = new DelayLine(delay);
    this.down = new DelayLine(delay);
    this.session = new ClientSession({ ...o.session, send: (b) => this.send(b), now: () => performance.now() });
    this.ws = o.socket?.() ?? new WebSocket(serverUrl());
    this.ws.binaryType = "arraybuffer";
    this.ws.onopen = () => {
      this.send(encodeHello(o.name, loadGameData().dataHash));
      this.send(o.room ? encodeJoinRoom(o.room) : encodeCreateRoom(o.levelId));
    };
    this.ws.onmessage = (e) => {
      if (!(e.data instanceof ArrayBuffer)) return;
      const bytes = new Uint8Array(e.data);
      this.down.push(() => this.receive(bytes));
    };
    // The close goes through the same delay as messages, so an error sent just before it (a rate
    // limit, a restart) is still read first.
    this.ws.onclose = (e) =>
      this.down.push(() => {
        clearInterval(this.pinger);
        if (this.closed) return;
        this.closed = true;
        o.onClose(CLOSE_REASONS[e.code] ?? (e.reason || "Disconnected from the server."));
      });
    // Round-trip time for the stats overlay (the session smooths it).
    this.pinger = setInterval(() => {
      if (this.session.sim) this.session.ping();
    }, 1000);
  }

  send(bytes: Uint8Array) {
    this.up.push(() => {
      if (this.ws.readyState === 1 /* OPEN */) this.ws.send(bytes as Uint8Array<ArrayBuffer>); // our encoders never use shared memory
    });
  }

  close() {
    this.closed = true;
    clearInterval(this.pinger);
    this.ws.close(1000, "left");
  }

  private receive(bytes: Uint8Array) {
    if (this.closed) return;
    try {
      this.session.handle(bytes);
    } catch (e) {
      console.error("[redmond] bad message from the server:", e);
      this.close();
      this.o.onClose("The server sent something this page can't read. Refresh the page.");
    }
  }
}
