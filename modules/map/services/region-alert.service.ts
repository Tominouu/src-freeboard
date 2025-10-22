import { Injectable } from '@angular/core';
import { point, polygon, booleanPointInPolygon } from '@turf/turf';
import { Position } from 'src/app/types';

interface RegionAlertState {
  regionId: string;
  isInside: boolean;
  hasAlerted: boolean;
}

@Injectable({ providedIn: 'root' })
export class RegionAlertService {
  private regionStates = new Map<string, RegionAlertState>();

  isPointInRegion(vesselPos: Position, regionCoords: any, geometryType: string): boolean {
    try {
      const vesselPoint = point(vesselPos);

      if (geometryType === 'Polygon') {
        const poly = polygon(regionCoords);
        return booleanPointInPolygon(vesselPoint, poly);
      } else if (geometryType === 'MultiPolygon') {
        for (const polyCoords of regionCoords) {
          const poly = polygon(polyCoords);
          if (booleanPointInPolygon(vesselPoint, poly)) {
            return true;
          }
        }
      }
      return false;
    } catch (error) {
      console.error('Error checking point in region:', error);
      return false;
    }
  }

  getRegionState(regionId: string): RegionAlertState {
    return this.regionStates.get(regionId) || {
      regionId,
      isInside: false,
      hasAlerted: false
    };
  }

  updateRegionState(regionId: string, isInside: boolean, hasAlerted: boolean) {
    this.regionStates.set(regionId, {
      regionId,
      isInside,
      hasAlerted
    });
  }

  clearRegionState(regionId: string) {
    this.regionStates.delete(regionId);
  }

  reset() {
    this.regionStates.clear();
  }
}
