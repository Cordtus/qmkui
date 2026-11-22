use crate::request::{DeviceIdentity, FlashRequest};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyVerdict {
    Pass,
    Blocked { reason: String },
}

/// Wrong-target blocking. A flash request only passes when the operator has
/// explicitly confirmed, the artifact matches the current project digest, and
/// the detected device identity and bootloader family match the target.
pub fn assess_request(
    request: &FlashRequest,
    current_project_digest: &str,
    detected_device: Option<&DeviceIdentity>,
    detected_bootloader: Option<&str>,
) -> PolicyVerdict {
    if request.target.project_digest != current_project_digest {
        return PolicyVerdict::Blocked {
            reason: "Artifact is stale relative to the current project.".to_owned(),
        };
    }
    assess_target(request, detected_device, detected_bootloader)
}

/// The device-side half of the policy. The CLI has no separate project state,
/// so it assesses the target before staging anything and treats the supplied
/// bundle as current.
pub fn assess_target(
    request: &FlashRequest,
    detected_device: Option<&DeviceIdentity>,
    detected_bootloader: Option<&str>,
) -> PolicyVerdict {
    if !request.operator_confirmed {
        return PolicyVerdict::Blocked {
            reason: "Operator has not confirmed the flash target.".to_owned(),
        };
    }
    match detected_device {
        Some(device) if device == &request.expected_device => {}
        Some(_) => {
            return PolicyVerdict::Blocked {
                reason: "Connected device does not match the flash target.".to_owned(),
            };
        }
        None => {
            return PolicyVerdict::Blocked {
                reason: "No bootloader device was detected.".to_owned(),
            };
        }
    }
    match detected_bootloader {
        Some(bootloader) if bootloader == request.target.bootloader => {}
        Some(found) => {
            return PolicyVerdict::Blocked {
                reason: format!(
                    "Bootloader family mismatch: expected {}, found {}.",
                    request.target.bootloader, found
                ),
            };
        }
        None => {
            return PolicyVerdict::Blocked {
                reason: "Bootloader family could not be determined.".to_owned(),
            };
        }
    }
    PolicyVerdict::Pass
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::request::{FlashRequest, FlashTarget};

    fn request(confirmed: bool) -> FlashRequest {
        FlashRequest {
            target: FlashTarget {
                project_digest: "digest-a".to_owned(),
                firmware_sha256: "abc".to_owned(),
                qmk_keyboard: "example/one".to_owned(),
                bootloader: "atmel-dfu".to_owned(),
            },
            expected_device: DeviceIdentity {
                vendor_id: "3434".to_owned(),
                product_id: "0950".to_owned(),
            },
            operator_confirmed: confirmed,
        }
    }

    fn device() -> DeviceIdentity {
        DeviceIdentity {
            vendor_id: "3434".to_owned(),
            product_id: "0950".to_owned(),
        }
    }

    #[test]
    fn passes_when_everything_matches() {
        let verdict = assess_request(
            &request(true),
            "digest-a",
            Some(&device()),
            Some("atmel-dfu"),
        );
        assert_eq!(verdict, PolicyVerdict::Pass);
    }

    #[test]
    fn blocks_without_operator_confirmation() {
        let verdict = assess_request(
            &request(false),
            "digest-a",
            Some(&device()),
            Some("atmel-dfu"),
        );
        assert!(matches!(verdict, PolicyVerdict::Blocked { .. }));
    }

    #[test]
    fn blocks_stale_artifacts() {
        let verdict = assess_request(
            &request(true),
            "digest-changed",
            Some(&device()),
            Some("atmel-dfu"),
        );
        assert!(matches!(verdict, PolicyVerdict::Blocked { reason } if reason.contains("stale")));
    }

    #[test]
    fn blocks_wrong_device_identity() {
        let wrong = DeviceIdentity {
            vendor_id: "0000".to_owned(),
            product_id: "0000".to_owned(),
        };
        let verdict = assess_request(&request(true), "digest-a", Some(&wrong), Some("atmel-dfu"));
        assert!(
            matches!(verdict, PolicyVerdict::Blocked { reason } if reason.contains("does not match"))
        );
    }

    #[test]
    fn blocks_bootloader_mismatch() {
        let verdict = assess_request(&request(true), "digest-a", Some(&device()), Some("rp2040"));
        assert!(
            matches!(verdict, PolicyVerdict::Blocked { reason } if reason.contains("Bootloader family mismatch"))
        );
    }

    #[test]
    fn target_gate_checks_confirmation_and_device_without_project_state() {
        let confirmed = request(true);
        assert_eq!(
            assess_target(&confirmed, Some(&device()), Some("atmel-dfu"),),
            PolicyVerdict::Pass
        );

        let unconfirmed = request(false);
        assert!(matches!(
            assess_target(&unconfirmed, Some(&device()), Some("atmel-dfu")),
            PolicyVerdict::Blocked { reason } if reason.contains("confirmed")
        ));
        assert!(matches!(
            assess_target(&confirmed, None, Some("atmel-dfu")),
            PolicyVerdict::Blocked { reason } if reason.contains("No bootloader")
        ));
    }

    #[test]
    fn blocks_when_no_device_detected() {
        let verdict = assess_request(&request(true), "digest-a", None, Some("atmel-dfu"));
        assert!(
            matches!(verdict, PolicyVerdict::Blocked { reason } if reason.contains("No bootloader device"))
        );
    }
}
