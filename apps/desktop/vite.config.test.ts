import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { localDoctorReportPlugin } from "./vite.config";

let server: ViteDevServer | undefined;
let testDirectory: string | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  if (testDirectory) {
    await rm(testDirectory, { recursive: true, force: true });
    testDirectory = undefined;
  }
});

describe("local Doctor report development middleware", () => {
  it("serves the local JSON report only for its GET endpoint", async () => {
    const reportPath = await createReportFile('{"snapshot":{"hardwareProbe":{"status":"skipped"}}}');
    const origin = await startServer(reportPath);

    const response = await fetch(`${origin}/doctor-readiness.local.json`);
    const postResponse = await fetch(`${origin}/doctor-readiness.local.json`, { method: "POST" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ snapshot: { hardwareProbe: { status: "skipped" } } });
    expect(postResponse.status).toBe(404);
  });

  it("returns 404 when the local report is absent", async () => {
    testDirectory = await mkdtemp(join(tmpdir(), "qmkui-vite-test-"));
    const origin = await startServer(join(testDirectory, "missing.json"));

    const response = await fetch(`${origin}/doctor-readiness.local.json`);

    expect(response.status).toBe(404);
  });
});

async function createReportFile(contents: string): Promise<string> {
  testDirectory = await mkdtemp(join(tmpdir(), "qmkui-vite-test-"));
  const reportPath = join(testDirectory, "doctor-readiness.local.json");
  await writeFile(reportPath, contents);
  return reportPath;
}

async function startServer(reportPath: string): Promise<string> {
  server = await createServer({
    configFile: false,
    logLevel: "silent",
    plugins: [localDoctorReportPlugin(reportPath)],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
