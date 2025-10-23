import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { AppFacade } from 'src/app/app.facade';
import { SignalKClient } from 'signalk-client-angular';
import { AlertData } from './components/alert.component';

/**
 * NotificationManager
 *
 * - Raise alarms on server (POST /signalk/v2/api/alarms/:type)
 * - Fallback to creating a local alert if server does not support the endpoint (404)
 * - Maintain a local alertMap of active alerts
 * - Emit changes so UI can update
 * - Play alert sound and show persistent desktop Notification while the alert remains active
 */
@Injectable({ providedIn: 'root' })
export class NotificationManager {
  // Internal storage of alerts (key -> AlertData)
  private alertMap = new Map<string, AlertData>();

  // Exposed observable for consumers (if needed)
  private alertsSubject = new BehaviorSubject<Array<[string, AlertData]>>([]);
  public alerts$ = this.alertsSubject.asObservable();

  // Audio element for alert sound
  private audio: HTMLAudioElement;

  constructor(
    private app: AppFacade,
    private signalk: SignalKClient,
    private bottomSheet: MatBottomSheet
  ) {
    // Prepare audio element
    this.audio = new Audio();
    this.audio.src = 'assets/sounds/ding.mp3';
    this.audio.preload = 'auto';
    this.audio.load();

    // Attempt to "unlock" audio on first user interaction so play() won't be blocked by autoplay policy
    try {
      document.addEventListener(
        'click',
        () => {
          try {
            const t = this.audio;
            const prevVolume = t.volume;
            t.volume = 0;
            t
              .play()
              .then(() => {
                t.pause();
                t.currentTime = 0;
                t.volume = prevVolume ?? 1;
              })
              .catch(() => {
                t.volume = prevVolume ?? 1;
              });
          } catch (e) {
            // ignore
          }
        },
        { once: true }
      );
    } catch (e) {
      // ignore in non-browser environments
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

  private playAlertSound() {
    try {
      if (!this.audio) return;
      this.audio.currentTime = 0;
      this.audio
        .play()
        .then(() => {
          // played
        })
        .catch((err) => {
          console.warn('Could not play alert sound (maybe autoplay blocked):', err);
        });
    } catch (error) {
      console.error('Error playing alert sound:', error);
    }
  }

  private addLocalAlert(path: string, alert: AlertData) {
    this.alertMap.set(path, alert);
    this.emitSignals();

    try {
      if (this.app.config?.notifications?.sound && alert.sound !== false) {
        this.playAlertSound();
      }
    } catch (e) {
      // ignore
    }
  }

  private removeLocalAlert(path: string) {
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
              priority: (serverResp?.priority ?? 2) as any,
              message: serverResp?.message || message || '',
              sound: true,
              visual: true,
              properties: serverResp?.properties || {},
              icon: serverResp?.icon || { svgIcon: 'alarm' },
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
              priority: 2 as any,
              message: message ?? '',
              sound: true,
              visual: true,
              properties: {},
              icon: { svgIcon: 'alarm' } as any,
              type: alarmType,
              acknowledged: false,
              silenced: false,
              canAcknowledge: false,
              // cannot cancel on server; clear() will remove locally
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
    this.alertMap.clear();
    this.emitSignals();
  }

  /**
   * Exposed helper used by templates (fb-map uses notiMgr.mobAlerts())
   * Return list of alerts filtered to mob alarms (array of [path, AlertData])
   */
  public mobAlerts(): Array<[string, AlertData]> {
    return this.alerts().filter(([_, a]) => (a.type ?? '').toLowerCase() === 'mob');
  }

  /**
   * Open bottom sheet showing alert details (used by app.component and templates)
   */
  public showAlertInfo(path: string) {
      // Si l'alerte n'existe pas, afficher un message simple
      if (!this.alertMap.has(path)) {
        this.app.showAlert('Alert', 'Alert not found!');
        return;
      }
      const alert = this.alertMap.get(path);

      // Tentative d'ouvrir un bottom sheet si le modal est disponible au runtime
      try {
        // On essaye d'obtenir le composant par nom dynamiquement (best-effort)
        // Remarque : si tu connais le bon composant/modal, remplace ce bloc par:
        // this.bottomSheet.open(TheCorrectModalComponent, { data: { alert } });
        const maybeModal: any = (this as any).__AlertPropertiesModal || null;
        if (maybeModal && typeof maybeModal === 'function') {
          this.bottomSheet.open(maybeModal, { data: { alert } });
          return;
        }
      } catch (e) {
        // ignore et fallback vers app.showAlert
      }

      // Fallback : afficher une boîte d'alerte simple avec le message et quelques props
      const body = `${alert.message ?? ''}\n\nProperties: ${JSON.stringify(alert.properties ?? {}, null, 2)}`;
      this.app.showAlert(`Alert: ${alert.type ?? 'unknown'}`, body);
    }
  }