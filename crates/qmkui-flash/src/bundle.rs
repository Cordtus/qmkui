//! Minimal reader for the store-only firmware bundle QMKUI exports.
//!
//! The browser writes the zip (`apps/desktop/src/zip.ts`); this reads exactly
//! that shape: stored entries, no zip64, no encryption, no data descriptors.
//! Entry names are limited to the bundle allow-list so extraction cannot
//! escape the keymap directory.

use crate::FlashError;

pub const BUNDLE_FILES: &[&str] = &["keymap.c", "qmkui-lighting-rules.c", "README.md"];
const MAX_ENTRY_SIZE: usize = 2 * 1024 * 1024;
pub const MAX_ARCHIVE_SIZE: usize = 16 * 1024 * 1024;
const MAX_ENTRIES: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BundleFile {
    pub name: String,
    pub contents: Vec<u8>,
}

pub fn read_bundle(bytes: &[u8]) -> Result<Vec<BundleFile>, FlashError> {
    if bytes.len() < 22 {
        return Err(invalid("archive is too small"));
    }
    if bytes.len() > MAX_ARCHIVE_SIZE {
        return Err(invalid("archive is too large"));
    }

    let eocd = find_eocd(bytes).ok_or_else(|| invalid("end of central directory not found"))?;
    let count = read_u16(bytes, eocd + 10)? as usize;
    if count == u16::MAX as usize {
        return Err(invalid("zip64 archives are not supported"));
    }
    if count > MAX_ENTRIES {
        return Err(invalid("archive has too many entries"));
    }
    let directory_offset = read_u32(bytes, eocd + 16)?;
    if directory_offset == u32::MAX {
        return Err(invalid("zip64 archives are not supported"));
    }
    let directory_offset = directory_offset as usize;
    if directory_offset >= eocd {
        return Err(invalid("central directory offset is invalid"));
    }

    let mut cursor = directory_offset;
    let mut files = Vec::with_capacity(count);

    for _ in 0..count {
        if read_u32(bytes, cursor)? != 0x0201_4b50 {
            return Err(invalid("central directory entry is malformed"));
        }
        let flags = read_u16(bytes, cursor + 8)?;
        let method = read_u16(bytes, cursor + 10)?;
        let crc = read_u32(bytes, cursor + 16)?;
        let compressed_size = read_u32(bytes, cursor + 20)?;
        let uncompressed_size = read_u32(bytes, cursor + 24)?;
        let name_length = read_u16(bytes, cursor + 28)? as usize;
        let extra_length = read_u16(bytes, cursor + 30)? as usize;
        let comment_length = read_u16(bytes, cursor + 32)? as usize;
        let local_offset = read_u32(bytes, cursor + 42)?;

        // Bit 11 is the UTF-8 name hint and is written by the app's zip.ts.
        // Everything else (encryption, data descriptor, patched data) is out.
        if flags & !0x0800 != 0 {
            return Err(invalid("only plain stored entries are supported"));
        }
        if method != 0 {
            return Err(invalid("only stored entries are supported"));
        }
        if compressed_size == u32::MAX || uncompressed_size == u32::MAX || local_offset == u32::MAX
        {
            return Err(invalid("zip64 archives are not supported"));
        }
        let compressed_size = compressed_size as usize;
        if compressed_size != uncompressed_size as usize || compressed_size > MAX_ENTRY_SIZE {
            return Err(invalid("entry size is invalid"));
        }
        let local_offset = local_offset as usize;
        if local_offset >= directory_offset {
            return Err(invalid("local header offset is invalid"));
        }

        let name_bytes = slice(bytes, cursor + 46, name_length)?;
        let name = std::str::from_utf8(name_bytes)
            .map_err(|_| invalid("entry name is not UTF-8"))?
            .to_owned();
        if !BUNDLE_FILES.contains(&name.as_str()) {
            return Err(invalid(format!("unexpected bundle file: {name}")));
        }
        if files.iter().any(|file: &BundleFile| file.name == name) {
            return Err(invalid(format!("duplicate bundle file: {name}")));
        }

        if read_u32(bytes, local_offset)? != 0x0403_4b50 {
            return Err(invalid("local header is malformed"));
        }
        let local_name_length = read_u16(bytes, local_offset + 26)? as usize;
        let local_extra_length = read_u16(bytes, local_offset + 28)? as usize;
        let local_name = slice(bytes, local_offset + 30, local_name_length)?;
        if local_name != name_bytes {
            return Err(invalid("local header name does not match the directory"));
        }
        let data_start = add(local_offset, 30)?;
        let data_start = add(data_start, local_name_length)?;
        let data_start = add(data_start, local_extra_length)?;
        let data_end = add(data_start, compressed_size)?;
        if data_end > directory_offset {
            return Err(invalid("entry data overlaps the central directory"));
        }
        let contents = slice(bytes, data_start, compressed_size)?.to_vec();
        if crc32(&contents) != crc {
            return Err(invalid(format!("checksum mismatch for {name}")));
        }

        files.push(BundleFile { name, contents });
        cursor = add(cursor, 46)?;
        cursor = add(cursor, name_length)?;
        cursor = add(cursor, extra_length)?;
        cursor = add(cursor, comment_length)?;
        if cursor > eocd {
            return Err(invalid("central directory overruns the archive"));
        }
    }

    if cursor != eocd {
        return Err(invalid("central directory size does not match the archive"));
    }
    if !files.iter().any(|file| file.name == "keymap.c") {
        return Err(invalid("bundle has no keymap.c"));
    }
    Ok(files)
}

/// Returns the EOCD whose comment length closes the archive, so a signature
/// inside a comment cannot shadow the real directory.
fn find_eocd(bytes: &[u8]) -> Option<usize> {
    if bytes.len() < 22 {
        return None;
    }
    let last = bytes.len() - 22;
    let first = last.saturating_sub(65_535);
    (first..=last).rev().find(|offset| {
        if bytes.get(*offset..*offset + 4) != Some(&[0x50, 0x4b, 0x05, 0x06]) {
            return false;
        }
        let comment = u16::from_le_bytes([bytes[offset + 20], bytes[offset + 21]]) as usize;
        offset + 22 + comment == bytes.len()
    })
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, FlashError> {
    let slice = slice(bytes, offset, 2)?;
    Ok(u16::from_le_bytes([slice[0], slice[1]]))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, FlashError> {
    let slice = slice(bytes, offset, 4)?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn slice(bytes: &[u8], offset: usize, length: usize) -> Result<&[u8], FlashError> {
    let end = add(offset, length)?;
    bytes
        .get(offset..end)
        .ok_or_else(|| invalid("entry points outside the archive"))
}

fn add(left: usize, right: usize) -> Result<usize, FlashError> {
    left.checked_add(right)
        .ok_or_else(|| invalid("offset overflow"))
}

pub fn crc32(data: &[u8]) -> u32 {
    let mut crc = 0xffff_ffffu32;
    for byte in data {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = (crc & 1).wrapping_neg();
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
}

fn invalid(reason: impl Into<String>) -> FlashError {
    FlashError::InvalidBundle(reason.into())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Builds the same store-only shape as `apps/desktop/src/zip.ts`.
    pub(crate) fn stored_zip(files: &[(&str, &[u8])], corrupt_crc: bool) -> Vec<u8> {
        let mut out = Vec::new();
        let mut directory = Vec::new();
        for (name, contents) in files {
            let offset = out.len() as u32;
            let crc = if corrupt_crc {
                crc32(contents) ^ 0xff
            } else {
                crc32(contents)
            };
            out.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
            out.extend_from_slice(&20u16.to_le_bytes());
            out.extend_from_slice(&0u16.to_le_bytes());
            out.extend_from_slice(&0u16.to_le_bytes());
            out.extend_from_slice(&0u16.to_le_bytes());
            out.extend_from_slice(&0u16.to_le_bytes());
            out.extend_from_slice(&crc.to_le_bytes());
            out.extend_from_slice(&(contents.len() as u32).to_le_bytes());
            out.extend_from_slice(&(contents.len() as u32).to_le_bytes());
            out.extend_from_slice(&(name.len() as u16).to_le_bytes());
            out.extend_from_slice(&0u16.to_le_bytes());
            out.extend_from_slice(name.as_bytes());
            out.extend_from_slice(contents);

            directory.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
            directory.extend_from_slice(&20u16.to_le_bytes());
            directory.extend_from_slice(&20u16.to_le_bytes());
            directory.extend_from_slice(&0u16.to_le_bytes());
            directory.extend_from_slice(&0u16.to_le_bytes());
            directory.extend_from_slice(&0u16.to_le_bytes());
            directory.extend_from_slice(&0u16.to_le_bytes());
            directory.extend_from_slice(&crc.to_le_bytes());
            directory.extend_from_slice(&(contents.len() as u32).to_le_bytes());
            directory.extend_from_slice(&(contents.len() as u32).to_le_bytes());
            directory.extend_from_slice(&(name.len() as u16).to_le_bytes());
            directory.extend_from_slice(&0u16.to_le_bytes());
            directory.extend_from_slice(&0u16.to_le_bytes());
            directory.extend_from_slice(&0u16.to_le_bytes());
            directory.extend_from_slice(&0u16.to_le_bytes());
            directory.extend_from_slice(&0u32.to_le_bytes());
            directory.extend_from_slice(&offset.to_le_bytes());
            directory.extend_from_slice(name.as_bytes());
        }
        let directory_offset = out.len() as u32;
        out.extend_from_slice(&directory);
        out.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&(files.len() as u16).to_le_bytes());
        out.extend_from_slice(&(files.len() as u16).to_le_bytes());
        out.extend_from_slice(&(directory.len() as u32).to_le_bytes());
        out.extend_from_slice(&directory_offset.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out
    }

    fn bundle() -> Vec<u8> {
        stored_zip(
            &[
                ("keymap.c", b"int main(void) { return 0; }\n"),
                ("README.md", b"build me\n"),
            ],
            false,
        )
    }

    #[test]
    fn reads_bundles_from_the_app_and_an_external_zip_tool() {
        let mut expected = BUNDLE_FILES.to_vec();
        expected.sort_unstable();
        for bytes in [
            include_bytes!("../../../fixtures/firmware/app-bundle.zip").as_slice(),
            include_bytes!("../../../fixtures/firmware/example.zip").as_slice(),
        ] {
            let files = read_bundle(bytes).unwrap();
            let mut names: Vec<_> = files.iter().map(|file| file.name.as_str()).collect();
            names.sort_unstable();
            assert_eq!(names, expected);
        }
    }

    #[test]
    fn matches_the_crc32_reference_value() {
        assert_eq!(crc32(b"123456789"), 0xcbf43926);
    }

    #[test]
    fn reads_the_exported_bundle() {
        let files = read_bundle(&bundle()).unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].name, "keymap.c");
        assert_eq!(files[0].contents, b"int main(void) { return 0; }\n");
    }

    #[test]
    fn rejects_corruption_and_unexpected_names() {
        let corrupt = stored_zip(&[("keymap.c", b"x")], true);
        assert!(read_bundle(&corrupt).is_err());

        let unexpected = stored_zip(&[("keymap.c", b"x"), ("../evil.c", b"x")], false);
        assert!(read_bundle(&unexpected).is_err());

        let duplicate = stored_zip(&[("keymap.c", b"x"), ("keymap.c", b"y")], false);
        assert!(read_bundle(&duplicate).is_err());

        let missing = stored_zip(&[("README.md", b"x")], false);
        assert!(read_bundle(&missing).is_err());
    }

    #[test]
    fn accepts_the_utf8_flag_the_app_writes() {
        let mut utf8 = bundle();
        let eocd = utf8.len() - 22;
        let directory = u32::from_le_bytes([
            utf8[eocd + 16],
            utf8[eocd + 17],
            utf8[eocd + 18],
            utf8[eocd + 19],
        ]) as usize;
        utf8[6..8].copy_from_slice(&0x0800u16.to_le_bytes());
        utf8[directory + 8..directory + 10].copy_from_slice(&0x0800u16.to_le_bytes());
        assert!(read_bundle(&utf8).is_ok());
    }

    #[test]
    fn rejects_flags_zip64_and_mismatched_local_names() {
        let mut flagged = bundle();
        let eocd = flagged.len() - 22;
        let directory = u32::from_le_bytes([
            flagged[eocd + 16],
            flagged[eocd + 17],
            flagged[eocd + 18],
            flagged[eocd + 19],
        ]) as usize;
        flagged[directory + 8] = 0x08; // data descriptor flag
        assert!(read_bundle(&flagged).is_err());

        let mut zip64 = bundle();
        let zip64_eocd = zip64.len() - 22;
        zip64[zip64_eocd + 10..zip64_eocd + 12].copy_from_slice(&u16::MAX.to_le_bytes());
        assert!(read_bundle(&zip64).is_err());

        let mut renamed = bundle();
        renamed[30] = b'K'; // local header name no longer matches
        assert!(read_bundle(&renamed).is_err());
    }

    #[test]
    fn rejects_a_truncated_archive() {
        let zip = bundle();
        for length in [0, 10, 21, zip.len() / 2, zip.len() - 1] {
            assert!(read_bundle(&zip[..length]).is_err());
        }
    }
}
