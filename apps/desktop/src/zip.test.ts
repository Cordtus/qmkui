import { describe, expect, it } from "vitest";
import { crc32, createZip } from "./zip";

const decoder = new TextDecoder();

describe("zip writer", () => {
  it("matches the CRC-32 reference value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes stored entries with local headers and a central directory", () => {
    const zip = createZip(
      [
        { name: "keymap.c", contents: "int main(void) { return 0; }\n" },
        { name: "README.md", contents: "build me\n" },
      ],
      new Date(2026, 0, 2, 3, 4, 5),
    );
    const text = decoder.decode(zip);

    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(text).toContain("keymap.c");
    expect(text).toContain("README.md");
    expect(text).toContain("build me\n");
    // Central directory + end record are present.
    expect(text).toContain("PK\x01\x02");
    expect(text.slice(-22).startsWith("PK\x05\x06")).toBe(true);
  });
});
