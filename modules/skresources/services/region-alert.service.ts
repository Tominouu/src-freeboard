import { Injectable } from '@angular/core';
import { AppFacade } from 'src/app/app.facade';
import { SKResourceService } from './resource.service';
import { NotificationManager } from '../../notifications';
import { Position } from 'src/app/types';
import { point, polygon, booleanPointInPolygon } from '@turf/turf';

interface RegionAlertState {
  regionId: string;
  isInside: boolean;
  hasAlerted: boolean;
}

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

    const regions = this.skres.getRegions();
    const vesselPoint = point(vesselPosition);

    regions.forEach(([regionId, region]) => {
      if (!region.feature?.properties?.alertEnabled) {
        return;
      }

      const coords = region.feature.geometry.coordinates;
      let isInside = false;

      try {
        if (region.feature.geometry.type === 'Polygon') {
          const poly = polygon(coords);
          isInside = booleanPointInPolygon(vesselPoint, poly);
        } else if (region.feature.geometry.type === 'MultiPolygon') {
          for (const polyCoords of coords) {
            const poly = polygon(polyCoords);
            if (booleanPointInPolygon(vesselPoint, poly)) {
              isInside = true;
              break;
            }
          }
        }
      } catch (error) {
        console.error('Error checking region:', error);
      }

      this.handleRegionAlert(regionId, region.name, isInside);
    });
  }

  private handleRegionAlert(regionId: string, regionName: string, isInside: boolean) {
    const state = this.regionStates.get(regionId) || {
      regionId,
      isInside: false,
      hasAlerted: false
    };

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
    const message = `Entering region: ${regionName}`;

    this.notiMgr.createAlert({
      id: `region.${regionId}`,
      message: message,
      state: 'alarm',
      visual: true,
      sound: true
    });

    if (this.app.config.notifications?.sound) {
      this.playAlertSound();
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Region Alert', {
        body: message,
        icon: 'assets/icon-512x512.png'
      });
    }
  }

  private clearAlert(regionId: string) {
    this.notiMgr.clearAlert(`region.${regionId}`);
  }

  private playAlertSound() {
    try {
      this.audio.currentTime = 0;
      this.audio.play().catch(err => {
        console.warn('Could not play alert sound:', err);
      });
    } catch (error) {
      console.error('Error playing alert sound:', error);
    }
  }

  reset() {
    this.regionStates.clear();
  }
}
