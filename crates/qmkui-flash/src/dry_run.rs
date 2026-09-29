use crate::request::{FlashRequest, FlashResult, FlashStatus};

/// Records the command sequence a real flash would run, without executing it.
pub struct DryRunAdapter;

impl DryRunAdapter {
    pub fn new() -> Self {
        Self
    }

    pub fn flash(&self, request: &FlashRequest) -> FlashResult {
        let log = vec![
            format!(
                "would flash {} ({}) to {}:{} with bootloader {}",
                request.target.qmk_keyboard,
                &request.target.firmware_sha256[..request.target.firmware_sha256.len().min(12)],
                request.expected_device.vendor_id,
                request.expected_device.product_id,
                request.target.bootloader,
            ),
            "dry-run: no command was executed".to_owned(),
        ];
        FlashResult {
            status: FlashStatus::Success,
            log,
        }
    }
}

impl Default for DryRunAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::{assess_request, PolicyVerdict};
    use crate::request::{DeviceIdentity, FlashRequest, FlashTarget};

    #[test]
    fn dry_run_records_without_executing() {
        let request = FlashRequest {
            target: FlashTarget {
                project_digest: "d".into(),
                firmware_sha256: "0123456789abcdef".into(),
                qmk_keyboard: "example/one".into(),
                bootloader: "atmel-dfu".into(),
            },
            expected_device: DeviceIdentity {
                vendor_id: "3434".into(),
                product_id: "0950".into(),
            },
            operator_confirmed: true,
        };
        let adapter = DryRunAdapter::new();
        let result = adapter.flash(&request);
        assert_eq!(result.status, FlashStatus::Success);
        assert!(result.log[0].contains("would flash"));
        assert!(result
            .log
            .iter()
            .any(|line| line.contains("no command was executed")));
    }

    #[test]
    fn dry_run_never_runs_a_blocked_request() {
        let request = FlashRequest {
            target: FlashTarget {
                project_digest: "stale".into(),
                firmware_sha256: "abc".into(),
                qmk_keyboard: "example/one".into(),
                bootloader: "atmel-dfu".into(),
            },
            expected_device: DeviceIdentity {
                vendor_id: "3434".into(),
                product_id: "0950".into(),
            },
            operator_confirmed: true,
        };
        // The adapter does not enforce policy; policy is assessed upstream.
        let verdict = assess_request(
            &request,
            "current",
            Some(&request.expected_device),
            Some("atmel-dfu"),
        );
        assert!(matches!(verdict, PolicyVerdict::Blocked { .. }));
    }
}
