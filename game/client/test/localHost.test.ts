// The Range Lab's offline room (Phase 3 M10, DECISIONS D-052): the page talks to it exactly as to the game
// server. Here a real ClientSession drives the host the Web Worker wraps, with no worker in between.
import { describe, expect, it } from "vitest";
import { Btn, ByteReader, ClientSession, decodeError, DT, encodeCreateRoom, encodeHello, encodeLabTool, loadGameData, Msg, PawnMode, Stance, TICK_HZ, type GameEvent, type InputCmd } from "@redmond/shared";
import { LocalHost, LOCAL_ROOM_CODE } from "../src/net/localHost.js";

async function offlineRange() {
  const clock = { t: 0 };
  const events: GameEvent[] = [];
  const closed: string[] = [];
  let host: LocalHost | null = null;
  const session = new ClientSession({ send: (b) => host!.onMessage(b), now: () => clock.t, onEvents: (_t, evs) => events.push(...evs) });
  host = new LocalHost((b) => session.handle(b), (_code, reason) => closed.push(reason));
  host.onMessage(encodeHello("Ulo", loadGameData().dataHash));
  host.onMessage(encodeCreateRoom("range_lab"));
  for (let i = 0; i < 100 && !host.roomOf; i++) await new Promise((r) => setTimeout(r, 10));
  await session.loaded();
  const tick = (cmd: Partial<Omit<InputCmd, "seq">> = {}) => {
    clock.t += DT * 1000;
    if (session.ready) session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...cmd });
    host!.step();
  };
  for (let i = 0; i < 10; i++) tick();
  return { host, session, events, closed, tick };
}

describe("the Range Lab offline (a room of its own)", () => {
  it("joins like a server room: the level, you and every dummy; a headshot kills one, and it comes back", async () => {
    const { host, session, events, tick } = await offlineRange();
    expect(session.ready).toBe(true);
    expect(session.roomCode).toBe(LOCAL_ROOM_CODE);
    expect(session.sim!.level.def.id).toBe("range_lab");
    const dummies = session.roster.filter((e) => e.kind === 1);
    expect(dummies).toHaveLength(loadGameData().levels.get("range_lab")!.dummies.length);
    expect(session.roster.filter((e) => e.kind === 0).map((e) => e.name)).toEqual(["Ulo"]);
    // 5 m in front of the 5 m dummy, sights on its head.
    const lane = dummies.find((e) => e.name === "Lane 5 m")!;
    host.onMessage(encodeLabTool({ kind: "teleport", x: -1.5, y: 0, z: 20, yawDeg: 0 }));
    for (let i = 0; i < 60; i++) tick({ buttons: Btn.Ads });
    tick({ buttons: Btn.Ads | Btn.Fire });
    for (let i = 0; i < 4; i++) tick({ buttons: Btn.Ads });
    expect(events.find((e) => e.kind === "hitConfirm")).toMatchObject({ victimPawn: lane.pawnIds[0], headshot: true, killed: true });
    expect(events.find((e) => e.kind === "kill")).toMatchObject({ victimPawn: lane.pawnIds[0], victimCtrl: lane.controllerId });
    // It comes back (the same body, a new life) dummyRespawnS later.
    for (let i = 0; i < loadGameData().modes.get("lab")!.dummyRespawnS * TICK_HZ + 4; i++) tick();
    expect(session.remoteAt(lane.pawnIds[0])?.mode).toBe(PawnMode.Walk);
  });

  it("refuses a page built from other game data, and tells it why", async () => {
    const sent: Uint8Array[] = [];
    const closed: string[] = [];
    const host = new LocalHost((b) => sent.push(b), (_c, reason) => closed.push(reason));
    host.onMessage(encodeHello("Old tab", loadGameData().dataHash ^ 1));
    expect(sent.map((b) => b[0])).toEqual([Msg.Error]);
    expect(decodeError(new ByteReader(sent[0].subarray(1))).message).toMatch(/Refresh the page/);
    expect(closed).toHaveLength(1);
  });
});
