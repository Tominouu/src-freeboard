import { Injectable } from '@angular/core';

export type AlertLevel = 'low' | 'medium' | 'high';

@Injectable({ providedIn: 'root' })
export class AudioAlertService {
  private debounceMap = new Map<string, number>();
  private readonly DEBOUNCE_MS = 3000; // 3 seconds
  
  private readonly soundFiles = {
    low: './assets/sounds/alert_small',
    medium: './assets/sounds/alert_medium',
    high: './assets/sounds/alert_large'
  };
  
  private readonly volumes = {
    low: 0.4,
    medium: 0.7,
    high: 1.0
  };

  constructor() {}

  /**
   * Play alert sound for the specified level
   * @param level Alert level (low, medium, high)
   * @param regionId Region identifier for debouncing
   * @param customSoundUrl Optional custom sound URL override
   * @param globalMute Whether global mute is enabled
   * @returns Promise that resolves when sound starts playing or is skipped
   */
  async playAlert(
    level: AlertLevel,
    regionId: string,
    customSoundUrl?: string,
    globalMute = false
  ): Promise<void> {
    // Check global mute
    if (globalMute) {
      console.log(`[AudioAlertService] Sound muted globally for region ${regionId}`);
      return;
    }

    // Check debounce
    const now = Date.now();
    const lastPlayed = this.debounceMap.get(regionId);
    if (lastPlayed && now - lastPlayed < this.DEBOUNCE_MS) {
      console.log(`[AudioAlertService] Debounced sound for region ${regionId} (${now - lastPlayed}ms ago)`);
      return;
    }

    // Update debounce timestamp
    this.debounceMap.set(regionId, now);

    // Determine sound URL
    const soundUrl = customSoundUrl || this.getSoundUrl(level);
    const volume = this.volumes[level];

    console.log(`[AudioAlertService] Playing ${level} alert for region ${regionId} at volume ${volume}`);

    try {
      await this.playSound(soundUrl, volume);
    } catch (error) {
      console.error('[AudioAlertService] Error playing sound:', error);
    }
  }

  /**
   * Get sound URL for the specified level, trying .ogg first, then .mp3
   */
  private getSoundUrl(level: AlertLevel): string {
    const base = this.soundFiles[level];
    // Browsers prefer .ogg for web audio, fallback to .mp3
    return `${base}.ogg`;
  }

  /**
   * Play sound using HTMLAudioElement (simpler and more compatible)
   */
  private async playSound(url: string, volume: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.volume = volume;
      audio.src = url;
      
      const playAudioWhenReady = () => {
        audio.play()
          .then(() => resolve())
          .catch((err) => reject(err));
      };
      
      audio.addEventListener('canplaythrough', playAudioWhenReady, { once: true });
      
      audio.addEventListener('error', (err) => {
        // Try .mp3 fallback if .ogg fails
        if (url.endsWith('.ogg')) {
          console.warn(`Failed to load ${url}, trying .mp3 fallback`);
          const mp3Url = url.replace('.ogg', '.mp3');
          const fallbackAudio = new Audio();
          fallbackAudio.volume = volume;
          fallbackAudio.src = mp3Url;
          
          fallbackAudio.addEventListener('canplaythrough', () => {
            fallbackAudio.play()
              .then(() => resolve())
              .catch((fallbackErr) => reject(fallbackErr));
          }, { once: true });
          
          fallbackAudio.addEventListener('error', () => {
            reject(new Error(`Failed to load both audio formats: ${url}, ${mp3Url}`));
          }, { once: true });
        } else {
          reject(new Error(`Failed to load audio: ${url}`));
        }
      }, { once: true });
      
      // Fallback timeout
      setTimeout(() => {
        if (audio.paused) {
          reject(new Error('Audio load timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Clear debounce for a specific region
   */
  clearDebounce(regionId: string): void {
    this.debounceMap.delete(regionId);
  }

  /**
   * Clear all debounces
   */
  clearAllDebounces(): void {
    this.debounceMap.clear();
  }

  /**
   * Infer alert level from color using hue
   * Green (hue ~120) → low
   * Orange (hue ~30) → medium
   * Red (hue ~0/360) → high
   */
  static inferAlertLevelFromColor(color: string): AlertLevel {
    const hue = AudioAlertService.getHueFromColor(color);
    
    if (hue === null) {
      // Default to medium if we can't parse the color
      return 'medium';
    }

    // Determine level based on hue ranges
    // Green: 90-150 → low
    // Orange/Yellow: 20-89 → medium
    // Red: 0-19 or 330-360 → high
    
    if (hue >= 90 && hue <= 150) {
      return 'low'; // Green range
    } else if (hue >= 20 && hue < 90) {
      return 'medium'; // Orange/Yellow range
    } else if ((hue >= 0 && hue < 20) || (hue >= 330 && hue <= 360)) {
      return 'high'; // Red range
    } else {
      // Default for other colors (blue, purple, etc.)
      return 'medium';
    }
  }

  /**
   * Extract hue from color string (hex, rgb, rgba)
   */
  private static getHueFromColor(color: string): number | null {
    if (!color) return null;

    let r: number, g: number, b: number;

    // Parse hex color
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length >= 6) {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      } else {
        return null;
      }
    }
    // Parse rgb/rgba color
    else if (color.startsWith('rgb')) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return null;
      r = parseInt(match[1]);
      g = parseInt(match[2]);
      b = parseInt(match[3]);
    } else {
      return null;
    }

    // Convert RGB to HSL to get hue
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let hue = 0;

    if (delta === 0) {
      hue = 0;
    } else if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }

    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;

    return hue;
  }
}
