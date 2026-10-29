import { spawn } from "node:child_process";
import { join } from "node:path";

export function link(harnessDir) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [join(harnessDir, "setup.mjs")], {
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`setup.mjs a échoué (code ${code})`)),
    );
  });
}
