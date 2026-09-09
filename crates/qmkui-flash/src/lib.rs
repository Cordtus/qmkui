//! Flash safety prep: models, wrong-target policy, and dry-run adapters.
//!
//! This crate performs **no HID/device I/O**. It exists so a real flash path
//! (post-gate, after the approved hardware test plan) only ever runs behind a
//! policy-verified adapter.

pub mod bootloader;
pub mod dry_run;
pub mod policy;
pub mod request;

pub use bootloader::{bootloader_registry, BootloaderFamily};
pub use policy::{assess_request, PolicyVerdict};
pub use request::{DeviceIdentity, FlashRequest, FlashResult, FlashStatus, FlashTarget};

use thiserror::Error;

#[derive(Debug, Error)]
pub enum FlashError {
    #[error("adapter is dry-run only and recorded the command sequence")]
    DryRun,
    #[error("flash adapter failed: {0}")]
    Adapter(String),
}
