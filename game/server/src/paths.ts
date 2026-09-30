// Maps a request path to a file inside the client directory. Pure, and the path module is passed in, so
// the Windows rules can be unit-tested on the Linux CI (test/paths.test.ts).
import { posix, type PlatformPath } from "node:path";

/** The file a request path serves (`rel` uses "/"), or the error status to answer with. */
export type StaticPath = { rel: string; file: string } | { status: 400 | 403 };

/** `pathname` is the decoded URL path; `root` is the directory to serve from. */
export function resolveStaticPath(pathname: string, root: string, path: PlatformPath): StaticPath {
  // "\" is a separator on Windows but not in URLs: "/..%5c..%5cWindows%5cwin.ini" would climb out of root.
  if (pathname.includes("\0") || pathname.includes("\\")) return { status: 400 };

  // Resolve with POSIX rules (URLs always use "/"), then refuse anything that climbs out of root.
  let rel = posix.normalize(pathname).replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  if (rel === ".." || rel.startsWith("../")) return { status: 403 };

  // Whatever the platform's path rules make of the segments (drive letters, UNC names), the file must
  // still be inside root.
  const base = path.resolve(root);
  const file = path.resolve(base, ...rel.split("/"));
  const inside = base.endsWith(path.sep) ? base : base + path.sep;
  if (file !== base && !file.startsWith(inside)) return { status: 403 };
  return { rel, file };
}
