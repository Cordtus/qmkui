use serde::{Deserialize, Serialize};

/// The artifact being flashed and the device it is meant for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashTarget {
    pub project_digest: String,
    pub firmware_sha256: String,
    pub qmk_keyboard: String,
    pub bootloader: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentity {
    pub vendor_id: String,
    pub product_id: String,
}

/// A flash request. `operator_confirmed` is the explicit final confirmation;
/// the policy refuses anything without it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashRequest {
    pub target: FlashTarget,
    pub expected_device: DeviceIdentity,
    pub operator_confirmed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FlashStatus {
    Success,
    Failure,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashResult {
    pub status: FlashStatus,
    pub log: Vec<String>,
}
