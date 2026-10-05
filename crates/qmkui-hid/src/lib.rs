//! Read-only HID protocol support for QMKUI, plus a gated write module.
//!
//! This crate owns the VIA and Keychron read-command encoders/decoders that
//! the browser build mirrors in TypeScript. Reads are structurally write-free:
//! a [`HidTransport`] exposes only a bounded request/response primitive, and
//! the allow-list in [`allowlist`] gates every command frame that can be
//! emitted. Writes live in [`via_write`] and are gated by the same allow-list;
//! higher layers enforce operator consent and target validation. Flash and
//! bootloader encoders, when they arrive post-gate, will land as a separate
//! module.

pub mod allowlist;
pub mod keychron_v5;
pub mod transport;
pub mod via;
pub mod via_write;

pub use allowlist::{
    is_read_only_keychron_command, is_read_only_via_command, is_via_write_command,
};
pub use transport::{HidError, HidTransport};
pub use via::{ViaKeymap, ViaReadProtocol, ViaRgbMatrixState};
pub use via_write::{RgbMatrixLighting, ViaWriteProtocol};
