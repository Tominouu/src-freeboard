import { Injectable } from '@angular/core';
import { AppFacade } from 'src/app/app.facade';
import { SKResourceService, SKRegion } from '..'; // <- Garde cet import
import { NotificationManager } from '../../alarms';
import {
  Feature,
  Polygon,
  MultiPolygon,
  Position,
} from 'geojson';
import {
  point,
  polygon,
  booleanPointInPolygon,
} from '@turf/turf';

interface RegionAlertState {
  regionId: string;
  isInside: boolean;
  hasAlerted: boolean;
}

// J'enlève ton type FBRegionEntry, il n'est plus nécessaire

@Injectable({ providedIn: 'root' })
export class RegionAlertService {
  private regionStates = new Map<string, RegionAlertState>();
  private audio: HTMLAudioElement;

  constructor(
    private app: AppFacade,
    private skres: SKResourceService,
    private notiMgr: NotificationManager
  ) {
    this.audio = new Audio();
    this.audio.src = 'assets/sounds/alert.mp3';
  }

  checkRegionAlerts(vesselPosition: Position) {
    if (!vesselPosition || !Array.isArray(vesselPosition)) {
      return;
    }

    // ** LA CORRECTION EST ICI **
    // On force le type 'any[]' pour contourner le bug de typage de TypeScript
    const regionsArray: any[] = this.skres.regions();
    const vesselPoint = point(vesselPosition);

    // .length fonctionnera maintenant
    console.log(`Étape 2: Vérification de ${regionsArray.length} région(s)`);

    // La déstructuration fonctionnera aussi
    regionsArray.forEach(([regionId, region, isCustom]) => {
      
      const feature = region.feature; 
      
      if (!feature) {
        return;
      }

      const properties = (feature as any).properties ?? {};

      const regionName = region.name ?? 'Unnamed Region';

      console.log(`Étape 3: Région '${regionName}' -> alertEnabled: ${properties.alertEnabled}`);


      if (!properties.alertEnabled) {
        return; 
      }

      const coords = feature.geometry?.coordinates;
      if (!coords) {
        return;
      }

      let isInside = false;

      try {
        if (feature.geometry.type === 'Polygon') {
          const poly = polygon(coords as Position[][]);
          isInside = booleanPointInPolygon(vesselPoint, poly);

        } else if (feature.geometry.type === 'MultiPolygon') {
          for (const polyCoords of coords as Position[][][]) {
            const poly = polygon(polyCoords);
            if (booleanPointInPolygon(vesselPoint, poly)) {
              isInside = true;
              break;
            }
          }
        }
      } catch (error) {
        console.error(`Error checking region ${regionId}:`, error, feature);
      }
      
      console.log(`Étape 4: Région '${regionName}' -> isInside: ${isInside}`);

      this.handleRegionAlert(regionId, regionName, isInside);
    });
  }

  private handleRegionAlert(regionId: string, regionName: string, isInside: boolean) {
    const state =
      this.regionStates.get(regionId) || ({
        regionId,
        isInside: false,
        hasAlerted: false,
      } as RegionAlertState);

    if (isInside && !state.isInside) {
      this.triggerAlert(regionId, regionName);
      state.hasAlerted = true;
    } else if (!isInside && state.isInside && state.hasAlerted) {
      this.clearAlert(regionId);
      state.hasAlerted = false;
    }

    state.isInside = isInside;
    this.regionStates.set(regionId, state);
  }

  private triggerAlert(regionId: string, regionName: string) {
    console.log(`%cÉtape 5: !!! DÉCLENCHEMENT ALERTE POUR ${regionName} !!!`, 'color: red; font-size: 1.2em; font-weight: bold;');
    const message = `Entering region: ${regionName}`;

    this.notiMgr.raiseServerAlarm('region', message);

    if (this.app.config.notifications?.sound) {
      this.playAlertSound();
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Region Alert', {
        body: message,
        icon: 'assets/icon-512x512.png',
      });
    }
  }

  private clearAlert(regionId: string) {
    this.notiMgr.clear(`region.${regionId}`);
  }

  private playAlertSound() {
    try {
      this.audio.currentTime = 0;
      this.audio
        .play()
        .catch((err) => console.warn('Could not play alert sound:', err));
    } catch (error) {
      console.error('Error playing alert sound:', error);
    }
  }

  reset() {
    this.regionStates.clear();
  }
}