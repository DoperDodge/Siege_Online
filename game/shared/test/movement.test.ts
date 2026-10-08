import { describe, expect, it } from "vitest";
import { buildLevel, Btn, DEG, eyePose, levelSchema, loadGameData, PawnMode, poseHitboxes, Sim, Stance, wrapAngle, type InputCmd } from "../src/index.js";
import { hspeed, input, labWith, run, teleport } from "./helpers.js";

const FWD = { forward: 1 } as const;

describe("speeds per rating (data/movement.json)", () => {
  const cases: [string, number, number][] = [
    ["fuze", 2.85, 4.25], // speed 1
    ["sledge", 3.0, 4.75], // speed 2
    ["brava", 3.1, 5.0], // speed 3
  ];
  for (const [op, walk, sprint] of cases) {
    it(`${op}: walk ${walk} m/s, sprint ${sprint} m/s`, async () => {
      const { sim, ctrl, pawn } = await labWith(op);
      run(sim, ctrl, FWD, 1);
      expect(hspeed(pawn)).toBeCloseTo(walk, 1);
      teleport(sim, ctrl, 0, 0, 12);
      run(sim, ctrl, { ...FWD, buttons: Btn.Sprint }, 1);
      expect(pawn.state.sprinting).toBe(true);
      expect(hspeed(pawn)).toBeCloseTo(sprint, 1);
    });
  }

  it("crouch, prone, ADS and slow-walk speeds", async () => {
    const { sim, ctrl, pawn } = await labWith("sledge");
    const m = sim.data.movement;
    run(sim, ctrl, { ...FWD, stance: Stance.Crouch }, 1);
    expect(hspeed(pawn)).toBeCloseTo(3.0 * m.speed.crouchWalkFactor, 1);
    teleport(sim, ctrl, 0, 0, 12);
    run(sim, ctrl, { stance: Stance.Prone }, 1.2);
    run(sim, ctrl, { ...FWD, stance: Stance.Prone }, 1);
    expect(hspeed(pawn)).toBeCloseTo(m.speed.proneSpeed, 1);
    teleport(sim, ctrl, 0, 0, 12);
    run(sim, ctrl, { ...FWD, buttons: Btn.Ads }, 1);
    expect(hspeed(pawn)).toBeCloseTo(m.speed.adsWalkSpeed, 1);
    teleport(sim, ctrl, 0, 0, 12);
    run(sim, ctrl, { ...FWD, buttons: Btn.SlowWalk }, 1);
    expect(hspeed(pawn)).toBeCloseTo(3.0 * m.speed.slowWalkFactor, 1);
  });
});

describe("walls and the floor", () => {
  // Found by the netsim: sprinting diagonally into a wall from exact contact, Rapier's snap-to-ground
  // dropped the body 0.29 m into the floor in one tick.
  it("sprinting diagonally into a wall from exact contact doesn't sink into the floor", async () => {
    const { sim, ctrl, pawn } = await labWith("sledge");
    sim.setPawnState(pawn.id, {
      ...pawn.state,
      x: 31.429658889770508,
      y: 0.01992819271981716,
      z: 5.38571310043335,
      vx: 3.807122230529785,
      vy: 0,
      vz: -2.8404788970947266,
      yaw: -1.7151966094970703,
      grounded: true,
      sprinting: true,
      sinceSprint: 0,
      airPeakY: 0.01992819271981716,
    });
    sim.step(new Map([[ctrl.id, input({ forward: 1, strafe: -1, yaw: -1.716568112373352, pitch: 0.2965461015701294, buttons: Btn.Sprint })]]));
    expect(pawn.state.y).toBeGreaterThan(0.01);
  });

  it("never dips below the floor sprinting or walking diagonally along any wall", async () => {
    const { sim, ctrl, pawn } = await labWith("sledge");
    // Facing each outer wall in turn, then running along it at a few angles.
    const walls: [number, number, number][] = [
      [31, 20, -90], // east wall at x = 32: face east (yaw −90°)
      [-31, 20, 90], // west
      [20, -31, 0], // north (−Z)
      [20, 31, 180], // south
    ];
    let lowest = Infinity;
    for (const [x, z, face] of walls) {
      for (const along of [-1, 1]) {
        for (const buttons of [Btn.Sprint, 0]) {
          teleport(sim, ctrl, x, 0, z, face);
          run(sim, ctrl, { forward: 1, yawDeg: face, buttons }, 0.4); // into the wall: exact contact
          for (const off of [10, 25, 40, 60]) {
            const yawDeg = face + along * off;
            for (let i = 0; i < 24; i++) {
              sim.step(new Map([[ctrl.id, input({ forward: 1, strafe: -along, yawDeg, buttons })]]));
              lowest = Math.min(lowest, pawn.state.y);
            }
          }
        }
      }
    }
    expect(lowest).toBeGreaterThan(-0.005);
  });
});

describe("steady movement", () => {
  // Rapier's controller stalls a step that starts inside its contact offset from the floor; pushing the
  // body down into the floor every tick used to cause that on ~1.5% of ticks (a visible hitch).
  it("never stalls for a tick while walking or sprinting on flat ground and ramps", async () => {
    const { sim, ctrl } = await labWith();
    const cases: [number, number, number, number][] = [
      [0, 12, 90, 0],
      [0, 12, 90, Btn.Sprint],
      [-24, 18, 0, 0], // up the 15° ramp
      [-20, 18, 0, 0], // up the 40° ramp
      [3, 14, 37, 0],
    ];
    for (const [x, z, yawDeg, buttons] of cases) {
      const pawn = teleport(sim, ctrl, x, 0, z, yawDeg);
      run(sim, ctrl, { forward: 1, yawDeg, buttons }, 0.3); // up to speed
      let short = 0;
      for (let i = 0; i < 128; i++) {
        const [px, pz] = [pawn.state.x, pawn.state.z];
        sim.step(new Map([[ctrl.id, input({ forward: 1, yawDeg, buttons })]]));
        if (Math.hypot(pawn.state.x - px, pawn.state.z - pz) < (0.5 * hspeed(pawn)) / 64) short++;
      }
      expect(short, `case ${x},${z}`).toBe(0);
    }
  });
});

describe("edges", () => {
  // Standing still, the step only follows the ground; a body left balanced on a corner must still slide
  // off it rather than hover there (the ground ray from the feet centre sees the floor below).
  it("a body stopped on the edge of a curb slides off instead of floating", async () => {
    const { sim, ctrl } = await labWith();
    for (const stance of [Stance.Stand, Stance.Crouch]) {
      const pawn = teleport(sim, ctrl, -6, 0.3, 9.55, 180, stance); // curb top is z 8.7–9.3, 0.3 m high
      run(sim, ctrl, { yawDeg: 180, stance }, 1.5);
      expect(pawn.state.y, `stance ${stance}`).toBeLessThan(0.05);
    }
    // Slow-walking off it and letting go as soon as the feet centre is past the edge.
    const pawn = teleport(sim, ctrl, -6, 0.3, 9.0, 180);
    for (let i = 0; i < 128 && pawn.state.z < 9.5; i++) sim.step(new Map([[ctrl.id, input({ forward: 1, yawDeg: 180, buttons: Btn.SlowWalk })]]));
    run(sim, ctrl, { yawDeg: 180 }, 1.5);
    expect(pawn.state.y).toBeLessThan(0.05);
  });
});

describe("sprint rules", () => {
  it("sprint needs forward input, is blocked by ADS, cancels lean, and stands you up from a crouch", async () => {
    const { sim, ctrl, pawn } = await labWith();
    run(sim, ctrl, { strafe: 1, buttons: Btn.Sprint }, 0.3);
    expect(pawn.state.sprinting).toBe(false);
    run(sim, ctrl, { ...FWD, buttons: Btn.Sprint | Btn.Ads }, 0.3);
    expect(pawn.state.sprinting).toBe(false);
    teleport(sim, ctrl, 0, 0, 12);
    run(sim, ctrl, { ...FWD, buttons: Btn.Sprint, lean: 1 }, 0.5);
    expect(pawn.state.sprinting).toBe(true);
    expect(pawn.state.lean).toBe(0);
    teleport(sim, ctrl, 0, 0, 12, 0, Stance.Crouch);
    run(sim, ctrl, { ...FWD, buttons: Btn.Sprint, stance: Stance.Crouch }, 0.6);
    expect(pawn.state.stance).toBe(Stance.Stand);
    expect(pawn.state.sprinting).toBe(true);
  });
});

describe("stances", () => {
  it("transitions take the configured time and can't be skipped", async () => {
    const { sim, ctrl, pawn } = await labWith();
    run(sim, ctrl, { stance: Stance.Crouch }, 0.1);
    expect(pawn.state.stance).toBe(Stance.Crouch);
    expect(pawn.state.stanceT).toBeLessThan(1);
    run(sim, ctrl, { stance: Stance.Stand }, 0.05); // asking to stand mid-transition doesn't reverse it
    expect(pawn.state.stance).toBe(Stance.Crouch);
    run(sim, ctrl, { stance: Stance.Crouch }, 0.2);
    expect(pawn.state.stanceT).toBe(1);
  });

  it("can't stand up under a low ceiling or crouch in a prone-only gap", async () => {
    const { sim, ctrl, pawn } = await labWith();
    teleport(sim, ctrl, 18, 0, -8.5, 0, Stance.Crouch);
    run(sim, ctrl, { stance: Stance.Stand }, 1);
    expect(pawn.state.stance).toBe(Stance.Crouch);
    teleport(sim, ctrl, 22, 0, -8.5, 0, Stance.Prone);
    run(sim, ctrl, { stance: Stance.Crouch }, 1.5);
    expect(pawn.state.stance).toBe(Stance.Prone);
    // Crawl out of the prone tunnel (it faces -Z; the open end is at z = -6) and you can get up again.
    run(sim, ctrl, { forward: -1, stance: Stance.Prone }, 6);
    run(sim, ctrl, { stance: Stance.Stand }, 1.5);
    expect(pawn.state.stance).toBe(Stance.Stand);
  });

  it("prone limits turn speed", async () => {
    const { sim, ctrl, pawn } = await labWith();
    run(sim, ctrl, { stance: Stance.Prone }, 1.2);
    const before = pawn.state.yaw;
    run(sim, ctrl, { stance: Stance.Prone, yawDeg: 90 }, 1 / 64);
    const turned = wrapAngle(pawn.state.yaw - before) / DEG;
    expect(turned).toBeGreaterThan(0);
    expect(turned).toBeLessThanOrEqual(sim.data.movement.stance.proneTurnRateDeg / 64 + 1e-3);
  });
});

describe("lean", () => {
  it("moves the eye sideways by the lean offset in the open", async () => {
    const { sim, ctrl, pawn } = await labWith();
    run(sim, ctrl, { lean: 1 }, 0.3);
    expect(pawn.state.lean).toBeCloseTo(1, 3);
    const m = sim.data.movement;
    const a = eyePose(m, sim.data.hitboxes, pawn.state, 0).pos;
    const b = eyePose(m, sim.data.hitboxes, pawn.state).pos;
    expect(Math.hypot(b[0] - a[0], b[2] - a[2])).toBeCloseTo(m.lean.offset, 3);
  });

  it("is clamped by a wall on the lean side", async () => {
    const { sim, ctrl, pawn } = await labWith();
    // Facing -X next to the window wall (z = 0); "right" points at the wall.
    teleport(sim, ctrl, 6.55, 0, 0.45, 90);
    run(sim, ctrl, { yawDeg: 90, lean: 1 }, 0.3);
    expect(pawn.state.lean).toBeGreaterThan(0.2);
    expect(pawn.state.lean).toBeLessThan(0.9);
    run(sim, ctrl, { yawDeg: 90, lean: -1 }, 0.4); // the other side is open
    expect(pawn.state.lean).toBeCloseTo(-1, 3);
  });
});

describe("vaulting", () => {
  const VAULT = { forward: 1, buttons: Btn.Vault } as const;

  it("vaults over a 0.9 m obstacle", async () => {
    const { sim, ctrl, pawn } = await labWith();
    teleport(sim, ctrl, -6, 0, 3.0);
    run(sim, ctrl, VAULT, 0.1);
    expect(pawn.state.mode).toBe(PawnMode.Vault);
    run(sim, ctrl, VAULT, 0.9);
    expect(pawn.state.mode).toBe(PawnMode.Walk);
    expect(pawn.state.z).toBeLessThan(1.6);
    expect(pawn.state.y).toBeLessThan(0.1);
  });

  it("climbs onto a 1.3 m block", async () => {
    const { sim, ctrl, pawn } = await labWith();
    teleport(sim, ctrl, -6, 0, -5.2);
    run(sim, ctrl, VAULT, 1.0);
    expect(pawn.state.mode).toBe(PawnMode.Walk);
    expect(pawn.state.y).toBeGreaterThan(1.25);
  });

  it("vaults through an open window", async () => {
    const { sim, ctrl, pawn } = await labWith();
    teleport(sim, ctrl, 5.0, 0, 0.9);
    run(sim, ctrl, VAULT, 1.0);
    expect(pawn.state.z).toBeLessThan(-0.4);
    expect(pawn.state.y).toBeLessThan(0.1);
  });

  it("can't vault a 1.6 m obstacle that isn't tagged vaultable", async () => {
    const { sim, ctrl, pawn } = await labWith();
    teleport(sim, ctrl, -6, 0, -10);
    run(sim, ctrl, VAULT, 1.0);
    expect(pawn.state.mode).toBe(PawnMode.Walk);
    expect(pawn.state.z).toBeGreaterThan(-10.5);
  });
});

describe("ladders, stairs, ramps and falls", () => {
  it("climbs the 6.5 m ladder, steps onto the tower, and dies falling off it", async () => {
    const { sim, ctrl, pawn } = await labWith();
    teleport(sim, ctrl, -16, 0, -5.8);
    run(sim, ctrl, { buttons: Btn.Interact }, 1 / 64);
    expect(pawn.state.mode).toBe(PawnMode.Ladder);
    run(sim, ctrl, FWD, 5.0);
    expect(pawn.state.mode).toBe(PawnMode.Walk);
    expect(pawn.state.y).toBeGreaterThan(6.4);
    expect(pawn.state.z).toBeLessThan(-6.5);
    run(sim, ctrl, FWD, 3); // walk off the back of the tower: a 6.5 m drop is lethal (placeholder curve)
    expect(pawn.state.mode).toBe(PawnMode.Dead);
    expect(pawn.state.hp).toBe(0);
  });

  it("climbs stairs to the 3 m platform and drops off it without damage", async () => {
    const { sim, ctrl, pawn } = await labWith();
    teleport(sim, ctrl, 14, 0, 9.3);
    run(sim, ctrl, FWD, 1.9);
    expect(pawn.state.y).toBeGreaterThan(2.9);
    run(sim, ctrl, FWD, 2.5);
    expect(pawn.state.y).toBeLessThan(0.1);
    expect(pawn.state.hp).toBe(pawn.state.maxHp);
  });

  it("walks up a 40° ramp but not a 55° one", async () => {
    const { sim, ctrl, pawn } = await labWith();
    teleport(sim, ctrl, -20, 0, 14.8);
    run(sim, ctrl, FWD, 1.1); // the ramp top ends in mid-air, so stop before walking off it
    expect(pawn.state.y).toBeGreaterThan(1.5);
    teleport(sim, ctrl, -16, 0, 14.8);
    run(sim, ctrl, FWD, 1.1);
    expect(pawn.state.y).toBeLessThan(0.6);
  });
});

describe("player/pawn separation (Skopós)", () => {
  it("swaps only from the other shell's camera: Z opens it, F transfers after 1.3 s + 1.3 s", async () => {
    const { sim, ctrl } = await labWith("skopos");
    expect(ctrl.pawnIds).toHaveLength(2);
    const [a, b] = ctrl.pawnIds.map((id) => sim.pawns.get(id)!);
    expect(b.state.stance).toBe(Stance.Crouch); // the idle shell stays crouched

    // F on its own does nothing (it's the normal "use" key).
    run(sim, ctrl, { buttons: Btn.Interact }, 1 / 64);
    run(sim, ctrl, {}, 0.1);
    expect(ctrl.possessedPawnId).toBe(a.id);
    expect(sim.prompt(ctrl.id)).toBeNull();

    // Z opens the idle shell's camera: the view moves to shell B, and moving no longer moves shell A.
    run(sim, ctrl, { buttons: Btn.Ability }, 1 / 64);
    expect(ctrl.shellCam).toBe(true);
    expect(sim.viewedPawnId(ctrl.id)).toBe(b.id);
    expect(sim.prompt(ctrl.id)).toBe("transfer");
    const aZ = a.state.z;
    run(sim, ctrl, { forward: 1, yawDeg: 30 }, 0.5);
    expect(a.state.z).toBeCloseTo(aZ, 3);
    expect(b.state.yaw).toBeCloseTo(30 * DEG, 3); // looking around through B's camera

    // Z again closes the camera without swapping.
    run(sim, ctrl, { buttons: Btn.Ability }, 1 / 64);
    expect(ctrl.shellCam).toBe(false);
    expect(ctrl.possessedPawnId).toBe(a.id);

    // Z then F: transfer (A crouches), activation, then control is in B. (Keys are released between presses.)
    run(sim, ctrl, {}, 1 / 64);
    run(sim, ctrl, { buttons: Btn.Ability }, 1 / 64);
    run(sim, ctrl, { buttons: Btn.Interact }, 1 / 64);
    expect(ctrl.swapPhase).toBe(1);
    run(sim, ctrl, {}, 1.35); // 1.3 s = 83.2 ticks
    expect(ctrl.swapPhase).toBe(2);
    expect(a.state.stance).toBe(Stance.Crouch);
    run(sim, ctrl, {}, 1.35);
    expect(ctrl.swapPhase).toBe(0);
    expect(ctrl.possessedPawnId).toBe(b.id);
    expect(b.state.stance).toBe(Stance.Stand);

    // Now B moves and A stays put (crouched as the idle shell); the cooldown blocks an instant re-open.
    const bZ = b.state.z;
    const aNow = a.state.z;
    run(sim, ctrl, { forward: 1 }, 0.5);
    expect(b.state.z).toBeLessThan(bZ - 0.5);
    expect(a.state.z).toBeCloseTo(aNow, 3);
    run(sim, ctrl, { buttons: Btn.Ability }, 1 / 64);
    expect(ctrl.shellCam).toBe(true); // cooldown (0.5 s) has passed by now
  });

  it("an operator with one pawn has no shell camera", async () => {
    const { sim, ctrl } = await labWith("mira");
    run(sim, ctrl, { buttons: Btn.Ability }, 1 / 64);
    expect(ctrl.shellCam).toBe(false);
  });
});

describe("contextual prompts", () => {
  it("shows the mantle prompt when standing still facing a vaultable object, and mantles without moving", async () => {
    const { sim, ctrl, pawn } = await labWith();
    teleport(sim, ctrl, -6, 0, 3.0); // facing the 0.9 m box, not moving
    expect(sim.prompt(ctrl.id)).toBe("mantle");
    teleport(sim, ctrl, -6, 0, 3.0, 180); // facing away: no prompt
    expect(sim.prompt(ctrl.id)).toBeNull();
    teleport(sim, ctrl, -6, 0, 3.0);
    run(sim, ctrl, { buttons: Btn.Vault }, 1 / 64); // tap Space, no movement input
    expect(pawn.state.mode).toBe(PawnMode.Vault);
    run(sim, ctrl, {}, 1.0);
    expect(pawn.state.z).toBeLessThan(1.8);
  });

  it("shows the ladder prompt at the ladder, and nothing for an unvaultable block", async () => {
    const { sim, ctrl } = await labWith();
    teleport(sim, ctrl, -16, 0, -5.8);
    expect(sim.prompt(ctrl.id)).toBe("ladder");
    teleport(sim, ctrl, -6, 0, -10); // 1.6 m block, not vaultable
    expect(sim.prompt(ctrl.id)).toBeNull();
  });
});

describe("hitboxes follow stance and lean", () => {
  it("head height tracks stance; lean shifts the head", async () => {
    const { sim, ctrl, pawn } = await labWith();
    const m = sim.data.movement;
    const head = () => poseHitboxes(m, sim.data.hitboxes, pawn.state).find((h) => h.part === "head")!.a;
    expect(poseHitboxes(m, sim.data.hitboxes, pawn.state)).toHaveLength(8);
    expect(head()[1] - pawn.state.y).toBeCloseTo(m.stance.stand.eye, 2);
    run(sim, ctrl, { stance: Stance.Crouch }, 0.5);
    expect(head()[1] - pawn.state.y).toBeCloseTo(m.stance.crouch.eye, 2);
    run(sim, ctrl, { stance: Stance.Prone }, 1.2);
    expect(head()[1] - pawn.state.y).toBeCloseTo(m.stance.prone.eye, 2);
    run(sim, ctrl, { stance: Stance.Stand }, 1.5);
    const straight = head();
    run(sim, ctrl, { lean: -1 }, 0.3);
    const leaned = head();
    expect(Math.hypot(leaned[0] - straight[0], leaned[2] - straight[2])).toBeCloseTo(m.lean.offset, 2);
  });
});

describe("determinism", () => {
  it("two independent sims fed the same inputs end in identical states", async () => {
    const script: Partial<InputCmd>[] = [];
    const push = (cmd: Partial<InputCmd>, ticks: number) => {
      for (let i = 0; i < ticks; i++) script.push(cmd);
    };
    push({ forward: 1, buttons: Btn.Vault }, 90);
    push({ forward: 0.7, strafe: -0.4, lean: -1 }, 40);
    push({ forward: 1, stance: Stance.Crouch }, 40);
    push({ stance: Stance.Prone }, 80);
    push({ forward: 1, stance: Stance.Prone, yaw: 0.8 }, 60);
    push({ stance: Stance.Stand }, 70);
    push({ forward: 1, buttons: Btn.Sprint, yaw: -0.3 }, 120);

    const states: string[] = [];
    for (let k = 0; k < 2; k++) {
      const sim = await Sim.create("movement_lab");
      const ctrl = sim.addPlayer("det", "brava");
      teleport(sim, ctrl, -6, 0, 7.5);
      for (const cmd of script) sim.step(new Map([[ctrl.id, input(cmd)]]));
      const { prevButtons: _ignored, ...state } = sim.pawns.get(ctrl.possessedPawnId)!.state;
      states.push(JSON.stringify(state));
    }
    expect(states[1]).toBe(states[0]);
  });
});

describe("review regressions (Phase 1 adversarial review)", () => {
  it("crawling prone into a thin wall never puts the eye or any hitbox inside or past it", async () => {
    const { sim, ctrl, pawn } = await labWith();
    // sample_soft spans z 16.9..17.1. Crawl toward it from z = 19.5, facing -Z (yaw 0).
    teleport(sim, ctrl, -4.5, 0, 19.5, 0, Stance.Prone);
    run(sim, ctrl, { forward: 1, stance: Stance.Prone }, 6);
    expect(pawn.state.z).toBeLessThan(18.2); // it really crawled up to the wall (started at 19.5)
    const eye = eyePose(sim.data.movement, sim.data.hitboxes, pawn.state).pos;
    expect(eye[2]).toBeGreaterThan(17.1);
    for (const hb of poseHitboxes(sim.data.movement, sim.data.hitboxes, pawn.state)) {
      expect(Math.min(hb.a[2], hb.b[2]) - hb.radius, hb.part).toBeGreaterThan(17.1 - 1e-3);
    }
  });

  it("you can go prone on a gentle ramp (the body check follows the ground)", async () => {
    const { sim, ctrl, pawn } = await labWith();
    teleport(sim, ctrl, -24, 0, 14.8);
    run(sim, ctrl, { forward: 1 }, 1.0); // walk onto the 15° ramp
    run(sim, ctrl, { stance: Stance.Prone }, 1.2);
    expect(pawn.state.stance).toBe(Stance.Prone);
    expect(pawn.state.stanceT).toBe(1);
  });

  it("a slope steeper than maxSlopeDeg doesn't count as ground (you slide off)", async () => {
    const { sim, ctrl, pawn } = await labWith();
    // Drop onto the middle of the 55° ramp: never grounded while on it, ends up back on the floor.
    sim.teleport(ctrl.possessedPawnId, -16, 1.8, 12.9);
    let groundedHigh = false;
    for (let i = 0; i < 128; i++) {
      run(sim, ctrl, {}, 1 / 64);
      if (pawn.state.grounded && pawn.state.y > 0.5) groundedHigh = true;
    }
    expect(groundedHigh).toBe(false);
    expect(pawn.state.y).toBeLessThan(0.5);
  });

  it("the vault arc never lifts the camera into the window header, and peaks at the apex", async () => {
    const { sim, ctrl, pawn } = await labWith();
    teleport(sim, ctrl, 5.0, 0, 0.9);
    run(sim, ctrl, { buttons: Btn.Vault }, 1 / 64);
    expect(pawn.state.mode).toBe(PawnMode.Vault);
    let maxEye = 0;
    let maxFeet = 0;
    while (pawn.state.mode === PawnMode.Vault) {
      run(sim, ctrl, {}, 1 / 64);
      maxFeet = Math.max(maxFeet, pawn.state.y);
      const e = eyePose(sim.data.movement, sim.data.hitboxes, pawn.state).pos;
      if (Math.abs(e[2]) < 0.4) maxEye = Math.max(maxEye, e[1]); // while passing through the opening
    }
    expect(maxEye).toBeLessThan(2.0 - sim.data.hitboxes.parts.head.radius); // header bottom is at 2.0 m
    expect(maxFeet).toBeLessThanOrEqual(pawn.state.apexY + 1e-4);
  });

  it("a ladder can't be grabbed in the middle of a stance change", async () => {
    const { sim, ctrl, pawn } = await labWith();
    teleport(sim, ctrl, -16, 0, -5.8, 0, Stance.Crouch);
    run(sim, ctrl, { stance: Stance.Stand }, 1 / 64); // start getting up
    expect(pawn.state.stanceT).toBeLessThan(1);
    run(sim, ctrl, { buttons: Btn.Interact, stance: Stance.Stand }, 1 / 64);
    expect(pawn.state.mode).toBe(PawnMode.Walk);
  });

  it("a tick with no input doesn't turn a held key into a fresh press", async () => {
    const { sim, ctrl, pawn } = await labWith("skopos");
    run(sim, ctrl, { buttons: Btn.Ability }, 1 / 64); // opens the shell camera
    expect(ctrl.shellCam).toBe(true);
    sim.step(new Map()); // dropped packet
    run(sim, ctrl, { buttons: Btn.Ability }, 1 / 64); // still held — must not toggle it closed
    expect(ctrl.shellCam).toBe(true);
    expect(pawn.state.mode).toBe(PawnMode.Walk);
  });

  it("a level whose spawn overlaps geometry fails to load with a readable error", async () => {
    const data = loadGameData();
    const lab = data.levels.get("movement_lab")!;
    const bad = levelSchema.parse({ ...lab, id: "bad_spawn", spawns: [{ id: "in_wall", pos: [3.2, 0, 0], yawDeg: 0 }] });
    const levels = new Map(data.levels).set("bad_spawn", bad);
    await expect(Sim.create("bad_spawn", { ...data, levels })).rejects.toThrow(/spawn "in_wall".*overlaps/);
  });

  it("level files reject unknown fields (e.g. a misspelled rotDeg)", () => {
    const lab = loadGameData().levels.get("movement_lab")!;
    expect(() => levelSchema.parse({ ...lab, solids: [{ ...lab.solids[0], rotDeg: 45 }] })).toThrow();
  });

  it("ladder rails follow the ladder's yaw", async () => {
    const sim = await Sim.create("movement_lab");
    const lab = sim.data.levels.get("movement_lab")!;
    const turned = { ...lab, ladders: [{ ...lab.ladders[0], yawDeg: 90 }] };
    const built = buildLevel(sim.R, new sim.R.World({ x: 0, y: -9.81, z: 0 }), turned);
    const rails = built.renderables.filter((r) => r.kind === "ladder_rail");
    // Facing -X (yaw 90): rails are spread along Z around the base, not along X.
    expect(Math.abs(rails[0].center[2] - rails[1].center[2])).toBeCloseTo(lab.ladders[0].width, 3);
    expect(Math.abs(rails[0].center[0] - rails[1].center[0])).toBeLessThan(1e-6);
  });
});
