import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const PORT = 8097;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

let chromeProcess = null;
let server = null;
let isFinished = false;

function finish(code = 0) {
  if (isFinished) return;
  isFinished = true;
  if (chromeProcess) {
    try {
      chromeProcess.kill();
    } catch {}
  }
  if (server) {
    server.close();
  }
  process.exit(code);
}

server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = parsedUrl.pathname;

  if (pathname === "/qa-done" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");

      try {
        const results = JSON.parse(body);
        console.log("\n=======================================================");
        console.log("       TES USER-LEVEL QA VERIFICATION SUITE            ");
        console.log("=======================================================\n");

        let hasFailures = false;
        results.forEach((r, idx) => {
          if (r.status === "PASS") {
            console.log(` \x1b[32m✔\x1b[0m [${idx + 1}] ${r.name} ${r.detail || ""}`);
          } else {
            hasFailures = true;
            console.log(` \x1b[31m✖\x1b[0m [${idx + 1}] ${r.name}: ${r.error}`);
          }
        });

        console.log("\n-------------------------------------------------------");
        if (hasFailures) {
          console.log("\x1b[31mSOME USER-LEVEL QA TESTS FAILED!\x1b[0m");
          finish(1);
        } else {
          console.log(`\x1b[32mALL ${results.length} REAL USER INTERACTION TESTS PASSED 100%!\x1b[0m`);
          console.log("=======================================================\n");
          finish(0);
        }
      } catch (err) {
        console.error("Error parsing /qa-done body:", err);
        finish(1);
      }
    });
    return;
  }

  if (pathname === "/") pathname = "/qa-runner.html";
  const filePath = path.join(rootDir, pathname);
  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found: " + pathname);
      return;
    }
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`QA Server running at http://localhost:${PORT}`);
  const chromePath =
    process.env.CHROME_PATH ||
    (process.platform === "win32"
      ? path.join(
          process.env.ProgramFiles || "C:\\Program Files",
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : "google-chrome");

  chromeProcess = spawn(chromePath, [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--window-size=1600,900",
    `http://localhost:${PORT}/qa-runner.html?demo=1&dev=1`,
  ]);

  chromeProcess.on("error", (err) => {
    console.error("Failed to start Chrome:", err);
    finish(1);
  });

  // Timeout after 15 seconds if no response
  setTimeout(() => {
    if (!isFinished) {
      console.error("QA tests timed out after 15 seconds without receiving /qa-done callback!");
      finish(1);
    }
  }, 15000);
});
