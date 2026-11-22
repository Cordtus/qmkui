//! Flash safety: models, wrong-target policy, bootloader registry, and the
//! gated `qmk flash` adapter.
//!
//! The adapter is the only path that invokes QMK. It never opens a device
//! itself: bootloader detection is a read-only sysfs probe, and every run
//! requires an explicit operator confirmation plus matching device identity.

pub mod adapter;
pub mod bootloader;
pub mod bundle;
pub mod policy;
pub mod request;

pub use adapter::{prepare_keymap, retain_log, run_flash, PreparedFlash, QmkOutput};
pub use policy::{assess_request, assess_target, PolicyVerdict};
pub use request::{DeviceIdentity, FlashRequest, FlashResult, FlashStatus, FlashTarget};

#[derive(Debug, thiserror::Error)]
pub enum FlashError {
    #[error("invalid bundle: {0}")]
    InvalidBundle(String),
    #[error("invalid target: {0}")]
    InvalidTarget(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}
