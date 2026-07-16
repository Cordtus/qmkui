import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const doctorReportEndpoint = "/doctor-readiness.local.json";
const defaultDoctorReportPath = fileURLToPath(
  new URL("./.local/doctor-readiness.local.json", import.meta.url),
);
const thirdPartyNoticesPath = fileURLToPath(
  new URL("../../THIRD_PARTY_NOTICES.md", import.meta.url),
);

export function localDoctorReportPlugin(reportPath = defaultDoctorReportPath): Plugin {
  return {
    name: "qmkui-local-doctor-report",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.method !== "GET" || request.url !== doctorReportEndpoint) {
          next();
          return;
        }

        try {
          const report = await readFile(reportPath);
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json");
          response.end(report);
        } catch (error) {
          if (isMissingFile(error)) {
            response.statusCode = 404;
            response.end();
            return;
          }
          next(error as Error);
        }
      });
    },
  };
}

function thirdPartyNoticesPlugin(): Plugin {
  return {
    name: "qmkui-third-party-notices",
    apply: "build",
    async buildStart() {
      this.emitFile({
        type: "asset",
        fileName: "THIRD_PARTY_NOTICES.md",
        source: await readFile(thirdPartyNoticesPath),
      });
    },
  };
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export default defineConfig({
  base: "./",
  plugins: [localDoctorReportPlugin(), thirdPartyNoticesPlugin()],
});
