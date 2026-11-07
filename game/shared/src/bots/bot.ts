// A bot's brain (Phase 9, bots/DESIGN.md §1, §5): each tick, the input a player's client would send for its body, and
// the choices a player makes on the planning screens, from what its team could know (bots/perceive.ts). Utility AI
// (D-158): 16 times a second it scores what it could do — fight what it sees, hold the angle an enemy just left,
// investigate what it heard, trade a teammate, reload, revive, or get on with its task — and does the best, keeping the
// current one unless another beats it by a margin; every tick the motor turns that into keys and mouse (bots/aim.ts,
// bots/nav/follow.ts). M3: the senses and the fights; the plans of M4–M6 replace the task's wandering.
import { TICK_HZ } from "../core/constants.js";
import { wrapAngle } from "../core/math.js";
import type { BotDifficulty, BotLevel } from "../data/schemas.js";
import { Phase, type Match } from "../match/match.js";
import { ATTACK, DEFENSE } from "../match/rules.js";
import type { GameEvent } from "../net/events.js";
import type { MatchAction } from "../net/matchWire.js";
import { eyePose } from "../player/hitboxes.js";
import type { Pawn, PlayerController } from "../player/pawn.js";
import { Btn, Hand, handSlot, PawnKind, PawnMode, Stance, WeaponAct, type InputCmd } from "../player/types.js";
import { slotGadget } from "../gadgets/hands.js";
import { kindId, kindOf } from "../gadgets/kinds.js";
import { hackTargetFor, kludgeOf, type KludgeData } from "../gadgets/hack.js";
import { heartbeats, heartOf } from "../gadgets/sensor.js";
import { GFlag } from "../gadgets/table.js";
import type { GameData } from "../data/load.js";
import type { Sim } from "../sim.js";
import type { Vec3 } from "../core/math.js";
import { fireModeOf, loadedOf } from "../weapons/step.js";
import { Aim, lookAt, viewGap, type View } from "./aim.js";
import { FollowState, PathFollower } from "./nav/follow.js";
import { LinkKind, type NavLink } from "./nav/grid.js";
import type { NavWorld } from "./nav/world.js";
import { eyeOf, Perception, Source, type Contact, type TeamBoard } from "./perceive.js";
import type { GadgetTask, Task } from "./plan.js";
import { LOOK_H, roomAt, roomSpots, sees, waysIn } from "./places.js";
import { GadgetUse, UseState, type UseCtx } from "./use.js";
import { DeployKind } from "../destruction/deploy.js";
import { defaultLoadoutPick, loadoutPickProblem, type LoadoutPick } from "../weapons/loadout.js";
import { BotRng } from "./rng.js";

/** What a bot's input is, less its sequence number (the room numbers it as it queues it). */
export type BotInput = Omit<InputCmd, "seq">;

/** What a bot may read and do, through its room (the same as its member's client could). */
export interface BotWorld {
  readonly sim: Sim;
  /** The match (a match room), or null in a lab room. */
  readonly match: Match | null;
  /** The room's navigation (made with its first bot). */
  readonly nav: NavWorld | null;
  /** Its team's board (what its bot teammates have seen). */
  board(team: number): TeamBoard;
  /** What its team's planner has for it now (a job or a role), or null. */
  taskOf(): Task | null;
  /** Its job done (`ok`), or given up on. */
  report(ok: boolean): void;
  /** An operator and loadout, as PickLoadout would bring it. */
  pick(pick: LoadoutPick): void;
  /** A round's choice, as MatchAction would bring it. */
  act(a: MatchAction): void;
}

/** How often (ticks) a bot looks at the planning screens. */
const CHOOSE_EVERY = 8;
/** On a team with people, bots pick once those have, or this long before the timer ends (s): people choose first. */
const PICK_LATE_S = 5;

/** What a bot is doing (its behaviour). */
export const Doing = { Task: 0, Fight: 1, Hold: 2, Investigate: 3, Reload: 4, Revive: 5, Gadget: 6 } as const;
export type Doing = (typeof Doing)[keyof typeof Doing];

/** A behaviour's score must beat the current one's by this to take over (no dithering). */
const KEEP = 0.12;
/** How long an enemy that left its sight keeps it holding the angle (s), and how long a sound stays worth checking. */
const HOLD_S = 3;
const SOUND_S = 6;

export class Bot {
  level: BotLevel;
  private readonly rng: BotRng;
  /** The round its planning choices were made for, and when it picks its operator (tick; 0: not drawn yet). */
  private round = -1;
  private pickAt = 0;
  private voted = false;
  private spawnChosen = false;
  /** Where it looks while it stands: a yaw it turns toward, and when it picks the next. */
  private lookYaw: number | null = null;
  private lookUntil = 0;
  /** Events its client would have been told since it last thought. */
  readonly heard: GameEvent[] = [];
  /** Its legs, eyes and ears, and aim. */
  readonly legs = new PathFollower();
  readonly senses: Perception;
  private readonly aim: Aim;
  /** Where it's been sent (a test, later a human teammate's order), or null: its own idea. */
  order: Vec3 | null = null;
  /** What it's doing, and the contact it's about (fight, hold, investigate). */
  doing: Doing = Doing.Task;
  private about: Contact | null = null;
  /** Its own next spot to walk to, and when it may pick another. */
  private wanderAt = 0;
  /** A strafe in a fight (-1, 0, 1) and when it changes; a crouch held in a fight. */
  private strafeDir = 0;
  private strafeUntil = 0;
  private fightCrouch = false;
  /** Fire held (an automatic weapon's burst) until this tick, and the last single shot's tick. */
  private burstUntil = 0;
  private lastShot = -1e9;
  private lastReload = -1e9;
  /** The task it's on (its key), since when, and how far through (a hole's blows). */
  private taskKey = "";
  private taskSince = 0;
  private taskStep = 0;
  private lastSwing = -1e9;
  private lastPing = -1e9;
  /** A count a task started with (Brava's Kludge drones out). */
  private taskCount = 0;
  /** Brava's Kludge: what's in its sights (its key) and when Fire may be held on it, when it last saw a device. */
  private hackKey = "";
  private hackFrom = 0;
  private hackSeen = 0;
  /** Its planner's gadget job under way (by the task's key). */
  private use: GadgetUse | null = null;
  private useKey = "";
  /** Its own gadget use (Doing.Gadget: a reaction to what it knows), its score, when it was thought of, the next look. */
  private react: GadgetUse | null = null;
  private reactScore = 0;
  private reactMade = 0;
  private reactAt = 0;
  /** When each kind of its own uses was last made (tag → tick). */
  private readonly usedAt = new Map<string, number>();
  /** Skopós: a swap under way (0: none; 1 her shell's view opening; 2 confirming; 3 transferring), since when. */
  private swap = 0;
  private swapSince = 0;
  /** Skopós walking her idle shell (prep): the shell she set out from. */
  private shellHome = 0;
  /** Where it was before it came into the site's rooms (an attacker's claymore faces that way). */
  private cameFrom: Vec3 | null = null;
  /** The view it asked for last tick: the weapon's kick since is the body's view less it. */
  private asked: View | null = null;

  constructor(
    readonly memberId: number,
    level: BotLevel,
    seed: number,
  ) {
    this.level = level;
    this.rng = new BotRng(seed, memberId);
    this.senses = new Perception(this.rng, memberId);
    this.aim = new Aim(this.rng);
  }

  /** What its client would have been told this tick. */
  hear(events: readonly GameEvent[]): void {
    this.heard.push(...events);
    if (this.heard.length > 256) this.heard.splice(0, this.heard.length - 256);
  }

  /** This tick: the choices a player would make now, and the input for its body (null: no body to steer). */
  think(w: BotWorld, ctrl: PlayerController | null): BotInput | null {
    if (w.match && w.sim.tick % CHOOSE_EVERY === this.memberId % CHOOSE_EVERY) this.choose(w, w.match);
    const pawn = ctrl ? w.sim.pawns.get(ctrl.drone || ctrl.possessedPawnId) : undefined;
    if (!ctrl || !pawn) {
      this.heard.length = 0;
      return null;
    }
    // Driving a drone (an attacker in prep): its own way of thinking.
    if (pawn.kind === PawnKind.Drone) return this.drive(w, ctrl, pawn);
    const s = pawn.state;
    if (s.mode === PawnMode.Dead) {
      this.heard.length = 0;
      return null;
    }
    const d = w.sim.data.bots.levels[this.level];
    const now = w.sim.tick;
    // Defenders go round their own barricades (breaking one only when there's no other way).
    this.legs.allow = pawn.team === DEFENSE ? notBarricade : undefined;
    this.legs.drone = false;
    const mates = [...w.sim.pawns.values()].filter((p) => p.team === pawn.team && p.id !== pawn.id && p.kind === PawnKind.Body && p.state.mode !== PawnMode.Dead);
    this.senses.update(w.sim, pawn, ctrl.id, d, this.heard, w.board(pawn.team), mates);
    this.heard.length = 0;
    // Down: nothing a downed body can usefully press (crawling to cover comes with the plans).
    if (s.mode === PawnMode.Downed || s.mode === PawnMode.Knocked) return this.still(s);
    // Skopós between shells: the keys of the swap and nothing else.
    const swapping = this.swapStep(ctrl, s, now);
    if (swapping) return swapping;
    if ((now + this.memberId) % 4 === 0) this.decide(w, pawn, ctrl, mates, d, now);
    const input = this.hands(s, this.act(w, pawn, mates, d, now), now);
    this.asked = { yaw: input.yaw, pitch: input.pitch };
    return input;
  }

  // ------------------------------------------------------------------ deciding

  /** Score what it could do and take the best (keeping the current one unless beaten by KEEP). */
  private decide(w: BotWorld, me: Pawn, ctrl: PlayerController, mates: readonly Pawn[], d: BotDifficulty, now: number) {
    const s = me.state;
    const job = this.order ? null : w.taskOf();
    const target = this.senses.target(me);
    const recent = this.senses.recent(now, SOUND_S);
    const w0 = me.loadout?.weapons[s.slot];
    const loaded = loadedOf(s);
    const low = w0 ? loaded < Math.max(1, w0.ammo.magazine * 0.3) : false;
    const downMate = mates.find((p) => p.state.mode === PawnMode.Downed && Math.hypot(p.state.x - s.x, p.state.z - s.z) < 15);
    // Its planner's job (setting up in prep, a retake) comes before chasing sounds; a role (hold, roam) after them.
    const jobScore = job && (job.kind === "reinforce" || job.kind === "barricade" || job.kind === "hole" || job.kind === "retake" || job.kind === "gadget" || job.kind === "shell" || job.kind === "kludge") ? 0.75 : 0.3;
    const scores: [Doing, number, Contact | null][] = [[Doing.Task, jobScore, null]];
    if (target) scores.push([Doing.Fight, 1, target]);
    if (loaded === 0) scores.push([Doing.Reload, 0.95, null]);
    else if (low && !target) scores.push([Doing.Reload, 0.6, null]);
    if (recent && !target) {
      const age = (now - recent.at) / TICK_HZ;
      const dist = Math.hypot(recent.pos[0] - s.x, recent.pos[2] - s.z);
      // Just lost from sight: hold the angle. Heard or told: go and look, the more for a trusting ear and the nearer.
      // An anchor doesn't leave its spot for a sound far from it.
      const leash = job?.kind === "hold" ? Math.hypot(recent.pos[0] - job.spot[0], recent.pos[2] - job.spot[2]) < 8 : true;
      if (recent.source === Source.Seen && age < HOLD_S) scores.push([Doing.Hold, 0.85, recent]);
      else if (dist < 30 && leash) scores.push([Doing.Investigate, 0.35 + 0.35 * d.soundUse * (1 - dist / 30), recent]);
    }
    if (downMate && !target && !recent) scores.push([Doing.Revive, 0.7, null]);
    if (this.order && !target) scores.push([Doing.Task, 0.8, null]);
    // Its own gadget uses: one under way goes on (unless something beats it); else, twice a second, a new one if any.
    if (this.react && (this.react.over || (this.react.state === UseState.Going && this.doing !== Doing.Gadget && now - this.reactMade > TICK_HZ) || now - this.reactMade > 12 * TICK_HZ)) this.react = null;
    if (!this.react && now >= this.reactAt) {
      this.reactAt = now + 8;
      const r = this.reaction(w, me, ctrl, d, now, target, job);
      if (r) [this.react, this.reactScore, this.reactMade] = [new GadgetUse(r.task, now), r.score, now];
    }
    if (this.react) scores.push([Doing.Gadget, this.reactScore, null]);
    this.skoposSwap(w, me, ctrl, now, target);
    let best = scores[0];
    for (const sc of scores) if (sc[1] > best[1]) best = sc;
    const current = scores.find((sc) => sc[0] === this.doing);
    if (current && current[1] + KEEP >= best[1] && current[0] !== Doing.Fight && best[0] !== Doing.Gadget) best = current;
    if (best[0] !== this.doing && best[0] !== Doing.Fight) this.aim.drop();
    this.doing = best[0];
    this.about = best[2];
  }

  // ------------------------------------------------------------------ acting

  private act(w: BotWorld, me: Pawn, mates: readonly Pawn[], d: BotDifficulty, now: number): BotInput {
    const s = me.state;
    switch (this.doing) {
      case Doing.Fight:
        if (this.about && this.about.visible) return this.fight(w, me, mates, this.about, d, now);
        break;
      case Doing.Hold:
        if (this.about) return this.hold(w, me, this.about, d, now);
        break;
      case Doing.Investigate:
        if (this.about) return this.investigate(w, me, this.about, now);
        break;
      case Doing.Reload: {
        const input = this.task(w, me, now);
        if (s.wAct !== WeaponAct.Reload && now - this.lastReload > TICK_HZ) {
          this.lastReload = now;
          input.buttons |= Btn.Reload;
        }
        input.buttons &= ~Btn.Sprint;
        return input;
      }
      case Doing.Revive:
        return this.revive(w, me, mates, now);
      case Doing.Gadget: {
        const r = this.react;
        if (!r || r.over) break;
        const input = this.extras(w, me, r, r.step(this.useCtx(w, me, now, d)), d, now);
        if (r.over) {
          this.usedAt.set(r.task.tag, now);
          this.react = null;
        }
        if (input) return input;
        break;
      }
    }
    return this.task(w, me, now);
  }

  /**
   * What a gadget use of its own adds to the motor's keys: Dokkaebi's tablet sends the payload once it's on the
   * spotted defender; Pulse's sensor, up, shows heartbeats (each one known to it and its team) and the nearest is
   * pinged for everyone.
   */
  private extras(w: BotWorld, me: Pawn, r: GadgetUse, input: BotInput | null, d: BotDifficulty, now: number): BotInput | null {
    const s = me.state;
    if (r.task.tag === "jegeo" && input && r.ready(me)) {
      if (r.firedAt >= 0) {
        if (now - r.firedAt > 1.5 * TICK_HZ) r.finish(true);
        return input;
      }
      const eye = eyePose(w.sim.data.movement, w.sim.data.hitboxes, s).pos;
      if (viewGap({ yaw: s.yaw, pitch: s.pitch }, lookAt(eye, r.task.look)) < 0.06) {
        r.firedAt = now;
        return { ...input, buttons: input.buttons | Btn.Fire };
      }
      return input;
    }
    if (r.task.tag === "scan" && input && r.ready(me)) {
      const hearts = heartbeats(w.sim, me);
      const board = w.board(me.team);
      for (const p of hearts) {
        this.senses.sensed(p, now);
        board.report(p.id, [p.state.x, p.state.y, p.state.z], now, p.kind);
      }
      const eye = eyePose(w.sim.data.movement, w.sim.data.hitboxes, s).pos;
      if (hearts.length) {
        const want = lookAt(eye, heartOf(w.sim, hearts[0]));
        const v = this.turnTo({ yaw: s.yaw, pitch: s.pitch }, want, d);
        const ping = viewGap(v, want) < 0.05 && now - this.lastPing > 1.5 * TICK_HZ;
        if (ping) this.lastPing = now;
        return { ...input, yaw: v.yaw, pitch: v.pitch, buttons: input.buttons | (ping ? Btn.Ping : 0) };
      }
      // Nothing yet: a slow turn round (the sensor sees a fan ahead of it).
      return { ...input, yaw: wrapAngle(s.yaw + 1.6 / TICK_HZ), pitch: 0 };
    }
    return input;
  }

  /** The motor's view of this bot for a gadget use this tick. */
  private useCtx(w: BotWorld, me: Pawn, now: number, d: BotDifficulty): UseCtx {
    const s = me.state;
    return {
      sim: w.sim,
      me,
      now,
      walk: (to, r, sprint) => {
        if (!w.nav) return null;
        this.legs.goTo(to, r);
        this.legs.sprint = sprint;
        if (this.legs.state !== FollowState.Walking) return null;
        const st = this.legs.tick(w.nav, w.sim, me, null);
        return { forward: st.forward, strafe: st.strafe, yaw: st.yaw, pitch: st.pitch ?? s.pitch * 0.9, buttons: st.buttons, stance: st.stance, lean: 0 };
      },
      failed: () => this.legs.state === FollowState.Failed,
      turn: (from, want) => this.turnTo(from, want, d),
    };
  }

  /**
   * Its hands, whatever it's doing: a gadget or detonator left out when it isn't using one (a fight broke into a use)
   * goes away and the weapon comes back up; nothing but a gadget use presses Fire or ADS with one out.
   */
  private hands(s: { hand: number; yaw: number; pitch: number }, input: BotInput, now: number): BotInput {
    if (s.hand === Hand.Weapon) return input;
    const active = (u: GadgetUse | null) => u !== null && !u.over && u.state !== UseState.Going;
    const using = (this.doing === Doing.Gadget && active(this.react)) || (this.doing === Doing.Task && active(this.use));
    if (using) return input;
    const slot = handSlot(s.hand as Hand);
    const put = slot !== 0 && now % 6 === 0 ? (slot === 1 ? Btn.Gadget : Btn.Ability) | Btn.Swap : 0;
    return { ...input, buttons: (input.buttons & ~(Btn.Fire | Btn.Ads)) | put };
  }

  /**
   * One of its own gadget uses worth making now (score), from what it knows: a Nitro Cell out set off when an enemy's
   * by it; a defender's cell thrown where an enemy was heard close; an attacker's grenade into the site's room before it
   * goes in, a claymore behind it once in, a smoke on a teammate planting; Dokkaebi's payload on a spotted defender;
   * Pulse's sensor up now and then on his rounds. Null: none.
   */
  private reaction(w: BotWorld, me: Pawn, ctrl: PlayerController, d: BotDifficulty, now: number, target: Contact | null, job: Task | null): { task: GadgetTask; score: number } | null {
    const sim = w.sim;
    const m = w.match;
    const s = me.state;
    if (!m || s.mode !== PawnMode.Walk || s.deployKind !== DeployKind.None || job?.kind === "plant") return null;
    const ids = [slotGadget(sim.data, me.loadout, 1)?.id ?? "", slotGadget(sim.data, me.loadout, 2)?.id ?? ""];
    const slotOf = (...want: string[]): 1 | 2 | 0 => (want.includes(ids[0]) ? 1 : want.includes(ids[1]) ? 2 : 0);
    const left = (slot: 1 | 2) => (slot === 1 ? s.g1 : s.g2);
    const out = (slot: 1 | 2) => (slot === 1 ? s.w1 : s.w2);
    const since = (tag: string) => (now - (this.usedAt.get(tag) ?? -1e9)) / TICK_HZ;
    const keen = 0.5 + 0.5 * d.utilityUse;
    // A Nitro Cell out: set off when an enemy's (known to be) by it.
    const nitro = slotOf("nitro_cell");
    if (nitro && out(nitro) > 0) {
      const kind = kindOf("nitro_cell");
      const cell = sim.gadgets.list.find((g) => g.owner === ctrl.id && g.kind === kind && !(g.flags & GFlag.Flying));
      if (cell) {
        const by = [...this.senses.contacts.values()].some((c) => c.kind === PawnKind.Body && now - c.at < TICK_HZ && Math.hypot(c.pos[0] - cell.pos[0], c.pos[1] + 0.9 - cell.pos[1], c.pos[2] - cell.pos[2]) < 3.5);
        if (by) return { task: { kind: "gadget", slot: nitro, how: "detonate", stand: null, look: cell.pos, tag: "boom" }, score: 1.05 };
      }
    }
    if (m.phase !== Phase.Action && m.phase !== Phase.PostPlant) return null;
    const recent = target ? null : this.senses.recent(now, 1.5);
    const level = sim.level.def;
    const site = level.sites.find((x) => x.id === m.site);
    const here = roomAt(level, s.x, s.y + 0.3, s.z);
    const inSite = !!site && here !== null && site.rooms.includes(here);
    if (!inSite) this.cameFrom = [s.x, s.y, s.z];
    if (me.team === DEFENSE) {
      // A Nitro Cell thrown where an enemy was just heard, close (round a corner: as near it as it can see).
      if (nitro && left(nitro) > 0 && out(nitro) === 0 && recent && recent.kind === PawnKind.Body && recent.source !== Source.Seen) {
        const dist = Math.hypot(recent.pos[0] - s.x, recent.pos[2] - s.z);
        const at = dist > 3.5 && dist < 11 ? this.throwPoint(w, me, recent.pos, 9) : null;
        if (at && Math.hypot(at[0] - recent.pos[0], at[2] - recent.pos[2]) < 3) return { task: { kind: "gadget", slot: nitro, how: "lob", stand: null, look: at, tag: "nitro" }, score: 0.78 * keen };
      }
      // Lesion: a Gu mine (they come back over time) at a way into the room it's in, now and then.
      const gu = slotOf("gu_mine");
      if (gu && left(gu) > 0 && !target && !recent && here && since("gu") > 15) {
        const eye = eyePose(sim.data.movement, sim.data.hitboxes, s).pos;
        const ways = waysIn(sim, here)
          .map((p): Vec3 => [p[0], p[1] - LOOK_H, p[2]])
          .filter((p) => Math.abs(p[1] - s.y) < 1 && Math.hypot(p[0] - s.x, p[2] - s.z) > 2.5 && Math.hypot(p[0] - s.x, p[2] - s.z) < 10 && sees(sim, eye, [p[0], p[1] + 0.3, p[2]]));
        const way = ways[(this.memberId + Math.floor(now / (20 * TICK_HZ))) % Math.max(1, ways.length)];
        if (way) return { task: { kind: "gadget", slot: gu, how: "throw", stand: null, look: [way[0], way[1] + 0.05, way[2]], tag: "gu" }, score: 0.45 };
      }
      // Pulse: the sensor up for a few seconds every so often, on his rounds (not in a fight).
      const sensor = slotOf("cardiac_sensor");
      if (sensor && !target && !recent && since("scan") > 12 + (this.memberId % 5)) {
        const ahead: Vec3 = [s.x - Math.sin(s.yaw) * 6, s.y + 1.4, s.z - Math.cos(s.yaw) * 6];
        return { task: { kind: "gadget", slot: sensor, how: "hold", stand: null, look: ahead, seconds: 4, tag: "scan" }, score: 0.5 };
      }
      return null;
    }
    // Attackers. Dokkaebi: the payload sent to a spotted defender (her charges permitting: the room says).
    const tablet = slotOf("jegeo_payload");
    if (tablet && !target && since("jegeo") > 10) {
      const spotted = this.senses.spottedNow(sim, now);
      if (spotted) return { task: { kind: "gadget", slot: tablet, how: "hold", stand: null, look: spotted, seconds: 3, tag: "jegeo" }, score: 0.8 * keen };
    }
    // A grenade into the site's room just before its way goes in (a door, a hole, a hatch it broke), once a round.
    const grenade = slotOf("frag", "stun");
    if (grenade && left(grenade) > 0 && !target && !inSite && site && since("entry") > 60 && this.legs.state === FollowState.Walking) {
      let walked = 0;
      let prev: Vec3 = [s.x, s.y, s.z];
      for (const p of this.legs.remaining()) {
        walked += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
        prev = p;
        if (walked > 12) break;
        const r = roomAt(level, p[0], p[1] + 0.3, p[2]);
        if (!r || !site.rooms.includes(r)) continue;
        // Into the room (or down the hatch it opened), where it sees.
        const eye = eyePose(sim.data.movement, sim.data.hitboxes, s).pos;
        if ((Math.hypot(p[0] - s.x, p[2] - s.z) > 2.5 || s.y - p[1] > 2) && sees(sim, eye, [p[0], p[1] + 0.4, p[2]])) return { task: { kind: "gadget", slot: grenade, how: "throw", stand: null, look: [p[0], p[1] + 0.3, p[2]], tag: "entry" }, score: 0.72 * keen };
      }
    }
    // A smoke on a teammate planting near (or itself, just before), once in a while.
    const smoke = slotOf("smoke");
    if (smoke && left(smoke) > 0 && !target && since("smoke") > 20) {
      for (const p of sim.pawns.values()) {
        if (p.team !== me.team || p.id === me.id || p.kind !== PawnKind.Body || p.state.deployKind !== DeployKind.Plant) continue;
        const dist = Math.hypot(p.state.x - s.x, p.state.z - s.z);
        if (dist > 12 || Math.abs(p.state.y - s.y) > 2) continue;
        const at = this.throwPoint(w, me, [p.state.x, p.state.y, p.state.z], 12);
        if (at) return { task: { kind: "gadget", slot: smoke, how: "lob", stand: null, look: [at[0], at[1] + 0.3, at[2]], tag: "smoke" }, score: 0.85 };
      }
    }
    // A claymore behind it: once in the site, facing the way it came in; or at a spot it holds, facing its back.
    const claymore = slotOf("claymore");
    if (claymore && left(claymore) > 0 && !target && !recent && since("claymore") > 30) {
      const holding = job?.kind === "hold" && Math.hypot(job.spot[0] - s.x, job.spot[2] - s.z) < 1 ? job : null;
      const back: Vec3 | null = holding ? [2 * s.x - holding.face[0], s.y, 2 * s.z - holding.face[2]] : inSite ? this.cameFrom : null;
      const len = back ? Math.hypot(back[0] - s.x, back[2] - s.z) : 0;
      if (back && len > 0.5) {
        // Behind it, else a little to either side, else to its sides: the first floor it sees.
        const yaw = Math.atan2(back[0] - s.x, back[2] - s.z);
        const eye = eyePose(sim.data.movement, sim.data.hitboxes, s).pos;
        for (const turn of [0, 0.5, -0.5, 1.2, -1.2]) {
          const at: Vec3 = [s.x + Math.sin(yaw + turn) * 1.1, s.y + 0.02, s.z + Math.cos(yaw + turn) * 1.1];
          if (sees(sim, eye, at)) return { task: { kind: "gadget", slot: claymore, how: "place", stand: null, look: at, tag: "claymore" }, score: 0.6 };
        }
      }
    }
    void ctrl;
    return null;
  }

  /**
   * Where to throw toward `to` from its eye: `to` itself if it sees it (within `reach` m), else the point of its way
   * there nearest `to` that it sees within reach. Null: nowhere worth it.
   */
  private throwPoint(w: BotWorld, me: Pawn, to: Vec3, reach: number): Vec3 | null {
    const sim = w.sim;
    const s = me.state;
    const eye = eyePose(sim.data.movement, sim.data.hitboxes, s).pos;
    const seen = (p: Vec3) => Math.hypot(p[0] - s.x, p[2] - s.z) <= reach && sees(sim, eye, [p[0], p[1] + 0.4, p[2]]);
    if (seen(to)) return to;
    const path = w.nav?.search.path([s.x, s.y, s.z], to);
    if (!path) return null;
    let best: Vec3 | null = null;
    for (const st of path.steps) if (seen(st.pos)) best = st.pos;
    return best;
  }

  /**
   * Skopós (in action, not mid-fight): into her other shell when this one is hurt, or when the enemy is heard by the
   * other and far from this one (D-164: the shell nearer the attack).
   */
  private skoposSwap(w: BotWorld, me: Pawn, ctrl: PlayerController, now: number, target: Contact | null) {
    const m = w.match;
    if (this.swap !== 0 || !m || m.phase !== Phase.Action || target || ctrl.swapPhase !== 0 || ctrl.swapCooldown > 0) return;
    const other = w.sim.otherPawn(ctrl.id);
    if (!other || other.state.mode !== PawnMode.Walk) return;
    const s = me.state;
    const hurt = s.hp < 45 && other.state.hp > s.hp + 20;
    const near = [...this.senses.contacts.values()].some(
      (c) => c.kind === PawnKind.Body && now - c.at < 2 * TICK_HZ && Math.hypot(c.pos[0] - other.state.x, c.pos[2] - other.state.z) < 9 && Math.hypot(c.pos[0] - s.x, c.pos[2] - s.z) > 15,
    );
    if ((hurt || near) && now - this.swapSince > 8 * TICK_HZ) this.startSwap(now);
  }

  private startSwap(now: number) {
    if (this.swap !== 0) return;
    this.swap = 1;
    this.swapSince = now;
  }

  /** A swap under way: her ability key until her shell's view is up, Interact until the transfer starts, then still. */
  private swapStep(ctrl: PlayerController, s: { yaw: number; pitch: number }, now: number): BotInput | null {
    if (this.swap === 0) return null;
    const base: BotInput = { forward: 0, strafe: 0, yaw: s.yaw, pitch: s.pitch, buttons: 0, stance: Stance.Stand, lean: 0 };
    if (now - this.swapSince > 6 * TICK_HZ) {
      // It didn't take (her shell busy, an EMP): her view back.
      this.swap = 0;
      return ctrl.shellCam ? { ...base, buttons: Btn.Ability } : null;
    }
    if (this.swap === 1) {
      if (ctrl.shellCam) this.swap = 2;
      else return { ...base, buttons: now % 6 === 0 ? Btn.Ability : 0 };
    }
    if (this.swap === 2) {
      if (ctrl.swapPhase !== 0) this.swap = 3;
      else return { ...base, buttons: now % 6 === 3 ? Btn.Interact : 0 };
    }
    if (ctrl.swapPhase !== 0) return base;
    // In the other shell: its legs start afresh.
    this.swap = 0;
    this.legs.stop();
    this.aim.drop();
    return null;
  }

  /** Fight what it sees: aim (with its error, lag and turn rate), fire when on it and its reaction time is up. */
  private fight(w: BotWorld, me: Pawn, mates: readonly Pawn[], c: Contact, d: BotDifficulty, now: number): BotInput {
    const s = me.state;
    const sim = w.sim;
    const eye = eyePose(sim.data.movement, sim.data.hitboxes, s).pos;
    const a = this.aim.step(c, eye, { yaw: s.yaw, pitch: s.pitch }, d, now, this.asked);
    const dist = Math.hypot(a.point[0] - eye[0], a.point[1] - eye[1], a.point[2] - eye[2]);
    const ready = now - c.spottedAt >= ((d.reactionMs / 1000) * 0.4 * TICK_HZ);
    const onIt = a.off < a.size * 1.4 + 0.004;
    let buttons = 0;
    // Down the sights past a few metres (or always, for the better bots).
    if (dist > 6 || d.peekStyle !== "wide") buttons |= Btn.Ads;
    const wpn = me.loadout?.weapons[s.slot];
    if (wpn && ready && onIt && loadedOf(s) > 0 && !this.mateInWay(sim, eye, a.point, mates, dist)) {
      const mode = fireModeOf(wpn, s);
      if (mode === "auto") {
        // Full auto up close; bursts farther out.
        if (now >= this.burstUntil && now - this.lastShot > (dist > 18 ? 0.25 : 0.05) * TICK_HZ) {
          this.burstUntil = now + Math.round((dist > 18 ? 0.25 : dist > 10 ? 0.5 : 1.2) * TICK_HZ);
          this.lastShot = this.burstUntil;
        }
      } else if (now - this.lastShot >= Math.max(4, Math.ceil((60 / wpn.fire.rpm) * TICK_HZ))) {
        buttons |= Btn.Fire;
        this.lastShot = now;
      }
    }
    if (now < this.burstUntil) buttons |= Btn.Fire;
    // Moving in a fight: strafing and crouching, by its skill.
    if (now >= this.strafeUntil) {
      this.strafeUntil = now + Math.round(this.rng.range(0.3, 0.8) * TICK_HZ);
      this.strafeDir = this.rng.next() < d.strafe ? (this.rng.next() < 0.5 ? -1 : 1) : 0;
      if (this.rng.next() < d.strafe * 0.25) this.fightCrouch = !this.fightCrouch;
    }
    return { forward: 0, strafe: this.strafeDir * 0.7, yaw: a.view.yaw, pitch: a.view.pitch, buttons, stance: this.fightCrouch ? Stance.Crouch : Stance.Stand, lean: 0 };
  }

  /** Whether a teammate stands in the line of fire, nearer than the target. */
  private mateInWay(sim: Sim, eye: Vec3, p: Vec3, mates: readonly Pawn[], dist: number): boolean {
    const dir: Vec3 = [(p[0] - eye[0]) / dist, (p[1] - eye[1]) / dist, (p[2] - eye[2]) / dist];
    for (const m of mates) {
      const c: Vec3 = [m.state.x, m.state.y + 1.1, m.state.z];
      const t = (c[0] - eye[0]) * dir[0] + (c[1] - eye[1]) * dir[1] + (c[2] - eye[2]) * dir[2];
      if (t <= 0 || t >= dist) continue;
      const off = Math.hypot(eye[0] + dir[0] * t - c[0], eye[1] + dir[1] * t - c[1], eye[2] + dir[2] * t - c[2]);
      if (off < 0.5) return true;
    }
    void sim;
    return false;
  }

  /** An enemy just left its sight: aim where it was (pre-aimed, its error small), standing its ground. */
  private hold(w: BotWorld, me: Pawn, c: Contact, d: BotDifficulty, now: number): BotInput {
    const s = me.state;
    const eye = eyePose(w.sim.data.movement, w.sim.data.hitboxes, s).pos;
    const want = lookAt(eye, [c.pos[0], c.pos[1] + 1.4, c.pos[2]]);
    const view = this.turnTo({ yaw: s.yaw, pitch: s.pitch }, want, d);
    void now;
    return { forward: 0, strafe: 0, yaw: view.yaw, pitch: view.pitch, buttons: d.prefire > 0.5 ? Btn.Ads : 0, stance: Stance.Stand, lean: 0 };
  }

  /** Go and look where an enemy was heard or told of: walking (no sprint), looking that way once near. */
  private investigate(w: BotWorld, me: Pawn, c: Contact, now: number): BotInput {
    const s = me.state;
    if (!w.nav) return this.still(s);
    this.legs.goTo(c.pos, 1.2 + Math.min(4, c.uncertainty));
    this.legs.sprint = false;
    const dist = Math.hypot(c.pos[0] - s.x, c.pos[2] - s.z);
    const eye = eyePose(w.sim.data.movement, w.sim.data.hitboxes, s).pos;
    const look = dist < 10 ? lookAt(eye, [c.pos[0], c.pos[1] + 1.4, c.pos[2]]) : null;
    const st = this.legs.tick(w.nav, w.sim, me, look ? look.yaw : null);
    if (this.legs.state !== FollowState.Walking) {
      // There, or no way there: what was there is no news any more.
      c.at = Math.min(c.at, now - SOUND_S * TICK_HZ);
    }
    return { forward: st.forward, strafe: st.strafe, yaw: st.yaw, pitch: look ? look.pitch : (st.pitch ?? s.pitch * 0.9), buttons: st.buttons & ~Btn.Sprint, stance: st.stance, lean: 0 };
  }

  /** Go to a downed teammate and hold Use on it, facing it. */
  private revive(w: BotWorld, me: Pawn, mates: readonly Pawn[], now: number): BotInput {
    const s = me.state;
    const mate = mates.filter((p) => p.state.mode === PawnMode.Downed).sort((a, b) => Math.hypot(a.state.x - s.x, a.state.z - s.z) - Math.hypot(b.state.x - s.x, b.state.z - s.z))[0];
    if (!mate || !w.nav) return this.task(w, me, now);
    const near = Math.hypot(mate.state.x - s.x, mate.state.z - s.z);
    const eye = eyePose(w.sim.data.movement, w.sim.data.hitboxes, s).pos;
    const look = lookAt(eye, [mate.state.x, mate.state.y + 0.3, mate.state.z]);
    if (near < 0.9) return { forward: 0, strafe: 0, yaw: look.yaw, pitch: look.pitch, buttons: Btn.Interact, stance: Stance.Stand, lean: 0 };
    this.legs.goTo([mate.state.x, mate.state.y, mate.state.z], 0.8);
    this.legs.sprint = true;
    const st = this.legs.tick(w.nav, w.sim, me, null);
    return { forward: st.forward, strafe: st.strafe, yaw: st.yaw, pitch: st.pitch ?? s.pitch * 0.9, buttons: st.buttons, stance: st.stance, lean: 0 };
  }

  /** Its task: an order, else its planner's job or role (M4), else walking about; else standing and looking about. */
  private task(w: BotWorld, me: Pawn, now: number): BotInput {
    const s = me.state;
    const job = this.order ? null : w.taskOf();
    if (job && w.nav) {
      const input = this.doTask(w, me, job, now);
      if (input) return input;
    }
    if (w.nav) {
      if (this.order) this.legs.goTo(this.order, 0.4);
      else if (w.match && (this.legs.state !== FollowState.Walking || now >= this.wanderAt)) {
        const spot = this.wanderSpot(w, w.match, me.team);
        if (spot) this.legs.goTo(spot, 0.6);
        this.wanderAt = now + Math.round(this.rng.range(8, 20) * TICK_HZ);
      }
      this.legs.sprint = false;
      if (this.legs.state === FollowState.Walking) {
        const st = this.legs.tick(w.nav, w.sim, me, null);
        return { forward: st.forward, strafe: st.strafe, yaw: st.yaw, pitch: st.pitch ?? s.pitch * 0.9, buttons: st.buttons, stance: st.stance, lean: 0 };
      }
    }
    // Standing: something half seen draws the eye; else toward where it was last hit from, if lately; else it looks
    // about, a little at a time.
    const glimpse = [...this.senses.contacts.values()].find((c) => c.visible && !c.detected);
    if (glimpse) {
      const eye = eyePose(w.sim.data.movement, w.sim.data.hitboxes, s).pos;
      const v = this.turnTo({ yaw: s.yaw, pitch: s.pitch }, lookAt(eye, glimpse.chest ?? glimpse.head ?? [glimpse.pos[0], glimpse.pos[1] + 1.2, glimpse.pos[2]]), w.sim.data.bots.levels[this.level]);
      this.lookYaw = v.yaw;
      this.lookUntil = now + 2 * TICK_HZ;
      return { forward: 0, strafe: 0, yaw: v.yaw, pitch: v.pitch, buttons: 0, stance: Stance.Stand, lean: 0 };
    }
    const hit = this.senses.hitFrom;
    if (hit && now - hit.tick < 2 * TICK_HZ) this.lookYaw = hit.yaw;
    else if (this.lookYaw === null || now >= this.lookUntil) {
      this.lookYaw = wrapAngle(s.yaw + this.rng.range(-1.2, 1.2));
      this.lookUntil = now + Math.round(this.rng.range(2, 5) * TICK_HZ);
    }
    const dy = wrapAngle(this.lookYaw - s.yaw);
    const turn = Math.sign(dy) * Math.min(Math.abs(dy), 2.2 / TICK_HZ);
    return { forward: 0, strafe: 0, yaw: wrapAngle(s.yaw + turn), pitch: s.pitch * 0.9, buttons: 0, stance: Stance.Stand, lean: 0 };
  }

  /** Its planner's job or role: walk to where it's done, then do it. Null: nothing to press (stand and look about). */
  private doTask(w: BotWorld, me: Pawn, t: Task, now: number): BotInput | null {
    const s = me.state;
    const sim = w.sim;
    const d = sim.data.bots.levels[this.level];
    const key = taskKey(t);
    if (key !== this.taskKey) {
      this.taskKey = key;
      this.taskSince = now;
      this.taskStep = 0;
    }
    const eye = eyePose(sim.data.movement, sim.data.hitboxes, s).pos;
    const walk = (to: Vec3, r: number, sprint = false): BotInput | null => {
      this.legs.goTo(to, r);
      this.legs.sprint = sprint;
      if (this.legs.state === FollowState.Failed) return null;
      if (this.legs.state !== FollowState.Walking) return null;
      const st = this.legs.tick(w.nav!, sim, me, null);
      return { forward: st.forward, strafe: st.strafe, yaw: st.yaw, pitch: st.pitch ?? s.pitch * 0.9, buttons: st.buttons, stance: st.stance, lean: 0 };
    };
    const at = (p: Vec3, r: number) => Math.hypot(p[0] - s.x, p[2] - s.z) <= r && Math.abs(p[1] - s.y) < 0.8;
    const look = (p: Vec3, buttons = 0): BotInput => {
      const v = this.turnTo({ yaw: s.yaw, pitch: s.pitch }, lookAt(eye, p), d);
      return { forward: 0, strafe: 0, yaw: v.yaw, pitch: v.pitch, buttons, stance: Stance.Stand, lean: 0 };
    };
    const aimed = (p: Vec3) => viewGap({ yaw: s.yaw, pitch: s.pitch }, lookAt(eye, p)) < 0.06;
    const giveUp = (seconds: number) => now - this.taskSince > seconds * TICK_HZ;
    switch (t.kind) {
      case "reinforce":
      case "barricade": {
        const p = sim.level.panels.list[t.panel].panel;
        const done = t.kind === "reinforce" ? p.reinforcedBefore(t.section) : !p.empty && !p.broken;
        if (done) {
          w.report(true);
          return null;
        }
        if (giveUp(40) || (this.legs.state === FollowState.Failed && !at(t.stand, 0.5))) {
          w.report(false);
          this.legs.stop();
          return null;
        }
        if (!at(t.stand, 0.35)) return walk(t.stand, 0.25, true) ?? look(t.look);
        // There: face it, then hold Use (the body holds still while it works).
        const working = s.deployKind === DeployKind.Reinforce || s.deployKind === DeployKind.BarricadeUp;
        return look(t.look, working || aimed(t.look) ? Btn.Interact : 0);
      }
      case "hole": {
        if (this.taskStep >= t.spots.length) {
          w.report(true);
          return null;
        }
        if (giveUp(40)) {
          w.report(false);
          return null;
        }
        if (!at(t.stand, 0.35)) return walk(t.stand, 0.25, true) ?? look(t.spots[0]);
        const spot = t.spots[this.taskStep];
        if (aimed(spot) && now - this.lastSwing > 0.62 * TICK_HZ) {
          this.lastSwing = now;
          this.taskStep++;
          return look(spot, Btn.Melee);
        }
        return look(spot);
      }
      case "hold": {
        if (!at(t.spot, 0.45)) return walk(t.spot, 0.35, now - this.taskSince < 20 * TICK_HZ) ?? look(t.face);
        // There: watch the way in, a little either side of it now and then.
        const sway = Math.sin((now + this.memberId * 37) / (2.5 * TICK_HZ)) * 0.25;
        const f = t.face;
        const dx = f[0] - s.x;
        const dz = f[2] - s.z;
        const p: Vec3 = [s.x + dx * Math.cos(sway) - dz * Math.sin(sway), f[1], s.z + dx * Math.sin(sway) + dz * Math.cos(sway)];
        return look(p, d.prefire > 0.5 ? Btn.Ads : 0);
      }
      case "roam": {
        if (this.legs.state !== FollowState.Walking || now >= this.wanderAt) {
          const room = this.rng.pick(t.rooms);
          const spots = room ? roomSpots(w.nav!, sim.level.def, room, 1.5) : [];
          const spot = this.rng.pick(spots);
          if (spot) this.legs.goTo(spot, 0.6);
          this.wanderAt = now + Math.round(this.rng.range(8, 18) * TICK_HZ);
        }
        return walk(this.legs.goal ?? [s.x, s.y, s.z], 0.6);
      }
      case "retake": {
        const def = t.defuser;
        if (!at(def, 1.2)) return walk(def, 0.9, true) ?? look([def[0], def[1] + 0.2, def[2]]);
        const target: Vec3 = [def[0], def[1] + 0.15, def[2]];
        return look(target, aimed(target) || s.deployKind === DeployKind.Disable ? Btn.Interact : 0);
      }
      case "go": {
        // Through each spot of the way in, then to the end (where it holds, looking about).
        while (this.taskStep < t.via.length && at(t.via[this.taskStep], 1.5)) this.taskStep++;
        const next = this.taskStep < t.via.length ? t.via[this.taskStep] : t.to;
        if (this.taskStep >= t.via.length && at(t.to, 0.8)) return null;
        const input = walk(next, this.taskStep < t.via.length ? 1.2 : 0.6, now - this.taskSince < 25 * TICK_HZ);
        if (!input && this.legs.state === FollowState.Failed) this.taskStep++;
        return input;
      }
      case "plant": {
        const o = sim.objective;
        if (!o || o.planted) return null;
        if (!at(t.spot, 0.4) && s.deployKind !== DeployKind.Plant) return walk(t.spot, 0.3) ?? look([t.spot[0], t.spot[1], t.spot[2]]);
        // Hold Use (the body crouches and holds still for it).
        return { forward: 0, strafe: 0, yaw: s.yaw, pitch: -0.5, buttons: Btn.Interact, stance: Stance.Crouch, lean: 0 };
      }
      case "pickup": {
        if (!at(t.at, 0.8)) return walk(t.at, 0.5, true) ?? look(t.at);
        return { forward: 0, strafe: 0, yaw: s.yaw, pitch: -0.6, buttons: now % 16 < 2 ? Btn.Interact : 0, stance: Stance.Stand, lean: 0 };
      }
      case "drone":
        return null;
      case "gadget": {
        if (!this.use || this.useKey !== key) {
          this.use = new GadgetUse(t, now);
          this.useKey = key;
        }
        const input = this.use.step(this.useCtx(w, me, now, d));
        if (this.use.over) {
          w.report(this.use.state === UseState.Done);
          this.use = null;
          this.useKey = "";
          return null;
        }
        return input ?? look(t.look);
      }
      case "shell": {
        // Skopós in prep: into her other shell, it walked to `to`, and back into the one she left.
        const c = me.ownerId !== null ? sim.controllers.get(me.ownerId) : undefined;
        if (!c) return null;
        if (this.taskStep === 0) {
          this.shellHome = c.possessedPawnId;
          this.taskStep = 1;
        }
        if (giveUp(35) || (c.possessedPawnId === this.shellHome && this.taskStep === 1 && !sim.otherPawn(c.id))) {
          if (c.possessedPawnId !== this.shellHome && sim.otherPawn(c.id)) this.startSwap(now);
          else w.report(false);
          return null;
        }
        if (this.taskStep === 1) {
          if (c.possessedPawnId === this.shellHome) {
            this.startSwap(now);
            return null;
          }
          this.taskStep = 2;
        }
        if (this.taskStep === 2) {
          if (!at(t.to, 0.7)) {
            const input = walk(t.to, 0.5, true);
            if (input || this.legs.state !== FollowState.Failed) return input;
          }
          this.taskStep = 3;
        }
        if (c.possessedPawnId === this.shellHome) {
          w.report(true);
          return null;
        }
        this.startSwap(now);
        return null;
      }
      case "kludge": {
        // Brava: a Kludge drone out toward `to` (her ability key), then driven (drive()).
        if (this.taskStep === 0) {
          this.taskStep = 1;
          this.taskCount = this.dronesOut(w, me);
        }
        if (this.dronesOut(w, me) > this.taskCount || giveUp(4)) {
          if (giveUp(4)) w.report(false);
          return null;
        }
        const v = lookAt(eye, [t.to[0], eye[1], t.to[2]]);
        return { forward: 0, strafe: 0, yaw: v.yaw, pitch: 0.1, buttons: now % 10 === 0 ? Btn.Ability : 0, stance: Stance.Stand, lean: 0 };
      }
    }
  }

  /** Its Kludge drones out (thrown), counted. */
  private dronesOut(w: BotWorld, me: Pawn): number {
    const c = me.ownerId !== null ? w.sim.controllers.get(me.ownerId) : undefined;
    return c ? w.sim.dronesOf(c).filter((p) => p.kludge && p.state.mode !== PawnMode.Held).length : 0;
  }

  /**
   * Driving its drone (prep): toward where its planner sends it (doorways, under door barricades, drops; no vaults or
   * ladders), looking through it; a defender it notices is pinged for the team (the crosshair on it, Ping) and watched.
   */
  private drive(w: BotWorld, ctrl: PlayerController, drone: Pawn): BotInput | null {
    const s = drone.state;
    if (s.mode === PawnMode.Dead) return null;
    const d = w.sim.data.bots.levels[this.level];
    const now = w.sim.tick;
    this.senses.update(w.sim, drone, ctrl.id, d, this.heard, w.board(drone.team), []);
    this.heard.length = 0;
    const eye = eyeOf(w.sim, drone);
    const job = w.taskOf();
    // A drone out in the action that's no longer its job (a Kludge's done): back to the body (Observe).
    if (ctrl.drone && job?.kind !== "kludge" && job?.kind !== "drone") return { forward: 0, strafe: 0, yaw: s.yaw, pitch: s.pitch, buttons: now % 6 === 0 ? Btn.Observe : 0, stance: Stance.Stand, lean: 0 };
    const k = kludgeOf(w.sim.data, drone);
    if (k && job?.kind === "kludge") return this.kludge(w, drone, k, job.to, d, now, eye);
    const seen = this.senses.target(drone);
    if (seen && seen.kind === PawnKind.Body) {
      const at = seen.chest ?? seen.head ?? [seen.pos[0], seen.pos[1] + 1.1, seen.pos[2]];
      const want = lookAt(eye, at);
      const v = this.turnTo({ yaw: s.yaw, pitch: s.pitch }, want, d);
      let buttons = 0;
      if (viewGap(v, want) < 0.05 && now - this.lastPing > 1.5 * TICK_HZ) {
        buttons = Btn.Ping;
        this.lastPing = now;
      }
      return { forward: 0, strafe: 0, yaw: v.yaw, pitch: v.pitch, buttons, stance: Stance.Stand, lean: 0 };
    }
    if (job?.kind !== "drone" || !w.nav) return { forward: 0, strafe: 0, yaw: s.yaw, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0 };
    this.legs.allow = droneLink;
    this.legs.drone = true;
    this.legs.goTo(job.to, 2.5);
    this.legs.sprint = false;
    if (this.legs.state !== FollowState.Walking) {
      // There (or no way on): look about the room.
      const yaw = wrapAngle(s.yaw + 0.02);
      return { forward: 0, strafe: 0, yaw, pitch: 0.05, buttons: 0, stance: Stance.Stand, lean: 0 };
    }
    const st = this.legs.tick(w.nav, w.sim, drone, null);
    // A drone jumps where a body would vault (the follower's tap), and never presses Use or the knife.
    return { forward: st.forward, strafe: st.strafe, yaw: st.yaw, pitch: 0.05, buttons: st.buttons & (Btn.Vault | Btn.Sprint), stance: Stance.Stand, lean: 0 };
  }

  /**
   * Brava's Kludge (M7): toward `to`, and on the way any of the other side's devices it sees within reach — up to it,
   * the crosshair on it, Fire held while it's in the sights (let go between hacks: the room wants a fresh press);
   * done after a while, or once there with nothing left to hack (then Observe takes it back to its body).
   */
  private kludge(w: BotWorld, drone: Pawn, k: KludgeData, to: Vec3, d: BotDifficulty, now: number, eye: Vec3): BotInput {
    const s = drone.state;
    const sim = w.sim;
    if (this.taskStep < 2) {
      this.taskStep = 2;
      this.taskSince = now;
      this.hackSeen = now;
      this.legs.stop();
    }
    const view = { pos: eye, yaw: s.yaw, pitch: s.pitch };
    const sights = hackTargetFor(sim, drone, k, view, () => false);
    const key = sights ? JSON.stringify(sights) : "";
    if (key !== this.hackKey) {
      this.hackKey = key;
      this.hackFrom = now + 2;
    }
    const devices = hackables(sim, drone.team)
      .map((p) => ({ p, dist: Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]) }))
      .filter((x) => x.dist < k.rangeM * 1.6 && sees(sim, eye, x.p))
      .sort((a, b) => a.dist - b.dist);
    const done = now - this.taskSince > 25 * TICK_HZ || (this.legs.state !== FollowState.Walking && now - this.hackSeen > 5 * TICK_HZ && !devices.length);
    if (done) {
      w.report(true);
      return { forward: 0, strafe: 0, yaw: s.yaw, pitch: s.pitch, buttons: Btn.Observe, stance: Stance.Stand, lean: 0 };
    }
    this.legs.allow = droneLink;
    this.legs.drone = true;
    this.legs.sprint = false;
    const target = devices[0];
    if (target) {
      this.hackSeen = now;
      const want = lookAt(eye, target.p);
      const v = this.turnTo({ yaw: s.yaw, pitch: s.pitch }, want, d);
      let forward = 0;
      let strafe = 0;
      if (target.dist > k.rangeM * 0.8 && w.nav) {
        this.legs.goTo(target.p, k.rangeM * 0.6);
        const st = this.legs.tick(w.nav, sim, drone, v.yaw);
        [forward, strafe] = [st.forward, st.strafe];
      }
      return { forward, strafe, yaw: v.yaw, pitch: v.pitch, buttons: sights && now >= this.hackFrom ? Btn.Fire : 0, stance: Stance.Stand, lean: 0 };
    }
    if (!w.nav) return { forward: 0, strafe: 0, yaw: s.yaw, pitch: 0, buttons: 0, stance: Stance.Stand, lean: 0 };
    this.legs.goTo(to, 1.5);
    if (this.legs.state !== FollowState.Walking) return { forward: 0, strafe: 0, yaw: wrapAngle(s.yaw + 0.03), pitch: 0.1, buttons: 0, stance: Stance.Stand, lean: 0 };
    const st = this.legs.tick(w.nav, sim, drone, null);
    return { forward: st.forward, strafe: st.strafe, yaw: st.yaw, pitch: 0.05, buttons: st.buttons & (Btn.Vault | Btn.Sprint), stance: Stance.Stand, lean: 0 };
  }

  /** A view turned toward `want` at its turn rate. */
  private turnTo(now: View, want: View, d: BotDifficulty): View {
    const max = ((d.turnRateDeg * Math.PI) / 180 / TICK_HZ) * 0.7;
    const gap = viewGap(now, want);
    if (gap <= max) return want;
    const f = max / gap;
    return { yaw: wrapAngle(now.yaw + wrapAngle(want.yaw - now.yaw) * f), pitch: now.pitch + (want.pitch - now.pitch) * f };
  }

  private still(s: { yaw: number; pitch: number }): BotInput {
    return { forward: 0, strafe: 0, yaw: s.yaw, pitch: s.pitch, buttons: 0, stance: Stance.Stand, lean: 0 };
  }

  /**
   * Somewhere to walk to (M2, until the plans of M4–M6): a defender, a spot in one of its site's rooms or a room next to
   * them; an attacker, a spot in a room of the building (the site's once its team knows it). Null: none found.
   */
  private wanderSpot(w: BotWorld, m: Match, team: number): Vec3 | null {
    const nav = w.nav!;
    const level = w.sim.level.def;
    const site = level.sites.find((st) => st.id === m.site);
    const known = team === DEFENSE || m.siteRevealed;
    const rooms = site && known && this.rng.next() < 0.7 ? level.rooms.filter((r) => site.rooms.includes(r.id)) : level.rooms;
    for (let tries = 0; tries < 8; tries++) {
      const room = this.rng.pick(rooms);
      if (!room) return null;
      const rect = this.rng.pick(room.rects)!;
      const storey = level.storeys.find((st) => st.id === room.storey);
      const x = this.rng.range(rect[0], rect[2]);
      const z = this.rng.range(rect[1], rect[3]);
      const n = nav.grid.nodeNear(x, storey?.floorY ?? room.anchor[1], z, 1, 0.6);
      if (n >= 0) return nav.grid.nodePos(n);
    }
    return null;
  }

  // ------------------------------------------------------------------ the planning screens

  private choose(w: BotWorld, m: Match) {
    const me = m.players.get(this.memberId);
    const side = m.sideOf(this.memberId);
    if (!me || side === null) return;
    if (m.round !== this.round) {
      this.round = m.round;
      this.pickAt = 0;
      this.voted = false;
      this.spawnChosen = false;
    }
    if (m.phase === Phase.Planning) {
      this.pickOperator(w, m, side);
      if (side === DEFENSE && !this.voted && m.mode.match.site === "vote" && m.fixedSite() === null) {
        this.voted = true;
        // The team's bots agree (the first to vote chooses, the rest follow it): a site at random otherwise.
        const mates = m.sides[DEFENSE].map((id) => m.players.get(id)).filter((p) => p?.bot !== null && p?.siteVote);
        const site = mates[0]?.siteVote ?? this.rng.pick(m.map.sites) ?? null;
        if (site) w.act({ kind: "siteVote", site });
      }
    }
    if ((m.phase === Phase.Planning || m.phase === Phase.Prep) && side === ATTACK && !this.spawnChosen) {
      this.spawnChosen = true;
      const group = this.rng.pick(m.map.spawnGroups);
      if (group) w.act({ kind: "spawn", group });
    }
  }

  /** Its operator: at once on a team of bots; on a team with people, once they've picked or the timer is nearly out. */
  private pickOperator(w: BotWorld, m: Match, side: 0 | 1) {
    const me = m.players.get(this.memberId)!;
    if (me.operator !== null) return;
    const now = w.sim.tick;
    if (this.pickAt === 0) this.pickAt = now + Math.round(this.rng.range(1, 3) * TICK_HZ);
    if (now < this.pickAt) return;
    const people = m.sides[side].map((id) => m.players.get(id)).filter((p) => p && p.bot === null && p.connected);
    const waiting = people.some((p) => p!.operator === null);
    if (waiting && m.ticksLeft(now) > PICK_LATE_S * TICK_HZ) return;
    const allowed = m.allowed(this.memberId);
    const how = m.mode.match.bots?.picks ?? "random";
    const op = how === "fixed" ? allowed[0] : this.rng.pick(allowed);
    if (op) w.pick(botLoadout(w.sim.data, op, this.rng.next()));
  }
}

/** A task's identity (a new one restarts its timers). */
function taskKey(t: Task): string {
  switch (t.kind) {
    case "reinforce":
      return `r${t.panel}.${t.section}`;
    case "barricade":
      return `b${t.panel}`;
    case "hole":
      return `h${t.panel}`;
    case "hold":
      return `k${t.spot.join()}`;
    case "roam":
      return `w${t.rooms.join()}`;
    case "retake":
      return "t";
    case "drone":
      return `d${t.to.join()}`;
    case "go":
      return `g${t.to.join()}`;
    case "plant":
      return "p";
    case "pickup":
      return "u";
    case "gadget":
      return `x${t.tag}`;
    case "shell":
      return `s${t.to.join()}`;
    case "kludge":
      return `q${t.to.join()}`;
  }
}

/**
 * A bot's loadout for an operator: the defaults, with the gadgets data/bots/picks.json gives it, and its other primary
 * (Fuze's Ballistic Shield) when `roll` (0–1) falls under that one's chance; each only if the loadout allows it.
 */
export function botLoadout(data: GameData, op: string, roll = 1): LoadoutPick {
  const base = defaultLoadoutPick(data, op);
  const gadgets = data.bots.picks.gadgets[op];
  const alt = data.bots.picks.primaries[op];
  let pick: LoadoutPick = gadgets ? { ...base, gadgets: [...gadgets] } : base;
  if (loadoutPickProblem(data, pick)) pick = base;
  if (alt && roll < alt.chance) {
    const shield: LoadoutPick = { ...pick, primary: { weapon: alt.id, sight: null, barrel: null, grip: null, underbarrel: null } };
    if (!loadoutPickProblem(data, shield)) pick = shield;
  }
  return pick;
}

/** Where the devices of the other side's a Kludge can hack are (`team`: the Kludge's): gadgets and default cameras. */
function hackables(sim: Sim, team: number): Vec3[] {
  const out: Vec3[] = [];
  for (const g of sim.gadgets.list) {
    if (g.team === team || g.flags & (GFlag.Flying | GFlag.Broken)) continue;
    if (sim.data.gadgets.get(kindId(g.kind) ?? "")?.hack) out.push(g.pos);
  }
  if (sim.matchRules.cameras) sim.level.def.cameras.forEach((cam, i) => sim.camTeam(i) !== team && sim.camWorks(i) && out.push([cam.pos[0], cam.pos[1], cam.pos[2]]));
  return out;
}

/** A link that isn't a barricade to break. */
const notBarricade = (l: NavLink) => l.kind !== LinkKind.Barricade;
/** A link a drone takes: a drop, or a door barricade (under its gap); no vault, ladder or window. */
const droneLink = (l: NavLink) => l.kind === LinkKind.Drop || (l.kind === LinkKind.Barricade && !l.vault);
