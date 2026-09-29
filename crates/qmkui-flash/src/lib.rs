//! Flash safety prep: models, wrong-target policy, and dry-run adapters.
//!
//! This crate performs **no HID/device I/O**. It exists so a real flash path
//! (post-gate, after the approved hardware test plan) only ever runs behind a
//! policy-verified adapter.

pub mod dry_run;
pub mod policy;
pub mod request;

pub use policy::{assess_request, PolicyVerdict};
pub use request::{DeviceIdentity, FlashRequest, FlashResult, FlashStatus, FlashTarget};
