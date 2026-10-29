import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const PORT = 8089;
const outputDir = process.env.TES_SCREENSHOT_DIR
  ? path.resolve(process.env.TES_SCREENSHOT_DIR)
  : path.join(rootDir, "outputs", "screenshots");

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = parsedUrl.pathname;
  if (pathname === "/") pathname = "/index.html";

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

server.listen(PORT, async () => {
  console.log(`Static server running at http://localhost:${PORT}`);
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

  const targets = [
    { file: "screenshot-energy.png", query: "demo=1&tab=energy" },
    { file: "screenshot-improve-available.png", query: "demo=1&tab=energy&scenario=improve-available" },
    { file: "screenshot-improve-unavailable.png", query: "demo=1&tab=energy&scenario=improve-unavailable" },
    { file: "screenshot-transistor-enabled.png", query: "demo=1&tab=energy&scenario=improve-available" },
    { file: "screenshot-transistor-disabled.png", query: "demo=1&tab=energy&scenario=transistor-disabled" },
    { file: "screenshot-data-cap.png", query: "demo=1&tab=energy&scenario=data-cap" },
    { file: "screenshot-energy-era-early.png", query: "demo=1&tab=energy&scenario=improve-available" },
    { file: "screenshot-energy-era-advanced.png", query: "demo=1&tab=energy&scenario=energy-advanced" },
    { file: "screenshot-so-side-by-side.png", query: "demo=1&tab=energy&scenario=so-card" },
    { file: "screenshot-so-modal.png", query: "demo=1&tab=energy&scenario=so-modal" },
  ];

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    for (const item of targets) {
      console.log(`Capturing ${item.file}...`);
      const localPath = path.join(outputDir, item.file);
      await execFileAsync(chromePath, [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--hide-scrollbars",
        "--virtual-time-budget=3000",
        "--run-all-compositor-stages-before-draw",
        "--window-size=1600,900",
        `--screenshot=${localPath}`,
        `http://localhost:${PORT}/index.html?${item.query}`,
      ]);
      console.log(`Captured ${item.file}`);
    }

    console.log(`All screenshots captured in ${outputDir}`);
  } catch (err) {
    console.error("Error capturing screenshots:", err);
  } finally {
    server.close();
    process.exit(0);
  }
});
