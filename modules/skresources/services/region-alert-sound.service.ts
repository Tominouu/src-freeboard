import { Injectable } from '@angular/core';

export type AlertLevel = 'low' | 'medium' | 'high';

export interface RegionAlertConfig {
  alertLevel: AlertLevel;
  alertSoundEnabled: boolean;
}

/**
 * Service to handle region alert sounds with different levels.
 * Each alert level has a different sound file and volume.
 */
@Injectable({ providedIn: 'root' })
export class RegionAlertSoundService {
  private audioElements = new Map<AlertLevel, HTMLAudioElement>();
  private globalMuted = false;
  
  // Map alert levels to sound files
  private soundFiles: Record<AlertLevel, string> = {
    low: 'assets/sounds/alert_low.mp3',
    medium: 'assets/sounds/alert_medium.mp3',
    high: 'assets/sounds/alert_high.mp3'
  };

  // Map alert levels to volumes
  private volumes: Record<AlertLevel, number> = {
    low: 0.4,
    medium: 0.7,
    high: 1.0
  };

  // Throttle mechanism to prevent spam
  private lastPlayTime = 0;
  private throttleMs = 2000; // 2 seconds minimum between plays

  constructor() {
    // Pre-load audio elements
    this.preloadAudio();
  }

  /**
   * Pre-load all audio files
   */
  private preloadAudio() {
    Object.entries(this.soundFiles).forEach(([level, src]) => {
      const audio = new Audio();
      audio.src = src;
      audio.preload = 'auto';
      audio.volume = this.volumes[level as AlertLevel];
      this.audioElements.set(level as AlertLevel, audio);
    });
  }

  /**
   * Play an alert sound based on the alert level
   */
  public async playAlert(level: AlertLevel): Promise<void> {
    // Check global mute
    if (this.globalMuted) {
      console.log('Alert sound muted globally');
      return;
    }

    // Check throttle
    const now = Date.now();
    if (now - this.lastPlayTime < this.throttleMs) {
      console.log('Alert sound throttled');
      return;
    }
    this.lastPlayTime = now;

    const audio = this.audioElements.get(level);
    if (!audio) {
      console.warn(`No audio element found for level: ${level}`);
      return;
    }

    try {
      // Reset audio to start
      audio.currentTime = 0;
      await audio.play();
      console.log(`Playing ${level} alert sound`);
    } catch (error) {
      console.error('Error playing alert sound:', error);
      // Try vibration as fallback
      this.tryVibrate(level);
    }
  }

  /**
   * Try to vibrate as fallback when audio is not available
   */
  private tryVibrate(level: AlertLevel) {
    if ('vibrate' in navigator) {
      const patterns: Record<AlertLevel, number[]> = {
        low: [100],
        medium: [200, 100, 200],
        high: [300, 100, 300, 100, 300]
      };
      try {
        navigator.vibrate(patterns[level]);
      } catch (e) {
        // Vibration not supported or failed
      }
    }
  }

  /**
   * Set global mute state
   */
  public setGlobalMute(muted: boolean) {
    this.globalMuted = muted;
    console.log(`Global alert sound mute: ${muted}`);
  }

  /**
   * Get global mute state
   */
  public isGlobalMuted(): boolean {
    return this.globalMuted;
  }

  /**
   * Map color to alert level for backward compatibility
   */
  public static colorToAlertLevel(color: string): AlertLevel {
    if (!color) return 'medium';
    
    const normalized = color.toLowerCase().replace(/\s/g, '');
    
    // Check for green/vert
    if (normalized.includes('green') || normalized.includes('vert') || 
        normalized.startsWith('#0') || normalized.startsWith('#00ff') || 
        normalized.startsWith('#0f0') || normalized.startsWith('#00f')) {
      return 'low';
    }
    
    // Check for red/rouge
    if (normalized.includes('red') || normalized.includes('rouge') || 
        normalized.startsWith('#f') || normalized.startsWith('#ff0000') || 
        normalized.startsWith('#f00')) {
      return 'high';
    }
    
    // Check for orange
    if (normalized.includes('orange') || 
        normalized.startsWith('#ff8') || normalized.startsWith('#ffa') || 
        normalized.startsWith('#f80') || normalized.startsWith('#fa0')) {
      return 'medium';
    }

    // Parse hex colors more accurately
    if (normalized.startsWith('#')) {
      const hex = normalized.slice(1, 7);
      if (hex.length >= 6) {
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        // Green dominant
        if (g > r && g > b && g > 150) {
          return 'low';
        }
        // Red dominant
        if (r > g && r > b && r > 150) {
          return 'high';
        }
        // Orange (red and green, low blue)
        if (r > 150 && g > 100 && g < 200 && b < 100) {
          return 'medium';
        }
      }
    }
    
    // Default to medium
    return 'medium';
  }

  /**
   * Update custom sound files (for future extensibility)
   */
  public updateSoundFile(level: AlertLevel, url: string) {
    this.soundFiles[level] = url;
    const audio = new Audio();
    audio.src = url;
    audio.preload = 'auto';
    audio.volume = this.volumes[level];
    this.audioElements.set(level, audio);
  }
}
