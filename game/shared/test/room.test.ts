// Room + ClientSession in one process, messages delivered in order once per tick (zero latency unless a
// test holds them back). Covers the Phase 2 review findings: respawn, operator picks, withheld inputs,
// shots, lobby errors and resyncs.
import { describe, expect, it } from "vitest";
import {
  Btn,
  ByteReader,
  ClientSession,
  decodeInput,
  decodeLabTool,
  decodePickLoadout,
  defaultLoadoutPick,
  decodePing,
  DT,
  encodeError,
  encodeLabTool,
  encodePickLoadout,
  loadGameData,
  ErrorCode,
  MAX_HOLD_TICKS,
  Msg,
  Room,
  Stance,
  type InputCmd,
  type ShotResult,
} from "../src/index.js";

type Cmd = Partial<Omit<InputCmd, "seq">>;

async function harness(operators: string[]) {
  const room = await Room.create("TEST1", "movement_lab", { lab: true });
  const clock = { t: 0 };
  const clients = operators.map((op, i) => {
    const toClient: Uint8Array[] = [];
    const toServer: Uint8Array[] = [];
    const shots: ShotResult[] = [];
    const session = new ClientSession({ send: (b) => toServer.push(b), now: () => clock.t, onShot: (s) => shots.push(s) });
    const id = room.join(`p${i}`, { send: (b) => toClient.push(b), buffered: () => 0 }, op)!;
    return { session, id, toClient, toServer, shots, holdUp: false };
  });
  const toServer = (c: (typeof clients)[number]) => {
    for (const b of c.toServer.splice(0)) {
      const r = new ByteReader(b.subarray(1));
      if (b[0] === Msg.Input) room.onInput(c.id, decodeInput(r));
      else if (b[0] === Msg.Resync) room.onResync(c.id);
      else if (b[0] === Msg.Ping) room.onPing(c.id, decodePing(r).clientTime);
      else if (b[0] === Msg.LabTool) room.onLabTool(c.id, decodeLabTool(r));
      else if (b[0] === Msg.PickLoadout) room.pickLoadout(c.id, decodePickLoadout(r));
    }
  };
  const toClients = () => {
    for (const c of clients) for (const b of c.toClient.splice(0)) c.session.handle(b);
  };
  toClients();
  await Promise.all(clients.map((c) => c.session.loaded()));
  /** One tick: every client predicts and sends (unless `holdUp`), the server steps, snapshots arrive. */
  const tick = (cmds: Cmd[] = []) => {
    clock.t += DT * 1000;
    clients.forEach((c, i) => {
      c.session.tick({ forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0, ...cmds[i] });
      if (!c.holdUp) toServer(c);
    });
    room.step();
    toClients();
  };
  const ticks = (n: number, cmds: Cmd[] = []) => {
    for (let i = 0; i < n; i++) tick(cmds);
  };
  ticks(8); // everyone has their first correction and is predicting
  return { room, clients, tick, ticks, toServer, clock };
}

const own = (c: { session: ClientSession }) => c.session.sim!.pawns.get(c.session.ctrl!.possessedPawnId)!.state;

describe("room and client session", () => {
  it("respawning gives the client its new body (no endless corrections) and tells everyone else", async () => {
    const h = await harness(["sledge", "mute"]);
    const [a, b] = h.clients;
    h.ticks(32, [{ forward: 1 }]);
    const oldPawns = [...a.session.ctrl!.pawnIds];
    a.toServer.push(encodeLabTool({ kind: "respawn" }));
    h.ticks(16, [{ forward: 1 }]);
    const ctrl = a.session.ctrl!;
    expect(ctrl.pawnIds).not.toEqual(oldPawns);
    expect(a.session.sim!.pawns.has(ctrl.possessedPawnId)).toBe(true);
    expect(a.session.ready).toBe(true);
    const before = h.room.memberInfo(a.id)!.corrections;
    h.ticks(64, [{ forward: 1 }]);
    expect(h.room.memberInfo(a.id)!.corrections - before).toBe(0);
    // b knows the new body: its roster lists it and it's drawn as a remote, not the old one.
    expect(b.session.roster.find((e) => e.name === "p0")!.pawnIds).toEqual(ctrl.pawnIds);
    expect(b.session.remoteIds()).toContain(ctrl.possessedPawnId);
    expect(b.session.remoteIds()).not.toContain(oldPawns[0]);
  });

  it("inputs in flight for the old body don't move the new one after an operator pick", async () => {
    const h = await harness(["sledge"]);
    const [a] = h.clients;
    // Sprinting, with ~6 ticks of inputs still on their way when the pick reaches the server.
    a.holdUp = true;
    h.ticks(6, [{ forward: 1, buttons: Btn.Sprint }]);
    a.toServer.unshift(encodePickLoadout(defaultLoadoutPick(loadGameData(), "fuze")));
    h.toServer(a);
    const fresh = h.room.sim.pawns.get(h.room.roster()[0].pawnIds[0])!.state;
    const spawn = { x: fresh.x, z: fresh.z };
    a.holdUp = false;
    h.ticks(20); // standing still on the new body
    const state = h.room.sim.pawns.get(a.session.ctrl!.possessedPawnId)!.state;
    expect(a.session.ctrl!.operatorId).toBe("fuze");
    expect(Math.hypot(state.x - spawn.x, state.z - spawn.z)).toBeLessThan(0.01); // never sprinted off
    expect(own(a).x).toBe(state.x);
    expect(own(a).z).toBe(state.z);
  });

  it("a player who stops sending inputs is held still briefly, then falls like anyone else", async () => {
    const h = await harness(["sledge"]);
    const [a] = h.clients;
    a.toServer.push(encodeLabTool({ kind: "teleport", x: 0, y: 3, z: 12, yawDeg: 0 })); // in the air
    h.tick();
    a.holdUp = true; // inputs stop reaching the server (a stall, or a cheat)
    const pawn = () => h.room.sim.pawns.get(a.session.ctrl!.possessedPawnId)!.state;
    const y0 = pawn().y;
    h.ticks(MAX_HOLD_TICKS - 2);
    expect(pawn().y).toBe(y0); // a short stall costs nothing
    h.ticks(48);
    expect(pawn().y).toBeLessThan(y0 - 2.5); // fell (and landed)
  });

  it("a shot rides on the input that fired it: judged with that input's view, and claimed view times are bounded", async () => {
    const h = await harness(["sledge", "mute"]);
    const [a, b] = h.clients;
    a.toServer.push(encodeLabTool({ kind: "teleport", x: 0, y: 0, z: 4, yawDeg: 180 }));
    b.toServer.push(encodeLabTool({ kind: "teleport", x: 0, y: 0, z: 12, yawDeg: 0 }));
    h.ticks(40, [{ yaw: Math.PI, pitch: -0.05 }]);
    h.tick([{ yaw: Math.PI, pitch: -0.05, buttons: Btn.Fire }]);
    h.ticks(2, [{ yaw: Math.PI, pitch: -0.05 }]);
    expect(a.shots).toHaveLength(1);
    expect(a.shots[0].hit?.pawnId).toBe(b.session.ctrl!.possessedPawnId);
    expect(a.shots[0].dir[2]).toBeGreaterThan(0.99); // along the input's view (+Z), not some older one
    // Sledge's L85A2 is automatic: once the last shot's cadence has passed, holding the trigger for N ticks
    // fires ⌈N · 670 / 3840⌉ shots (one per 5.7 ticks), every one judged; then looking away and firing misses.
    h.ticks(8, [{ yaw: Math.PI, pitch: -0.05 }]);
    h.ticks(12, [{ yaw: Math.PI, pitch: -0.05, buttons: Btn.Fire }]);
    h.ticks(2, [{ yaw: Math.PI, pitch: -0.05 }]);
    expect(a.shots).toHaveLength(1 + Math.ceil((12 * 670) / 3840));
    h.ticks(6, [{ yaw: 0 }]); // turn away (and past the fire interval: a click inside it is dropped)
    const before = a.shots.length;
    h.tick([{ yaw: 0, buttons: Btn.Fire }]);
    h.tick();
    expect(a.shots).toHaveLength(before + 1);
    expect(a.shots.at(-1)!.hit).toBeNull();
    h.ticks(8); // past the rifle's fire interval
    // A client claiming it draws others far in the past is held to the interpolation ceiling (150 ms ≈
    // 9.6 ticks behind its newest snapshot), well inside the 250 ms (16-tick) rewind cap.
    a.holdUp = true;
    h.ticks(10);
    const now = h.room.sim.tick;
    a.toServer.length = 0;
    const cmd = { seq: (h.room.memberInfo(a.id)!.lastSeq + 10) & 0xffff, forward: 0, strafe: 0, yaw: Math.PI, pitch: -0.05, buttons: Btn.Fire, stance: Stance.Stand, lean: 0 as const };
    h.room.onInput(a.id, { cmd, predictedHash: 0, epoch: a.session.epoch, snapTick: now & 0xffff, viewBackQ8: 0xffff });
    h.room.step();
    for (const b of a.toClient.splice(0)) a.session.handle(b);
    expect(a.shots).toHaveLength(before + 2);
    expect(a.shots.at(-1)!.serverTick - a.shots.at(-1)!.rewoundTick).toBeLessThan(11.5);
  });

  it("trickling one input every 16 ticks doesn't slow a body down either", async () => {
    const h = await harness(["sledge"]);
    const [a] = h.clients;
    a.toServer.push(encodeLabTool({ kind: "teleport", x: 3, y: 4, z: 14, yawDeg: 0 }));
    h.tick();
    const pawn = () => h.room.sim.pawns.get(a.session.ctrl!.possessedPawnId)!.state;
    a.holdUp = true;
    for (let t = 0; t < 160; t++) {
      h.tick();
      if (t % 16 === 15) {
        // let only the newest input through
        const inputs = a.toServer.filter((m) => m[0] === Msg.Input);
        a.toServer.length = 0;
        a.toServer.push(inputs.at(-1)!);
        h.toServer(a);
      }
    }
    expect(pawn().y).toBeLessThan(0.1); // landed: a 4 m fall takes about a second
  });

  it("a body that is only waiting for its client (joining, respawning) costs exactly one correction", async () => {
    const h = await harness(["sledge"]);
    const [a] = h.clients;
    const before = h.room.memberInfo(a.id)!.corrections;
    a.toServer.push(encodeLabTool({ kind: "respawn" }));
    // The client takes a while to send its first input for the new body (a slow round trip).
    a.holdUp = true;
    h.ticks(40);
    a.toServer.length = 0;
    a.holdUp = false;
    h.ticks(64, [{ forward: 1 }]);
    expect(h.room.memberInfo(a.id)!.corrections - before).toBe(1);
    // And straight away, standing still (the spawn state must be exactly what the correction carries).
    for (const op of ["fuze", "skopos", "mute"]) {
      const start = h.room.memberInfo(a.id)!.corrections;
      a.toServer.push(encodePickLoadout(defaultLoadoutPick(loadGameData(), op)));
      h.ticks(64);
      expect(h.room.memberInfo(a.id)!.corrections - start, op).toBe(1);
    }
  });

  it("test shots fired during a catch-up after a stall all count", async () => {
    const h = await harness(["sledge", "mute"]);
    const [a] = h.clients;
    h.ticks(16);
    a.holdUp = true;
    // Click every 10 client ticks through a 30-tick stall, then let the backlog through at once.
    for (let t = 0; t < 30; t++) h.tick([{ yaw: Math.PI, buttons: t % 10 === 0 ? Btn.Fire : 0 }]);
    a.holdUp = false;
    h.ticks(40);
    expect(a.shots).toHaveLength(3);
  });

  it("claiming an older snapshot on the input that fires is held to the lag the connection has shown", async () => {
    const h = await harness(["sledge", "mute"]);
    const [a] = h.clients;
    h.ticks(64); // inputs establish this client's lag (zero here)
    a.holdUp = true;
    h.ticks(10);
    a.toServer.length = 0;
    const now = h.room.sim.tick;
    const cmd = { seq: (h.room.memberInfo(a.id)!.lastSeq + 10) & 0xffff, forward: 0, strafe: 0, yaw: Math.PI, pitch: 0, buttons: Btn.Fire, stance: Stance.Stand, lean: 0 as const };
    h.room.onInput(a.id, { cmd, predictedHash: 0, epoch: a.session.epoch, snapTick: (now - 12) & 0xffff, viewBackQ8: 0 });
    h.room.step();
    for (const b of a.toClient.splice(0)) a.session.handle(b);
    expect(a.shots).toHaveLength(1);
    expect(a.shots[0].serverTick - a.shots[0].rewoundTick).toBeLessThanOrEqual(4 + 2); // least lag (≤ 2) + slack
  });

  it("spraying, reloading, swapping and switching fire modes are predicted exactly: no corrections", async () => {
    const h = await harness(["sledge", "skopos"]);
    const [a, b] = h.clients;
    const start = [a, b].map((c) => h.room.memberInfo(c.id)!.corrections);
    let seed = 3;
    const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
    let cmds: Cmd[] = [];
    for (let i = 0; i < 640; i++) {
      if (i % 10 === 0) {
        cmds = [0, 1].map(() => {
          const r = rnd();
          return {
            buttons: r < 0.5 ? Btn.Fire : r < 0.6 ? Btn.Reload : r < 0.65 ? Btn.Swap : r < 0.7 ? Btn.FireMode : r < 0.8 ? Btn.Sprint : 0,
            forward: r >= 0.7 && r < 0.8 ? 1 : 0,
            yaw: rnd() * 6,
          };
        });
      }
      h.tick(cmds);
    }
    expect([a, b].map((c) => h.room.memberInfo(c.id)!.corrections - start[[a, b].indexOf(c)])).toEqual([0, 0]);
    // Client and server agree on the ammo too.
    for (const c of [a, b]) {
      const server = h.room.sim.pawns.get(c.session.ctrl!.possessedPawnId)!.state;
      expect([own(c).loaded0, own(c).reserve0, own(c).loaded1, own(c).reserve1]).toEqual([server.loaded0, server.reserve0, server.loaded1, server.reserve1]);
    }
    expect(a.shots.length + b.shots.length).toBeGreaterThan(20);
  });

  it("a forged input stream can't beat the fire rate or create ammo: the server's sim decides every shot", async () => {
    const h = await harness(["lesion"]); // SIX12 SD: 218 rpm (one shot per 17.6 ticks), 6-round cylinder
    const [a] = h.clients;
    a.holdUp = true; // we write the inputs ourselves
    a.toServer.length = 0;
    let seq = h.room.memberInfo(a.id)!.lastSeq;
    for (let i = 0; i < 150; i++) {
      // Clicking every other tick: 75 clicks.
      const cmd = { seq: ++seq & 0xffff, forward: 0, strafe: 0, yaw: 0, pitch: 0, buttons: i % 2 === 0 ? Btn.Fire : 0, stance: Stance.Stand, lean: 0 as const };
      h.room.onInput(a.id, { cmd, predictedHash: 0, epoch: a.session.epoch, snapTick: h.room.sim.tick & 0xffff, viewBackQ8: 0 });
      h.room.step();
      for (const m of a.toClient.splice(0)) a.session.handle(m);
    }
    // Six shots (the cylinder), each at least ⌊3840 / 218⌋ = 17 ticks after the last; then it's empty and
    // the next click starts a reload instead of firing.
    expect(a.shots.length).toBe(6);
    for (let i = 1; i < a.shots.length; i++) expect(a.shots[i].serverTick - a.shots[i - 1].serverTick).toBeGreaterThanOrEqual(17);
    const server = h.room.sim.pawns.get(a.session.ctrl!.possessedPawnId)!.state;
    expect(server.loaded0).toBe(0);
    expect(server.wAct).toBe(2); // reloading
  });

  it("a loadout pick: the roster carries it, the client predicts with it (one correction), its timings hold", async () => {
    const h = await harness(["sledge", "mute"]);
    const [a, b] = h.clients;
    const start = h.room.memberInfo(a.id)!.corrections;
    const pick = {
      operator: "brava",
      primary: { weapon: "para_308", sight: "magnified" as const, barrel: null, grip: "angled" as const, underbarrel: null },
      secondary: { weapon: "usp40", sight: null, barrel: "suppressor" as const, grip: null, underbarrel: null },
      gadgets: ["claymore"],
    };
    a.toServer.push(encodePickLoadout(pick));
    h.ticks(16);
    const mine = b.session.roster.find((e) => e.controllerId === a.session.ctrl!.id)!;
    expect(mine.loadout.primary).toEqual(pick.primary);
    expect(mine.loadout.secondary).toEqual({ ...pick.secondary, sight: "iron" });
    expect(mine.team).toBe(0); // Brava attacks
    expect(a.session.sim!.pawns.get(a.session.ctrl!.possessedPawnId)!.loadout!.weapons[0].reload).toMatchObject({ tacticalTicks: 133 });
    expect(h.room.memberInfo(a.id)!.corrections - start).toBe(1);
    // Fire a little, then a tactical reload with the angled grip: 2.6 s × 0.8 = 133 ticks, all predicted.
    h.ticks(6, [{ buttons: Btn.Fire }]);
    h.ticks(10);
    h.tick([{ buttons: Btn.Reload }]);
    h.ticks(132);
    expect(own(a).wAct).toBe(2); // still reloading on the 132nd tick
    h.tick();
    expect(own(a).wAct).toBe(0);
    expect(own(a).loaded0).toBe(31);
    expect(h.room.memberInfo(a.id)!.corrections - start).toBe(1);
  });

  it("an invalid pick gets the operator's default, and the roster says so", async () => {
    const h = await harness(["sledge"]);
    const [a] = h.clients;
    // Sledge doesn't carry the PARA-308.
    a.toServer.push(encodePickLoadout({ ...defaultLoadoutPick(loadGameData(), "sledge"), primary: { weapon: "para_308", sight: null, barrel: null, grip: null, underbarrel: null } }));
    h.ticks(16);
    const mine = a.session.roster.find((e) => e.controllerId === a.session.ctrl!.id)!;
    expect(mine.loadout).toEqual(defaultLoadoutPick(loadGameData(), "sledge"));
    expect(a.session.ready).toBe(true);
  });

  it("the team tool respawns you on the other team", async () => {
    const h = await harness(["sledge"]);
    const [a] = h.clients;
    const old = a.session.ctrl!.possessedPawnId;
    a.toServer.push(encodeLabTool({ kind: "team", team: 1 }));
    h.ticks(16);
    expect(a.session.roster[0].team).toBe(1);
    expect(a.session.ctrl!.team).toBe(1);
    expect(a.session.ctrl!.possessedPawnId).not.toBe(old);
    expect(h.room.sim.pawns.get(a.session.ctrl!.possessedPawnId)!.team).toBe(1);
  });

  it("Skopós can't shoot while looking through a shell's camera", async () => {
    const h = await harness(["skopos"]);
    const [a] = h.clients;
    h.tick([{ buttons: Btn.Ability }]);
    h.ticks(4);
    expect(a.session.ctrl!.shellCam).toBe(true);
    h.tick([{ buttons: Btn.Fire }]);
    h.ticks(2);
    expect(a.shots).toHaveLength(0);
  });

  it("lobby errors reach the page before any level is loaded", () => {
    const errors: number[] = [];
    const s = new ClientSession({ send: () => {}, now: () => 0, onError: (code) => errors.push(code) });
    s.handle(encodeError(ErrorCode.NoSuchRoom, "No room with code ABCDE"));
    expect(errors).toEqual([ErrorCode.NoSuchRoom]);
  });

  it("after a resync, players who left in the meantime are gone (no ghosts)", async () => {
    const h = await harness(["sledge", "mute", "fuze"]);
    const [a, , c] = h.clients;
    expect(a.session.remoteIds()).toHaveLength(2);
    // a's baselines are out (as after a checksum mismatch); while it waits, c leaves.
    (a.session as unknown as { awaitingReset: boolean }).awaitingReset = true;
    h.room.leave(c.id);
    h.clients.splice(2, 1);
    h.ticks(4);
    expect(a.session.remoteIds()).toHaveLength(2); // the removal was skipped
    h.room.onResync(a.id);
    h.ticks(4);
    expect(a.session.remoteIds()).toHaveLength(1);
    expect([...a.session.sim!.pawns.values()].filter((p) => p.proxy)).toHaveLength(1);
  });

  it("a lost resync request is sent again", async () => {
    const h = await harness(["sledge", "mute"]);
    const [a] = h.clients;
    (a.session as unknown as { awaitingReset: boolean }).awaitingReset = true;
    a.holdUp = true;
    h.ticks(80); // over a second
    expect(a.toServer.some((m) => m[0] === Msg.Resync)).toBe(true);
    a.holdUp = false;
    h.ticks(4);
    expect((a.session as unknown as { awaitingReset: boolean }).awaitingReset).toBe(false);
  });
});
