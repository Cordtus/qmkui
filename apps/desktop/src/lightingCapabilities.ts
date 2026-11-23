import type { FeatureState, KeyboardDefinition } from "./domain";

export type LightingSystemId = "backlight" | "rgblight" | "ledMatrix" | "rgbMatrix";

export type LightingSystem = {
  id: LightingSystemId;
  label: string;
  capability: FeatureState;
};

export function lightingSystemsForKeyboard(keyboard: KeyboardDefinition): LightingSystem[] {
  const features = keyboard.features ?? {};
  return [
    system("backlight", "Backlight", features.backlight),
    system("rgblight", "RGBLight", features.rgblight),
    system("ledMatrix", "LED Matrix", features.ledMatrix),
    system("rgbMatrix", "RGB Matrix", features.rgbMatrix),
  ];
}

function system(
  id: LightingSystemId,
  label: string,
  capability?: FeatureState,
): LightingSystem {
  return {
    id,
    label,
    capability: capability ?? { support: "unknown" },
  };
}
