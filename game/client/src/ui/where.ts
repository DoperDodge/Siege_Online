// Where you are on a map and where you can go (tools/mapgen/DESIGN.md E9 part 1, amendment 17): the HUD line
// (the room's callout, the storey, and your position in the plan's units: world u, the 1F frame, and your
// storey's own u, the frame its wall file uses) and the pause menu's Go to, by storey and room.
import type { LevelDef } from "@redmond/shared";
import { storeyOf } from "../render/labScene.js";

type Room = LevelDef["rooms"][number];
/** How a storey's own drawing maps to world u: world = a · native + b, per axis (DESIGN §3.2). */
type Frame = NonNullable<LevelDef["plan"]>["frames"][string];
/** What the HUD line and Go to read from a level. */
type MapInfo = Pick<LevelDef, "storeys" | "rooms" | "plan">;

/** The first room on storey `storeyId` whose rectangles hold (x, z), metres; null outside every room. */
export function roomAt(rooms: readonly Room[], storeyId: string, x: number, z: number): Room | null {
  for (const room of rooms) {
    if (room.storey !== storeyId) continue;
    for (const [x0, z0, x1, z1] of room.rects) if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1)) return room;
  }
  return null;
}

/** A point in world u as a storey's own drawing has it: native = (world − b) / a, per axis. */
export function nativeU(frame: Frame, wx: number, wy: number): [number, number] {
  return [(wx - frame.bx) / frame.ax, (wy - frame.by) / frame.ay];
}

/**
 * The HUD line for feet at (x, z) metres on storey `storey` (its place in the level's storeys): the room's
 * callout ("outside" where no room is, "—" on a level without rooms), the storey, and with a plan the position
 * in world u and in the storey's own u. For example "Kids' Dorms · 2F · world u 175.2, 182.0 · 2F u 179.3, 183.9".
 */
export function whereText(level: MapInfo, storey: number, x: number, z: number, plain = false): string {
  const s = level.storeys[storey];
  const room = s ? roomAt(level.rooms, s.id, x, z) : null;
  let text = `${room ? room.callout : level.rooms.length ? "outside" : "—"} · ${s?.id ?? "—"}`;
  const plan = level.plan;
  if (!plan || plain) return text;
  const wx = x / plan.mPerU;
  const wy = z / plan.mPerU;
  text += ` · world u ${wx.toFixed(1)}, ${wy.toFixed(1)}`;
  const frame = s ? plan.frames[s.id] : undefined;
  if (!s || !frame) return text;
  const [nx, ny] = nativeU(frame, wx, wy);
  return `${text} · ${s.id} u ${nx.toFixed(1)}, ${ny.toFixed(1)}`;
}

/** A Go to entry: its name, where it puts your feet, which way you face (degrees), and its room or site, if it is one. */
export interface GoToSpot {
  name: string;
  pos: [number, number, number];
  yawDeg: number;
  room?: string;
  site?: string;
}

/**
 * The entries under one storey's heading; `storey` null: one plain list (a level without rooms), or with
 * `sites`, the bomb sites' heading over the storeys.
 */
export interface GoToGroup {
  storey: string | null;
  sites?: true;
  spots: GoToSpot[];
}

/** Where Go to by site puts you: its first defender spawn, facing between its bombs as defenders do. */
function siteSpot(level: Pick<LevelDef, "spawns">, site: LevelDef["sites"][number]): GoToSpot {
  const spawn = level.spawns.find((s) => s.side === "defense" && s.group === site.id);
  if (spawn) return { name: site.name, pos: [...spawn.pos], yawDeg: spawn.yawDeg, site: site.id };
  // No defenders there: at its first bomb, facing the other.
  const [a, b] = site.bombs;
  const yawDeg = b ? (Math.atan2(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]) * 180) / Math.PI : 0;
  return { name: site.name, pos: [...a.pos], yawDeg, site: site.id };
}

/**
 * The pause menu's Go to. A level with rooms lists its bomb sites first (Go to by site: each site at its first
 * defender spawn), then its rooms by storey (in the level's order), each by its callout at its anchor, facing
 * north (an anchor has no facing), and files the page's own spots (`extra`: name, x, y, z, yaw in degrees) under
 * the storey at their height, after its rooms. Without rooms, the page's list as it is.
 */
export function goToMenu(
  level: Pick<LevelDef, "storeys" | "rooms"> & Partial<Pick<LevelDef, "sites" | "spawns">>,
  extra: readonly (readonly [string, number, number, number, number])[],
): GoToGroup[] {
  const spot = ([name, x, y, z, yawDeg]: readonly [string, number, number, number, number]): GoToSpot => ({ name, pos: [x, y, z], yawDeg });
  if (!level.rooms.length || !level.storeys.length) return [{ storey: null, spots: extra.map(spot) }];
  const sites = (level.sites ?? []).filter((s) => s.bombs.length > 0);
  const bySite: GoToGroup[] = sites.length ? [{ storey: null, sites: true, spots: sites.map((s) => siteSpot({ spawns: level.spawns ?? [] }, s)) }] : [];
  const groups: GoToGroup[] = level.storeys.map((s) => ({ storey: s.id, spots: [] }));
  for (const room of level.rooms) {
    const [x, y, z] = room.anchor;
    const on = level.storeys.findIndex((s) => s.id === room.storey);
    groups[on >= 0 ? on : storeyOf(level.storeys, y)].spots.push({ name: room.callout, pos: [x, y, z], yawDeg: 0, room: room.id });
  }
  for (const e of extra) groups[storeyOf(level.storeys, e[2])].spots.push(spot(e));
  return [...bySite, ...groups.filter((g) => g.spots.length > 0)];
}

/** The line is rewritten at most this often (it changes as you walk; ten times a second reads fine). */
const WHERE_MS = 100;

/** The HUD line, bottom left, on a map with a plan. */
export class WhereHud {
  /** What the line says now. */
  text = "";
  private readonly el: HTMLElement;
  private at = -Infinity;

  /** `plain`: the room and storey only (a match), not where you are in the plan's units (the lab). */
  constructor(
    root: HTMLElement,
    private readonly level: MapInfo,
    private readonly plain = false,
  ) {
    this.el = document.createElement("div");
    this.el.className = "hud where";
    root.append(this.el);
  }

  /** Each frame: the storey you're on (its place in the level's storeys) and your feet (x, z), metres. */
  update(now: number, storey: number, x: number, z: number): void {
    if (now - this.at < WHERE_MS) return;
    this.at = now;
    const text = whereText(this.level, storey, x, z, this.plain);
    if (text === this.text) return;
    this.text = text;
    this.el.textContent = text;
  }
}
