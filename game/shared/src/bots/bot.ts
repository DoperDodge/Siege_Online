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
import { Btn, PawnKind, PawnMode, Stance, WeaponAct, type InputCmd } from "../player/types.js";
import type { Sim } from "../sim.js";
import type { Vec3 } from "../core/math.js";
import { fireModeOf, loadedOf } from "../weapons/step.js";
import { Aim, lookAt, viewGap, type View } from "./aim.js";
import { FollowState, PathFollower } from "./nav/follow.js";
import { LinkKind, type NavLink } from "./nav/grid.js";
import type { NavWorld } from "./nav/world.js";
import { eyeOf, Perception, Source, type Contact, type TeamBoard } from "./perceive.js";
import { roomSpots, type Task } from "./plan.js";
import { DeployKind } from "../destruction/deploy.js";
import { defaultLoadoutPick, type LoadoutPick } from "../weapons/loadout.js";
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
export const Doing = { Task: 0, Fight: 1, Hold: 2, Investigate: 3, Reload: 4, Revive: 5 } as const;
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
    if ((now + this.memberId) % 4 === 0) this.decide(w, pawn, mates, d, now);
    const input = this.act(w, pawn, mates, d, now);
    this.asked = { yaw: input.yaw, pitch: input.pitch };
    return input;
  }

  // ------------------------------------------------------------------ deciding

  /** Score what it could do and take the best (keeping the current one unless beaten by KEEP). */
  private decide(w: BotWorld, me: Pawn, mates: readonly Pawn[], d: BotDifficulty, now: number) {
    const s = me.state;
    const job = this.order ? null : w.taskOf();
    const target = this.senses.target(me);
    const recent = this.senses.recent(now, SOUND_S);
    const w0 = me.loadout?.weapons[s.slot];
    const loaded = loadedOf(s);
    const low = w0 ? loaded < Math.max(1, w0.ammo.magazine * 0.3) : false;
    const downMate = mates.find((p) => p.state.mode === PawnMode.Downed && Math.hypot(p.state.x - s.x, p.state.z - s.z) < 15);
    // Its planner's job (setting up in prep, a retake) comes before chasing sounds; a role (hold, roam) after them.
    const jobScore = job && (job.kind === "reinforce" || job.kind === "barricade" || job.kind === "hole" || job.kind === "retake") ? 0.75 : 0.3;
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
    let best = scores[0];
    for (const sc of scores) if (sc[1] > best[1]) best = sc;
    const current = scores.find((sc) => sc[0] === this.doing);
    if (current && current[1] + KEEP >= best[1] && current[0] !== Doing.Fight) best = current;
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
    }
    return this.task(w, me, now);
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
    }
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
    const job = w.taskOf();
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
    if (op) w.pick(defaultLoadoutPick(w.sim.data, op));
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
  }
}

/** A link that isn't a barricade to break. */
const notBarricade = (l: NavLink) => l.kind !== LinkKind.Barricade;
/** A link a drone takes: a drop, or a door barricade (under its gap); no vault, ladder or window. */
const droneLink = (l: NavLink) => l.kind === LinkKind.Drop || (l.kind === LinkKind.Barricade && !l.vault);
