import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { AppFacade } from 'src/app/app.facade';
import { SignalKClient } from 'signalk-client-angular';
import { AlertData } from './components/alert.component';
import { AlertPropertiesModal } from './components/alert-properties-modal';

/**
 * NotificationManager
 *
 * - Raise alarms on server (POST /signalk/v2/api/alarms/:type)
 * - Fallback to creating a local alert if server does not support the endpoint (404)
 * - Maintain a local alertMap of active alerts
 * - Emit changes so UI can update
 * - Play alert sound and show persistent desktop Notification while the alert remains active
 *
 * Sound behaviour (robuste) :
 * - On addLocalAlert => try HTMLAudio.play() with loop=true
 * - If play() rejected, fallback to WebAudio oscillator (loop-like) using app.audio.context
 * - Expose unlockAudio() to be called by a user gesture (button) to resume AudioContext and allow playback
 * - stopAlertSound() stops both HTMLAudio and WebAudio fallback
 */

@Injectable({ providedIn: 'root' })
export class NotificationManager {
  // Internal storage of alerts (key -> AlertData)
  private alertMap = new Map<string, AlertData>();

  // Exposed observable for consumers (if needed)
  private alertsSubject = new BehaviorSubject<Array<[string, AlertData]>>([]);
  public alerts$ = this.alertsSubject.asObservable();

  // HTMLAudio element for simple playback
  private audio: HTMLAudioElement | null = null;
  // WebAudio fallback nodes
  private webAudioOsc?: OscillatorNode | null;
  private webAudioGain?: GainNode | null;
  private webAudioIsActive = false;

  // flag to know whether we attempted unlocking
  private attemptedUnlock = false;

  constructor(
    private app: AppFacade,
    private signalk: SignalKClient,
    private bottomSheet: MatBottomSheet
  ) {
    // Prepare audio element if running in browser
    try {
      this.audio = new Audio();
      this.audio.src = 'assets/sounds/woop.mp3';
      this.audio.preload = 'auto';
      // Do not call load() repeatedly on some environments; allow browser to manage
      this.audio.load();
    } catch (e) {
      this.audio = null;
    }

    // Best-effort: try to unlock audio on first user interaction
    try {
      document.addEventListener(
        'click',
        () => {
          this.unlockAudio().catch(() => {
            /* ignore */
          });
        },
        { once: true }
      );
    } catch (e) {
      // not in browser or blocked
    }
  }

  // Return alerts as array of [path, AlertData]
  public alerts(): Array<[string, AlertData]> {
    return Array.from(this.alertMap.entries());
  }

  private emitSignals() {
    try {
      this.alertsSubject.next(this.alerts());
    } catch (e) {
      console.warn('NotificationManager.emitSignals error', e);
    }
  }

  /**
   * Try to play alert sound. This method is defensive:
   *  - prefer HTMLAudio (loop)
   *  - if .play() rejected (autoplay), fallback to WebAudio oscillator
   */
  private async playAlertSound() {
    // if no sound globally configured, skip
    try {
      if (!this.app.config?.notifications?.sound) return;
    } catch (e) {
      // ignore config access errors
    }

    // Try HTMLAudio first
    if (this.audio) {
      try {
        this.audio.loop = true;
        this.audio.currentTime = 0;
        await this.audio.play();
        // success
        this.webAudioIsActive = false;
        return;
      } catch (err) {
        // html audio blocked or error -> fallback to WebAudio
        console.warn('HTMLAudio play() failed, falling back to WebAudio oscillator:', err);
      }
    }

    // Fallback: WebAudio oscillator
    try {
      const ctx: any = (this.app as any).audio?.context;
      if (!ctx) {
        console.warn('No WebAudio context available for fallback');
        return;
      }
      // resume context if needed
      if (ctx.state !== 'running' && typeof ctx.resume === 'function') {
        try {
          await ctx.resume();
        } catch (e) {
          console.warn('WebAudio context resume failed:', e);
        }
      }

      // create nodes only if not already active
      if (this.webAudioIsActive) {
        return;
      }

      this.webAudioGain = ctx.createGain();
      this.webAudioGain.gain.value = 0.05; // reasonable default volume, adjust if needed
      this.webAudioGain.connect(ctx.destination);

      this.webAudioOsc = ctx.createOscillator();
      this.webAudioOsc.type = 'sine';
      this.webAudioOsc.frequency.value = 440; // A4
      this.webAudioOsc.connect(this.webAudioGain);
      // start oscillator
      if (typeof this.webAudioOsc.start === 'function') {
        this.webAudioOsc.start();
      }
      this.webAudioIsActive = true;
    } catch (e) {
      console.error('WebAudio fallback failed:', e);
    }
  }

  /**
   * Stop any playing alert sound (both HTMLAudio and WebAudio fallback).
   */
  private stopAlertSound() {
    // stop HTMLAudio
    try {
      if (this.audio) {
        try {
          this.audio.loop = false;
          this.audio.pause();
          this.audio.currentTime = 0;
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // ignore
    }

    // stop WebAudio oscillator
    try {
      if (this.webAudioOsc) {
        try {
          if (typeof this.webAudioOsc.stop === 'function') {
            this.webAudioOsc.stop();
          }
        } catch (e) {
          // ignore
        }
        try {
          this.webAudioOsc.disconnect();
        } catch {}
        this.webAudioOsc = null;
      }
      if (this.webAudioGain) {
        try {
          this.webAudioGain.disconnect();
        } catch {}
        this.webAudioGain = null;
      }
      this.webAudioIsActive = false;
    } catch (e) {
      // ignore
    }
  }

  /**
   * Public helper to "unlock" audio using a user gesture.
   * Call this from a click handler (button) to increase chance playback is allowed.
   */
  public async unlockAudio(): Promise<void> {
    if (this.attemptedUnlock) return;
    this.attemptedUnlock = true;

    // Resume WebAudio context if exists
    try {
      const ctx: any = (this.app as any).audio?.context;
      if (ctx && typeof ctx.resume === 'function') {
        try {
          await ctx.resume();
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // ignore
    }

    // Try to play a muted short sound via HTMLAudio to unlock autoplay
    if (this.audio) {
      try {
        const prevVolume = this.audio.volume;
        this.audio.volume = 0;
        await this.audio.play();
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.volume = prevVolume;
      } catch (e) {
        // ignore
      }
    }

    // Also try to create and stop a tiny oscillator to unlock webaudio
    try {
      const ctx: any = (this.app as any).audio?.context;
      if (ctx && ctx.state !== 'running' && typeof ctx.resume === 'function') {
        try {
          await ctx.resume();
        } catch {}
      }
      if (ctx && typeof ctx.createOscillator === 'function') {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0;
        osc.connect(g);
        g.connect(ctx.destination);
        try {
          osc.start();
          osc.stop();
        } catch {}
      }
    } catch (e) {
      // ignore
    }
  }

  private addLocalAlert(path: string, alert: AlertData) {
    this.alertMap.set(path, alert);
    this.emitSignals();

    // Play sound (loop) and show desktop notification if allowed
    try {
      if (this.app.config?.notifications?.sound && alert.sound !== false) {
        // try play; playAlertSound handles fallback
        this.playAlertSound().catch(() => {
          // ignore
        });
      }
    } catch (e) {
      // ignore
    }
  }

  private removeLocalAlert(path: string) {
    // stop sound associated with alerts; if multiple alerts require sound,
    // you may want to track refcounts — here we stop sound on any removal.
    this.stopAlertSound();

    this.alertMap.delete(path);
    this.emitSignals();
  }

  /**
   * Raise Alarm on server.
   * If the server responds 404 (endpoint not supported for this alarm type),
   * create a local fallback alert so the UI still shows it and behavior is consistent.
   */
  public raiseServerAlarm(alarmType: string, message?: string) {
    this.signalk.api
      .post(this.app.skApiVersion, `alarms/${alarmType}`, {
        message: message ?? ''
      })
      .subscribe(
        (serverResp: any) => {
          try {
            const id =
              (serverResp && (serverResp.id || serverResp.path || serverResp._id)) ||
              `${alarmType}.${Date.now()}`;
            const path = serverResp?.path || `${alarmType}.${id}`;
            const now = Date.now();
            const alert: AlertData = {
              path,
              priority: (serverResp?.priority ?? (2 as any)) as any,
              message: serverResp?.message || message || '',
              sound: true,
              visual: true,
              properties: serverResp?.properties || {},
              icon: serverResp?.icon || ({ svgIcon: 'alarm' } as any),
              type: alarmType,
              acknowledged: false,
              silenced: false,
              canAcknowledge: serverResp?.canAcknowledge ?? false,
              canCancel: serverResp?.canCancel ?? true,
              createdAt: serverResp?.createdAt || now
            };

            this.addLocalAlert(alert.path, alert);
          } catch (e) {
            console.warn('raiseServerAlarm: error processing server response', e);
          }
        },
        (err: HttpErrorResponse) => {
          if (err && err.status === 404) {
            console.warn(
              `Server alarm endpoint for '${alarmType}' not found — creating local fallback alert`
            );

            const now = Date.now();
            const id = `${alarmType}.${now}`;
            const fallbackAlert: AlertData = {
              path: id,
              priority: (2 as any) as any,
              message: message ?? '',
              sound: true,
              visual: true,
              properties: {},
              icon: ({ svgIcon: 'alarm' } as any),
              type: alarmType,
              acknowledged: false,
              silenced: false,
              canAcknowledge: false,
              canCancel: false,
              createdAt: now
            };

            this.addLocalAlert(fallbackAlert.path, fallbackAlert);
            return;
          }

          this.app.showAlert(
            'Error',
            `Unable to raise alarm: ${alarmType} \n ${err?.message ?? String(err)}`
          );
        }
      );
  }

  public cancelServerAlarm(alert: AlertData) {
    const id = alert.path.split('.').slice(-1)[0];
    return this.signalk.api.delete(this.app.skApiVersion, `alarms/${alert.type}/${id}`);
  }

  public silence(path: string) {
    if (!this.alertMap.has(path)) return;
    const alert = this.alertMap.get(path);

    if (this.isStandardAlarm(alert.type)) {
      const id = alert.path.split('.').slice(-1)[0];
      this.signalk.api
        .post(this.app.skApiVersion, `alarms/${alert.type}/${id}/silence`, {})
        .subscribe(
          () => {
            const a = { ...alert, silenced: true };
            this.alertMap.set(path, a);
            this.emitSignals();
          },
          (err: HttpErrorResponse) => {
            this.app.showAlert('Error', `Unable to silence alarm (${path})!\n${err?.message ?? String(err)}`);
          }
        );
    } else {
      const a = { ...alert, silenced: true };
      this.alertMap.set(path, a);
      this.emitSignals();
    }
  }

  public clear(path: string) {
    if (!this.alertMap.has(path)) return;
    const alert = this.alertMap.get(path);

    if (alert.canCancel && this.isStandardAlarm(alert.type)) {
      this.cancelServerAlarm(alert).subscribe(
        () => {
          this.removeLocalAlert(path);
        },
        (err: HttpErrorResponse) => {
          this.app.showAlert('Error', `Unable to clear alarm (${path})!\n${err?.message ?? String(err)}`);
        }
      );
    } else {
      this.removeLocalAlert(path);
    }
  }

  private isStandardAlarm(value: string): boolean {
    return [
      'mob',
      'sinking',
      'fire',
      'piracy',
      'flooding',
      'collision',
      'grounding',
      'listing',
      'adrift',
      'abandon',
      'aground'
    ].includes(value);
  }

  public getAlert(path: string): AlertData | undefined {
    return this.alertMap.get(path);
  }

  public acknowledge(path: string) {
    if (this.alertMap.has(path)) {
      const a = { ...this.alertMap.get(path), acknowledged: true };
      this.alertMap.set(path, a);
      this.emitSignals();
    }
  }

  public reset() {
    // stop any sound
    this.stopAlertSound();
    this.alertMap.clear();
    this.emitSignals();
  }

  public mobAlerts(): Array<[string, AlertData]> {
    return this.alerts().filter(([_, a]) => (a.type ?? '').toLowerCase() === 'mob');
  }

  /**
   * Open bottom sheet showing alert details (used by app.component and templates)
   */
  public showAlertInfo(path: string) {
    if (!this.alertMap.has(path)) {
      this.app.showAlert('Alert', 'Alert not found!');
      return;
    }
    const alert = this.alertMap.get(path);
    try {
      this.bottomSheet.open(AlertPropertiesModal, {
        data: { alert }
      });
    } catch (e) {
      // fallback
      this.app.showAlert(`Alert: ${alert.type ?? 'unknown'}`, `${alert.message}\n\nProperties: ${JSON.stringify(alert.properties ?? {}, null, 2)}`);
    }
  }

  /**
   * Expose helper so other services (RegionAlertService) can programmatically add a local alert.
   * It wraps addLocalAlert (which is private) to keep internal consistency.
   */
  public createLocalAlert(path: string, alert: AlertData) {
    this.addLocalAlert(path, alert);
  }

  /**
   * Expose helper so that RegionAlertService (or UI) can stop any playing sound immediately.
   */
  public stopSoundImmediately() {
    this.stopAlertSound();
  }
}