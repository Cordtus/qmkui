/// Bootloader registry: family names, detection hints, and entry guidance.
/// Sourced from QMK `info.json` bootloader metadata (see catalog ingestion).
pub struct BootloaderFamily {
    pub name: &'static str,
    pub detection_hint: &'static str,
    pub entry_instruction: &'static str,
}

pub fn bootloader_registry() -> &'static [BootloaderFamily] {
    &[
        BootloaderFamily {
            name: "atmel-dfu",
            detection_hint: "USB VID/PID 03eb:2ff4 (ATmega32U4 DFU bootloader)",
            entry_instruction: "Press the reset button twice to enter DFU mode.",
        },
        BootloaderFamily {
            name: "rp2040",
            detection_hint: "USB VID/PID 2e8a:0003 (RP2040 UF2 bootloader)",
            entry_instruction: "Hold BOOT and press reset; mount the RPI-RP2 drive.",
        },
        BootloaderFamily {
            name: "stm32-dfu",
            detection_hint: "USB VID/PID 0483:df11 (STM32 system bootloader)",
            entry_instruction: "Boot into DFU by holding BOOT0 while powering on.",
        },
        BootloaderFamily {
            name: "qmk-dfu",
            detection_hint: "QMK DFU bootloader (HID bootloader interface)",
            entry_instruction: "Enter bootloader mode per the board's documented keycode.",
        },
    ]
}

pub fn lookup(name: &str) -> Option<&'static BootloaderFamily> {
    bootloader_registry()
        .iter()
        .find(|family| family.name == name)
}
