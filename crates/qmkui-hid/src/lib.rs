//! Read-only HID protocol support for QMKUI.
//!
//! This crate owns the VIA and Keychron read-command encoders/decoders that
//! the browser build mirrors in TypeScript. It is structurally write-free: a
//! [`HidTransport`] exposes only a bounded request/response primitive, and the
//! allow-list in [`allowlist`] gates every command frame that can be emitted.
//! Flash and live-write encoders, when they arrive post-gate, will land as a
//! separate module rather than loosening this read surface.

pub mod allowlist;
pub mod keychron_v5;
pub mod transport;
pub mod via;
pub mod via_write;

#[cfg(feature = "hidapi-transport")]
pub mod hidapi;

pub use allowlist::{
    is_read_only_keychron_command, is_read_only_via_command, is_via_write_command,
};
pub use transport::{HidError, HidTransport};
pub use via::{ViaKeymap, ViaReadProtocol, ViaRgbMatrixState};
pub use via_write::ViaWriteProtocol;
