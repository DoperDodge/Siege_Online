import { posix, win32, type PlatformPath } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStaticPath } from "../src/paths.js";

// Both path flavours run on every OS, so the Windows rules are checked on the Linux CI too.
const cases: [string, PlatformPath, string][] = [
  ["win32", win32, "C:\\Users\\dev\\Siege_Online\\game\\client\\dist\\"],
  ["posix", posix, "/home/dev/Siege_Online/game/client/dist/"],
];

describe.each(cases)("resolveStaticPath (%s)", (_name, path, root) => {
  const base = path.resolve(root);
  const resolve = (pathname: string) => resolveStaticPath(decodeURIComponent(pathname), root, path);

  it("serves files inside the client directory", () => {
    expect(resolve("/")).toEqual({ rel: "index.html", file: path.join(base, "index.html") });
    expect(resolve("/labs/")).toEqual({ rel: "labs/index.html", file: path.join(base, "labs", "index.html") });
    expect(resolve("/assets/index-abc.js")).toEqual({ rel: "assets/index-abc.js", file: path.join(base, "assets", "index-abc.js") });
    expect(resolve("/labs/../labs/movement_lab.html")).toEqual({ rel: "labs/movement_lab.html", file: path.join(base, "labs", "movement_lab.html") });
  });

  it("rejects backslashes and NUL bytes", () => {
    for (const p of [
      "/..%5c..%5cpackage.json",
      "/..%5C..%5C..%5C..%5C..%5C..%5CWindows%5Cwin.ini",
      "/..%5c..%5c..%5cWindows%5cwin.ini",
      "/assets/..%5c..%5cREADME.md",
      "/assets/..%5c..%5c..%5c..%5csecret.txt",
      "/index.html%00.png",
    ]) {
      expect(resolve(p), p).toEqual({ status: 400 });
    }
  });

  it("never resolves outside the client directory", () => {
    for (const p of ["/../../etc/passwd", "/..%2f..%2fetc%2fpasswd", "/C:/Windows/win.ini", "//server/share/x", "/assets/../../../x"]) {
      const r = resolve(p);
      if ("file" in r) expect(r.file.startsWith(base + path.sep), `${p} -> ${r.file}`).toBe(true);
      else expect(r.status, p).toBe(403);
    }
  });
});
