import { describe, expect, it } from "vitest";
import { crc32, createZip } from "./zip";

describe("zip writer", () => {
  it("matches the CRC-32 reference value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes entries whose local headers and central directory agree", () => {
    const files = [
      { name: "keymap.c", contents: "int main(void) { return 0; }\n" },
      { name: "README.md", contents: "build me\n" },
    ];
    const zip = createZip(files, new Date(2026, 0, 2, 3, 4, 5));
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const decoder = new TextDecoder();
    const eocd = zip.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(files.length);
    const directoryStart = view.getUint32(eocd + 16, true);
    let cursor = directoryStart;

    for (const file of files) {
      expect(view.getUint32(cursor, true)).toBe(0x02014b50);
      const crc = view.getUint32(cursor + 16, true);
      const size = view.getUint32(cursor + 20, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const name = decoder.decode(zip.slice(cursor + 46, cursor + 46 + nameLength));
      expect(name).toBe(file.name);

      expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
      expect(view.getUint32(localOffset + 14, true)).toBe(crc);
      expect(view.getUint32(localOffset + 18, true)).toBe(size);
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localName = decoder.decode(
        zip.slice(localOffset + 30, localOffset + 30 + localNameLength),
      );
      expect(localName).toBe(file.name);
      const dataStart = localOffset + 30 + localNameLength;
      const contents = decoder.decode(zip.slice(dataStart, dataStart + size));
      expect(contents).toBe(file.contents);
      expect(crc32(new TextEncoder().encode(file.contents))).toBe(crc);

      cursor += 46 + nameLength;
    }
    expect(view.getUint32(eocd + 12, true)).toBe(cursor - directoryStart);
  });

});
