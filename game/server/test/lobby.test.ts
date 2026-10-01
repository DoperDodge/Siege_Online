import { ByteReader, decodeError, decodeRoster, decodeWelcome, encodeCreateRoom, encodeHello, encodeJoinRoom, ErrorCode, Msg, PROTOCOL_VERSION, ByteWriter } from "@redmond/shared";
import { describe, expect, it } from "vitest";
import { cleanName, Close, Connection, EMPTY_ROOM_TTL_MS, LOBBY_TIMEOUT_MS, RATE_BURST, RoomManager } from "../src/lobby.js";

function fakeClient(rooms: RoomManager, clock: { t: number }) {
  const sent: Uint8Array[] = [];
  const closed: { code: number; reason: string }[] = [];
  const conn = new Connection({ send: (b) => sent.push(b), close: (code, reason) => closed.push({ code, reason }), buffered: () => 0 }, rooms, () => clock.t);
  const of = (type: number) => sent.filter((b) => b[0] === type).map((b) => new ByteReader(b.subarray(1)));
  return { conn, sent, closed, of };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 10));
  expect(cond()).toBe(true);
}

describe("lobby", () => {
  it("creates a room, lets a second player join it by code, and removes it once empty for a while", async () => {
    const clock = { t: 0 };
    const rooms = new RoomManager(() => clock.t);
    const a = fakeClient(rooms, clock);
    a.conn.onMessage(encodeHello("Alpha"));
    a.conn.onMessage(encodeCreateRoom());
    await until(() => a.of(Msg.Welcome).length === 1);
    const welcome = decodeWelcome(a.of(Msg.Welcome)[0]);
    expect(welcome.version).toBe(PROTOCOL_VERSION);
    expect(welcome.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(a.conn.roomCode).toBe(welcome.roomCode);

    const b = fakeClient(rooms, clock);
    b.conn.onMessage(encodeHello("  Bravo\u202e\u0007  "));
    b.conn.onMessage(encodeJoinRoom(welcome.roomCode.toLowerCase()));
    expect(b.of(Msg.Welcome)).toHaveLength(1);
    const roster = decodeRoster(a.of(Msg.Roster).at(-1)!);
    expect(roster.entries.map((e) => e.name)).toEqual(["Alpha", "Bravo"]);
    expect(rooms.players).toBe(2);

    // Both leave; the room survives EMPTY_ROOM_TTL_MS, then goes.
    a.conn.onClose();
    b.conn.onClose();
    rooms.step();
    expect(rooms.get(welcome.roomCode)).not.toBeNull();
    clock.t += EMPTY_ROOM_TTL_MS;
    rooms.step();
    expect(rooms.get(welcome.roomCode)).toBeNull();
    expect(rooms.count).toBe(0);
  });

  it("refuses an unknown code but stays in the lobby", async () => {
    const clock = { t: 0 };
    const rooms = new RoomManager(() => clock.t);
    const a = fakeClient(rooms, clock);
    a.conn.onMessage(encodeHello("a"));
    a.conn.onMessage(encodeJoinRoom("ZZZZZ"));
    expect(decodeError(a.of(Msg.Error)[0]).code).toBe(ErrorCode.NoSuchRoom);
    expect(a.closed).toEqual([]);
    a.conn.onMessage(encodeCreateRoom());
    await until(() => a.of(Msg.Welcome).length === 1);
  });

  it("reports a full server instead of creating more rooms than allowed", async () => {
    const clock = { t: 0 };
    const rooms = new RoomManager(() => clock.t, "movement_lab", 1);
    const a = fakeClient(rooms, clock);
    const b = fakeClient(rooms, clock);
    for (const c of [a, b]) c.conn.onMessage(encodeHello("x"));
    a.conn.onMessage(encodeCreateRoom());
    b.conn.onMessage(encodeCreateRoom());
    await until(() => a.of(Msg.Welcome).length === 1 && b.of(Msg.Error).length === 1);
    expect(decodeError(b.of(Msg.Error)[0]).code).toBe(ErrorCode.ServerFull);
  });

  it("closes connections that break the protocol", async () => {
    const clock = { t: 0 };
    const rooms = new RoomManager(() => clock.t);

    const early = fakeClient(rooms, clock);
    early.conn.onMessage(encodeCreateRoom()); // before Hello
    expect(early.closed[0].code).toBe(Close.Protocol);

    const old = fakeClient(rooms, clock);
    old.conn.onMessage(new ByteWriter().u8(Msg.Hello).u16(PROTOCOL_VERSION + 1).str("x").finish());
    expect(decodeError(old.of(Msg.Error)[0]).code).toBe(ErrorCode.BadVersion);
    expect(old.closed).toHaveLength(1);

    const truncated = fakeClient(rooms, clock);
    truncated.conn.onMessage(Uint8Array.of(Msg.Hello, 1)); // version cut short
    expect(truncated.closed[0].code).toBe(Close.Protocol);

    const flood = fakeClient(rooms, clock);
    flood.conn.onMessage(encodeHello("x"));
    for (let i = 0; i < RATE_BURST + 5; i++) flood.conn.onMessage(encodeJoinRoom("ZZZZZ"));
    expect(flood.closed[0].code).toBe(Close.Policy);

    const idle = fakeClient(rooms, clock);
    clock.t += LOBBY_TIMEOUT_MS + 1;
    idle.conn.sweep();
    expect(idle.closed[0].reason).toBe("lobby timeout");

    // A connection that closes while its room is still loading never joins it.
    const gone = fakeClient(rooms, clock);
    gone.conn.onMessage(encodeHello("x"));
    gone.conn.onMessage(encodeCreateRoom());
    gone.conn.onClose();
    await settle();
    await until(() => rooms.count === 1);
    expect(rooms.players).toBe(0);
    expect(gone.of(Msg.Welcome)).toHaveLength(0);
  });

  it("cleans display names", () => {
    expect(cleanName("  ")).toBe("Player");
    expect(cleanName("a\u0000b\u202ec")).toBe("abc");
    expect(cleanName("x".repeat(40))).toHaveLength(24);
    expect([...cleanName("\u{1F600}".repeat(30))]).toHaveLength(24);
  });
});
