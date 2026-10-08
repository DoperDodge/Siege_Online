// A room of your own, for the Range Lab offline (Phase 3 M10, DECISIONS D-052): the same shared Room the
// game server runs, spoken to with the same messages, so hits, downs and the dummies work exactly as online.
// It runs in a Web Worker (localRoom.worker.ts) to keep the 64 Hz room off the page's thread; this class is
// the part that doesn't need a worker (tests drive it directly).
import {
  ByteReader,
  decodeCreateRoom,
  decodeHelloRest,
  decodeHelloVersion,
  encodeError,
  ErrorCode,
  handleRoomMessage,
  loadGameData,
  Msg,
  PROTOCOL_VERSION,
  ProtocolError,
  Room,
  TICK_HZ,
} from "@redmond/shared";

export const LOCAL_ROOM_CODE = "LOCAL";

export class LocalHost {
  private state: "hello" | "lobby" | "joining" | "room" | "closed" = "hello";
  private name = "You";
  private room: Room | null = null;
  private memberId = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly send: (bytes: Uint8Array) => void,
    private readonly close: (code: number, reason: string) => void,
  ) {}

  /** One message from the page. */
  onMessage(bytes: Uint8Array): void {
    if (this.state === "closed" || bytes.length === 0) return;
    const r = new ByteReader(bytes.subarray(1));
    try {
      if (this.state === "hello" && bytes[0] === Msg.Hello) this.hello(r);
      else if (this.state === "lobby" && bytes[0] === Msg.CreateRoom) void this.create(decodeCreateRoom(r).levelId);
      else if (this.state === "room") handleRoomMessage(this.room!, this.memberId, bytes[0], r);
    } catch (e) {
      if (!(e instanceof ProtocolError)) throw e;
      this.stop(1002, "bad message");
    }
  }

  /** One room tick (the worker's clock calls this; tests call it directly). */
  step(): void {
    if (this.state === "room") this.room!.step();
  }

  /** Step at 64 Hz until stopped, catching up after a late timer (as the game server does) but never racing through a long stall. */
  start(now: () => number = () => performance.now()): void {
    const period = 1000 / TICK_HZ;
    let next = now();
    const loop = () => {
      for (let n = 0; n < 4 && now() >= next; n++) {
        this.step();
        next += period;
      }
      if (now() - next > 250) next = now();
      this.timer = setTimeout(loop, Math.max(0, next - now()));
    };
    loop();
  }

  stop(code = 1000, reason = "closed"): void {
    if (this.state === "closed") return;
    this.state = "closed";
    if (this.timer) clearTimeout(this.timer);
    this.close(code, reason);
  }

  get roomOf(): Room | null {
    return this.room;
  }

  private hello(r: ByteReader) {
    if (decodeHelloVersion(r) !== PROTOCOL_VERSION) return this.refuse("The game has been updated. Refresh the page.");
    const { name, dataHash } = decodeHelloRest(r);
    if (dataHash !== loadGameData().dataHash) return this.refuse("The game data has been updated. Refresh the page.");
    this.name = name || "You";
    this.state = "lobby";
  }

  private refuse(message: string) {
    this.send(encodeError(ErrorCode.BadVersion, message));
    this.stop(1000, "version mismatch");
  }

  private async create(levelId: string) {
    this.state = "joining";
    const room = await Room.create(LOCAL_ROOM_CODE, levelId, { lab: true });
    if (this.state !== "joining") return;
    const id = room.join(this.name, { send: (b) => this.send(b), buffered: () => 0 });
    if (id === null) return this.stop(1011, "room full");
    this.room = room;
    this.memberId = id;
    this.state = "room";
  }
}
