// Rooms by code, and the protocol state machine of one connection (PLAN §5). No sockets in here: main.ts
// wires it to WebSockets, and test/lobby.test.ts drives it with plain functions.
import { randomInt } from "node:crypto";
import {
  ByteReader,
  decodeDebugShot,
  decodeHello,
  decodeInput,
  decodeJoinRoom,
  decodeLabTool,
  decodePickOperator,
  decodePing,
  encodeError,
  ErrorCode,
  MAX_NAME,
  Msg,
  PROTOCOL_VERSION,
  ProtocolError,
  Room,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "@redmond/shared";

export const MAX_ROOMS = 50;
/** An empty room is kept this long (someone may be reconnecting), then removed. */
export const EMPTY_ROOM_TTL_MS = 60_000;
/** A connection that hasn't joined a room by now is closed. */
export const LOBBY_TIMEOUT_MS = 120_000;
/**
 * Messages per second per connection, with a burst allowance. A client sends 64 inputs a second plus
 * a ping; after a 2-second TCP stall about 130 inputs arrive at once, which the burst covers.
 */
export const RATE_PER_SECOND = 200;
export const RATE_BURST = 400;
/** Messages that respawn a body or cast rays cost the server far more than an input: a tighter limit. */
export const HEAVY_PER_SECOND = 5;
export const HEAVY_BURST = 10;

/** WebSocket close codes (RFC 6455 §7.4). */
export const Close = { Normal: 1000, Protocol: 1002, Policy: 1008, Internal: 1011, Restarting: 1012 } as const;

export class RoomManager {
  private readonly rooms = new Map<string, { room: Room; emptySince: number | null }>();
  /** Codes of rooms still loading their level. */
  private readonly pending = new Set<string>();

  constructor(
    private readonly now: () => number,
    private readonly levelId = "movement_lab",
    private readonly maxRooms = MAX_ROOMS,
  ) {}

  get count(): number {
    return this.rooms.size;
  }

  get players(): number {
    let n = 0;
    for (const r of this.rooms.values()) n += r.room.size;
    return n;
  }

  get(code: string): Room | null {
    return this.rooms.get(code)?.room ?? null;
  }

  /** A new room with a fresh code, or null when the server already has as many rooms as it allows. */
  async create(): Promise<Room | null> {
    if (this.rooms.size + this.pending.size >= this.maxRooms) return null;
    let code: string;
    do code = Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]).join("");
    while (this.rooms.has(code) || this.pending.has(code));
    this.pending.add(code);
    try {
      const room = await Room.create(code, this.levelId, { lab: true });
      this.rooms.set(code, { room, emptySince: this.now() });
      return room;
    } finally {
      this.pending.delete(code);
    }
  }

  /** One server tick for every room; rooms empty for longer than EMPTY_ROOM_TTL_MS are removed. */
  step(): void {
    const now = this.now();
    for (const [code, r] of this.rooms) {
      if (r.room.size === 0) {
        r.emptySince ??= now;
        if (now - r.emptySince >= EMPTY_ROOM_TTL_MS) this.rooms.delete(code);
        continue; // nobody to simulate for
      }
      r.emptySince = null;
      r.room.step();
    }
  }

  /** Totals over every room (for /stats). */
  stats() {
    const t = { ticks: 0, corrections: 0, droppedInputs: 0, idledTicks: 0, skippedSnapshots: 0 };
    for (const { room } of this.rooms.values()) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += room.stats[k];
    return t;
  }
}

/** What a Connection needs from its socket. */
export interface Transport {
  send(bytes: Uint8Array): void;
  close(code: number, reason: string): void;
  /** Bytes queued on the socket but not yet sent. */
  buffered(): number;
}

/** Display names: no control or bidirectional-override characters, at most MAX_NAME characters. */
export function cleanName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").trim();
  return [...name].slice(0, MAX_NAME).join("") || "Player";
}

class Bucket {
  private tokens: number;
  private last: number;
  constructor(
    private readonly rate: number,
    private readonly burst: number,
    now: number,
  ) {
    this.tokens = burst;
    this.last = now;
  }
  take(now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}

type State = "hello" | "lobby" | "joining" | "room" | "closed";

/**
 * One client: Hello (protocol version and name) → CreateRoom or JoinRoom → in-room messages. Anything
 * malformed or out of order closes the connection; the server never trusts a client message.
 */
export class Connection {
  private state: State = "hello";
  private name = "Player";
  private room: Room | null = null;
  private memberId = 0;
  private readonly openedAt: number;
  private readonly rate: Bucket;
  private readonly heavy: Bucket;

  constructor(
    private readonly t: Transport,
    private readonly rooms: RoomManager,
    private readonly now: () => number,
  ) {
    this.openedAt = now();
    this.rate = new Bucket(RATE_PER_SECOND, RATE_BURST, this.openedAt);
    this.heavy = new Bucket(HEAVY_PER_SECOND, HEAVY_BURST, this.openedAt);
  }

  get roomCode(): string | null {
    return this.room?.code ?? null;
  }

  get closed(): boolean {
    return this.state === "closed";
  }

  onMessage(bytes: Uint8Array): void {
    if (this.state === "closed") return;
    if (!this.rate.take(this.now())) return this.close(Close.Policy, "too many messages");
    if (bytes.length === 0) return this.close(Close.Protocol, "empty message");
    try {
      this.dispatch(bytes[0], new ByteReader(bytes.subarray(1)));
    } catch (e) {
      if (e instanceof ProtocolError) return this.close(Close.Protocol, "bad message");
      console.error("[redmond] message handler failed:", e);
      this.close(Close.Internal, "server error");
    }
  }

  /** The socket closed (either side). */
  onClose(): void {
    if (this.room && this.state === "room") this.room.leave(this.memberId);
    this.room = null;
    this.state = "closed";
  }

  /** Called about once a second: closes connections that never got into a room. */
  sweep(): void {
    if ((this.state === "hello" || this.state === "lobby") && this.now() - this.openedAt > LOBBY_TIMEOUT_MS) this.close(Close.Policy, "lobby timeout");
  }

  /** Server shutdown: tell the client why, then close. */
  shutdown(): void {
    if (this.state === "closed") return;
    this.t.send(encodeError(ErrorCode.ServerRestarting, "The server is restarting. Reconnect in a moment."));
    this.close(Close.Restarting, "server restarting");
  }

  private close(code: number, reason: string) {
    if (this.state === "closed") return;
    this.onClose();
    this.t.close(code, reason);
  }

  private dispatch(type: number, r: ByteReader) {
    switch (this.state) {
      case "hello":
        return type === Msg.Hello ? this.hello(r) : this.close(Close.Protocol, "expected hello");
      case "lobby":
        if (type === Msg.CreateRoom) return this.create();
        if (type === Msg.JoinRoom) return this.join(decodeJoinRoom(r).code);
        return this.close(Close.Protocol, "expected create or join");
      case "joining":
        return; // the room is loading; the client waits for Welcome before sending anything else
      case "room":
        return this.inRoom(type, r);
    }
  }

  private hello(r: ByteReader) {
    const { version, name } = decodeHello(r);
    if (version !== PROTOCOL_VERSION) {
      this.t.send(encodeError(ErrorCode.BadVersion, "The game has been updated. Refresh the page."));
      return this.close(Close.Normal, "protocol version mismatch");
    }
    this.name = cleanName(name);
    this.state = "lobby";
  }

  private create() {
    this.state = "joining";
    this.rooms.create().then(
      (room) => {
        if (this.state !== "joining") return; // the client left while the level loaded
        if (!room) {
          this.state = "lobby";
          this.t.send(encodeError(ErrorCode.ServerFull, "The server has no free rooms. Try again later."));
          return;
        }
        this.enter(room);
      },
      (e: unknown) => {
        console.error("[redmond] room creation failed:", e);
        this.close(Close.Internal, "room creation failed");
      },
    );
  }

  private join(code: string) {
    const room = this.rooms.get(code);
    if (!room) return this.t.send(encodeError(ErrorCode.NoSuchRoom, `No room with code ${code.replace(/[^A-Z0-9]/g, "").slice(0, 8)}`));
    this.enter(room);
  }

  private enter(room: Room) {
    const id = room.join(this.name, this.t); // sends Welcome, or RoomFull
    if (id === null) {
      this.state = "lobby";
      return;
    }
    this.room = room;
    this.memberId = id;
    this.state = "room";
  }

  private inRoom(type: number, r: ByteReader) {
    const room = this.room!;
    const id = this.memberId;
    switch (type) {
      case Msg.Input:
        return room.onInput(id, decodeInput(r));
      case Msg.Ping:
        return room.onPing(id, decodePing(r).clientTime);
    }
    if (!this.heavy.take(this.now())) return; // drop, don't disconnect: a key held down can repeat
    switch (type) {
      case Msg.Resync:
        return room.onResync(id);
      case Msg.PickOperator:
        return room.pickOperator(id, decodePickOperator(r).operatorId);
      case Msg.LabTool:
        return room.onLabTool(id, decodeLabTool(r));
      case Msg.DebugShot:
        return room.onDebugShot(id, decodeDebugShot(r).viewTick);
      default:
        return this.close(Close.Protocol, "unexpected message");
    }
  }
}
