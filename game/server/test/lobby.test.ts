import { ByteReader, ByteWriter, decodeError, decodeRoster, decodeWelcome, defaultLoadoutPick, encodeCreateRoom, encodeHello as hello, encodeJoinRoom, encodePickLoadout, encodePing, ErrorCode, loadGameData, Msg, PROTOCOL_VERSION } from "@redmond/shared";
import { describe, expect, it } from "vitest";
import {
  BAD_JOIN_BURST,
  cleanName,
  Close,
  Connection,
  CREATE_BURST,
  EMPTY_ROOM_TTL_MS,
  HEAVY_BURST,
  IpGate,
  LOBBY_TIMEOUT_MS,
  MAX_CONNECTIONS_PER_IP,
  RATE_BURST,
  RoomManager,
} from "../src/lobby.js";

/** A Hello from a page built with the same game data as the server. */
const encodeHello = (name: string) => hello(name, loadGameData().dataHash);

function fakeClient(rooms: RoomManager, clock: { t: number }, ip = "local", gate?: IpGate) {
  const sent: Uint8Array[] = [];
  const closed: { code: number; reason: string }[] = [];
  const conn = new Connection({ send: (b) => sent.push(b), close: (code, reason) => closed.push({ code, reason }), buffered: () => 0 }, rooms, () => clock.t, ip, gate);
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

    // Same protocol, but a page built from other game data (a tab left open across a deploy).
    const stale = fakeClient(rooms, clock);
    stale.conn.onMessage(hello("x", (loadGameData().dataHash + 1) >>> 0));
    expect(decodeError(stale.of(Msg.Error)[0])).toMatchObject({ code: ErrorCode.BadVersion, message: expect.stringMatching(/refresh/i) });
    expect(stale.closed).toHaveLength(1);

    // An older page's Hello (no data hash at all) still gets told to refresh, from the version alone.
    const older = fakeClient(rooms, clock);
    older.conn.onMessage(new ByteWriter().u8(Msg.Hello).u16(PROTOCOL_VERSION - 1).str("x").finish());
    expect(decodeError(older.of(Msg.Error)[0]).code).toBe(ErrorCode.BadVersion);

    const truncated = fakeClient(rooms, clock);
    truncated.conn.onMessage(Uint8Array.of(Msg.Hello, 1)); // version cut short
    expect(truncated.closed[0].code).toBe(Close.Protocol);

    const flood = fakeClient(rooms, clock);
    flood.conn.onMessage(encodeHello("x"));
    flood.conn.onMessage(encodeCreateRoom());
    await until(() => flood.of(Msg.Welcome).length === 1);
    for (let i = 0; i < RATE_BURST + 5; i++) flood.conn.onMessage(encodePing(i));
    expect(flood.closed[0]).toEqual({ code: Close.Policy, reason: "too many messages" });

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
    await until(() => rooms.count === 2); // the flood test's room and this one
    expect(rooms.players).toBe(0);
    expect(gone.of(Msg.Welcome)).toHaveLength(0);
  });

  it("limits each client address: connections, rooms created, and wrong room codes", async () => {
    const clock = { t: 0 };
    const rooms = new RoomManager(() => clock.t);
    const gate = new IpGate(() => clock.t);

    for (let i = 0; i < MAX_CONNECTIONS_PER_IP; i++) expect(gate.open("1.2.3.4")).toBe(true);
    expect(gate.open("1.2.3.4")).toBe(false);
    expect(gate.open("5.6.7.8")).toBe(true); // others are unaffected
    gate.close("1.2.3.4");
    expect(gate.open("1.2.3.4")).toBe(true);

    // Rooms: a burst, then roughly one every 10 s. Each connection here is a separate tab on one address.
    const tabs = Array.from({ length: CREATE_BURST + 1 }, () => fakeClient(rooms, clock, "9.9.9.9", gate));
    for (const tab of tabs) {
      tab.conn.onMessage(encodeHello("x"));
      tab.conn.onMessage(encodeCreateRoom());
    }
    await until(() => tabs.slice(0, CREATE_BURST).every((t) => t.of(Msg.Welcome).length === 1));
    const limited = tabs[CREATE_BURST];
    expect(decodeError(limited.of(Msg.Error)[0]).code).toBe(ErrorCode.RateLimited);
    clock.t += 10_000;
    limited.conn.onMessage(encodeCreateRoom()); // still in the lobby, and allowed again
    await until(() => limited.of(Msg.Welcome).length === 1);

    // Guessing codes: a few wrong ones are fine, then the connection is closed.
    const guesser = fakeClient(rooms, clock, "6.6.6.6", gate);
    guesser.conn.onMessage(encodeHello("x"));
    for (let i = 0; i < BAD_JOIN_BURST; i++) guesser.conn.onMessage(encodeJoinRoom("ZZZZ" + i));
    expect(guesser.closed).toEqual([]);
    guesser.conn.onMessage(encodeJoinRoom("ZZZZZ"));
    expect(decodeError(guesser.of(Msg.Error).at(-1)!).code).toBe(ErrorCode.RateLimited);
    expect(guesser.closed[0].code).toBe(Close.Policy);
    // A new connection from the same address is still limited.
    const again = fakeClient(rooms, clock, "6.6.6.6", gate);
    again.conn.onMessage(encodeHello("x"));
    again.conn.onMessage(encodeJoinRoom("ZZZZZ"));
    expect(again.closed[0].code).toBe(Close.Policy);

    // Idle addresses are forgotten once their limits have recovered.
    for (const c of [...tabs, guesser, again]) c.conn.onClose();
    gate.close("1.2.3.4");
    for (let i = 0; i < MAX_CONNECTIONS_PER_IP; i++) gate.close("1.2.3.4");
    gate.close("5.6.7.8");
    clock.t += 10 * 60_000;
    gate.sweep();
    expect(gate.size).toBe(0);
  });

  it("loadout picks are rate-limited: a burst is taken, the rest dropped (not disconnected)", async () => {
    const clock = { t: 0 };
    const rooms = new RoomManager(() => clock.t);
    const a = fakeClient(rooms, clock);
    a.conn.onMessage(encodeHello("a"));
    a.conn.onMessage(encodeCreateRoom());
    await until(() => a.of(Msg.Welcome).length === 1);
    const rosters = () => a.of(Msg.Roster).length;
    const before = rosters();
    const pick = encodePickLoadout(defaultLoadoutPick(loadGameData(), "brava"));
    for (let i = 0; i < HEAVY_BURST + 5; i++) a.conn.onMessage(pick);
    expect(rosters() - before).toBe(HEAVY_BURST); // each accepted pick is a new body (and a roster)
    expect(a.closed).toEqual([]);
    clock.t += 1000; // five more a second
    a.conn.onMessage(pick);
    expect(rosters() - before).toBe(HEAVY_BURST + 1);
  });

  it("cleans display names", () => {
    expect(cleanName("  ")).toBe("Player");
    expect(cleanName("a\u0000b\u202ec")).toBe("abc");
    expect(cleanName("x".repeat(40))).toHaveLength(24);
    expect([...cleanName("\u{1F600}".repeat(30))]).toHaveLength(24);
  });
});
