use serde_json::Value;
use std::collections::BTreeSet;
use std::sync::OnceLock;

/// The read-only command allow-list, sourced from
/// `fixtures/protocol/read-only-commands.json` — the single source of truth
/// shared with the TypeScript readers. A command frame is only ever emitted
/// after passing these gates.
#[derive(Debug)]
struct AllowList {
    via_read_commands: BTreeSet<u8>,
    keychron_read_commands: BTreeSet<u8>,
    keychron_rgb_operations: BTreeSet<u8>,
    via_write_commands: BTreeSet<u8>,
}

fn load() -> AllowList {
    let value: Value = serde_json::from_str(include_str!(
        "../../../fixtures/protocol/read-only-commands.json"
    ))
    .expect("read-only-commands.json is valid");
    let write_value: Value = serde_json::from_str(include_str!(
        "../../../fixtures/protocol/write-commands.json"
    ))
    .expect("write-commands.json is valid");
    AllowList {
        via_read_commands: command_set(&value["viaReadCommands"]),
        keychron_read_commands: command_set(&value["keychronReadCommands"]),
        keychron_rgb_operations: command_set(&value["keychronRgbReadOperations"]),
        via_write_commands: command_set(&write_value["viaWriteCommands"]),
    }
}

/// Parses the embedded allow-lists exactly once; every gate reads this cache.
fn allow_list() -> &'static AllowList {
    static ALLOW_LIST: OnceLock<AllowList> = OnceLock::new();
    ALLOW_LIST.get_or_init(load)
}

fn command_set(object: &Value) -> BTreeSet<u8> {
    object
        .as_object()
        .map(|entries| {
            entries
                .values()
                .filter_map(|value| value.as_u64())
                .map(|command| command as u8)
                .collect()
        })
        .unwrap_or_default()
}

pub fn is_read_only_via_command(command: u8) -> bool {
    allow_list().via_read_commands.contains(&command)
}

pub fn is_read_only_keychron_command(command: u8) -> bool {
    allow_list().keychron_read_commands.contains(&command)
}

/// A write command is permitted only when it is in the explicit write
/// allow-list. Nothing else may be emitted toward the device.
pub fn is_via_write_command(command: u8) -> bool {
    allow_list().via_write_commands.contains(&command)
}

pub fn is_read_only_rgb_op(operation: u8) -> bool {
    allow_list().keychron_rgb_operations.contains(&operation)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_documented_read_commands() {
        for command in [0x01u8, 0x02, 0x04, 0x08, 0x0c, 0x0d, 0x0e, 0x11, 0x12, 0x14] {
            assert!(is_read_only_via_command(command), "VIA read {command:#x}");
        }
        for command in [0xa0u8, 0xa1, 0xa2, 0xa3, 0xa8] {
            assert!(
                is_read_only_keychron_command(command),
                "Keychron read {command:#x}"
            );
        }
        for operation in [0x01u8, 0x03, 0x05, 0x06, 0x07, 0x09] {
            assert!(
                is_read_only_rgb_op(operation),
                "Keychron RGB op {operation:#x}"
            );
        }
    }

    #[test]
    fn rejects_mutation_commands() {
        for command in [
            0x03u8, 0x05, 0x06, 0x07, 0x09, 0x0a, 0x0b, 0x0f, 0x10, 0x13, 0x15,
        ] {
            assert!(!is_read_only_via_command(command), "VIA write {command:#x}");
        }
    }

    #[test]
    fn write_allow_list_is_explicit_and_minimal() {
        assert!(is_via_write_command(0x05)); // set keycode
        assert!(is_via_write_command(0x09)); // save EEPROM
        for command in [0x03u8, 0x07, 0x0a, 0x0b, 0x0f, 0x10, 0x13, 0x15] {
            assert!(!is_via_write_command(command), "unsafe write {command:#x}");
        }
        // No write command may also be a read command.
        for command in [0x01u8, 0x02, 0x04, 0x08, 0x11] {
            assert!(
                !is_via_write_command(command),
                "read reclassified as write {command:#x}"
            );
        }
    }
}
