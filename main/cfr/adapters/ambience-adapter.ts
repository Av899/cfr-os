/**
 * CFR OS: Ambience, Lighting & Sonos Audio Scene Adapter
 * Coordinates venue DALI/Lutron lighting dimmers and Sonos multi-room sound systems.
 * Automatically synchronizes ambience based on time-of-day:
 * - 08:00–16:00: Morning Workspace & Focus (4000K / 80% / 60 dB)
 * - 16:00–19:00: Afternoon Golden Hour (2700K / 65% / 65 dB)
 * - 19:00–23:00: Evening Lounge & Dusk (2200K / 40% / 68 dB)
 */

import { CfrAmbiencePreset, CfrAmbienceScene } from '../types/menu-adapters';

export const AMBIENCE_SCENES: Record<CfrAmbienceScene, Omit<CfrAmbiencePreset, 'is_override'>> = {
  WORKSPACE: {
    scene: 'WORKSPACE',
    title: 'Morning Workspace & Focus',
    start_time: '08:00',
    end_time: '16:00',
    color_temp_kelvin: 4000,
    brightness_percent: 80,
    playlist_name: 'CFR Morning Rituals • Acoustic Jazz & Lo-Fi Vinyl',
    target_db: 60,
    lighting_description: 'Clean daylight neutral white (4000K, 80%) for productive workspace focus.',
    audio_description: 'Gentle, unobtrusive acoustic jazz and lo-fi textures at conversation level (60 dB).',
  },
  GOLDEN_HOUR: {
    scene: 'GOLDEN_HOUR',
    title: 'Afternoon Golden Hour',
    start_time: '16:00',
    end_time: '19:00',
    color_temp_kelvin: 2700,
    brightness_percent: 65,
    playlist_name: 'CFR Golden Hour • Neo-Soul & Warm Vinyl Grooves',
    target_db: 65,
    lighting_description: 'Warm amber glow (2700K, 65%) accentuating pastry case and natural afternoon sun.',
    audio_description: 'Warm vinyl grooves, neo-soul rhythm, and rhythmic coffee shop energy (65 dB).',
  },
  EVENING_LOUNGE: {
    scene: 'EVENING_LOUNGE',
    title: 'Evening Dusk & Lounge',
    start_time: '19:00',
    end_time: '23:00',
    color_temp_kelvin: 2200,
    brightness_percent: 40,
    playlist_name: 'CFR Dusk & Night • Deep Downtempo Ambient & Cinematic Soul',
    target_db: 68,
    lighting_description: 'Intimate candlelight warmth (2200K, 40%) with soft pin-spots on dining tables.',
    audio_description: 'Rich low-end frequencies, cinematic downtempo, and twilight lounge atmosphere (68 dB).',
  },
};

export class AmbienceAdapter {
  private manualOverrideScene: CfrAmbienceScene | null = null;
  private overrideExpiresAt: number | null = null;

  /**
   * Evaluates the current active ambience preset based on local time or active manual override.
   */
  public getCurrentAmbience(asOfDate: Date = new Date()): CfrAmbiencePreset {
    // 1. Check if a manual override is active
    if (this.manualOverrideScene && this.overrideExpiresAt) {
      if (Date.now() < this.overrideExpiresAt) {
        return {
          ...AMBIENCE_SCENES[this.manualOverrideScene],
          is_override: true,
        };
      }
      // Override expired
      this.manualOverrideScene = null;
      this.overrideExpiresAt = null;
    }

    // 2. Derive scene from local hour
    const hour = asOfDate.getHours();

    let scene: CfrAmbienceScene;
    if (hour >= 8 && hour < 16) {
      scene = 'WORKSPACE';
    } else if (hour >= 16 && hour < 19) {
      scene = 'GOLDEN_HOUR';
    } else {
      // 19:00 to 07:59
      scene = 'EVENING_LOUNGE';
    }

    return {
      ...AMBIENCE_SCENES[scene],
      is_override: false,
    };
  }

  /**
   * Sets a manual override scene (e.g. for private tasting events or photo shoots).
   */
  public setOverride(scene: CfrAmbienceScene, durationMinutes = 60): CfrAmbiencePreset {
    this.manualOverrideScene = scene;
    this.overrideExpiresAt = Date.now() + durationMinutes * 60 * 1000;
    console.log(`[CFR Ambience] Manual override set: ${scene} for ${durationMinutes} minutes`);
    return this.getCurrentAmbience();
  }

  /**
   * Clears any active manual override and reverts to the scheduled time-of-day scene.
   */
  public clearOverride(): CfrAmbiencePreset {
    this.manualOverrideScene = null;
    this.overrideExpiresAt = null;
    return this.getCurrentAmbience();
  }
}

export const ambienceAdapter = new AmbienceAdapter();
