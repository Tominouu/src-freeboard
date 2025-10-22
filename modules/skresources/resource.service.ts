import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import {
  SKResource,
  SKRoute,
  SKWaypoint,
  SKNote,
  SKRegion,
  SKVessel,
  SKAtoN,
  SKAircraft,
  SKSaR,
  SKMeteo
} from './resource.model';
import { AppFacade } from 'src/app/app.facade';
import { Convert } from 'src/app/lib/convert';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class SKResourceService {
  constructor(protected appFacade: AppFacade, protected http: HttpClient) {}

  // ** region resources
  fromCache(type: 'regions', id: string): [string, SKRegion];
  fromCache(type: 'routes', id: string): [string, SKRoute];
  fromCache(type: 'waypoints', id: string): [string, SKWaypoint];
  fromCache(type: 'notes', id: string): [string, SKNote];
  fromCache(type: 'vessels', id: string): [string, SKVessel];
  fromCache(type: 'atons', id: string): [string, SKAtoN];
  fromCache(type: 'aircraft', id: string): [string, SKAircraft];
  fromCache(type: 'sar', id: string): [string, SKSaR];
  fromCache(type: 'meteo', id: string): [string, SKMeteo];
  fromCache(type: string, id: string): [string, SKResource] {
    const cacheKey = `${type}.${id}`;
    const resource = this.appFacade.resourceCache.get(cacheKey);
    return resource ? [cacheKey, resource] : null;
  }

  /**
   * Update region alert status
   */
  updateRegionAlertStatus(regionId: string, enabled: boolean): Observable<any> {
    const region = this.fromCache('regions', regionId);
    if (!region) {
      return throwError(() => new Error('Region not found'));
    }

    // Mettre à jour les properties
    if (!region[1].feature.properties) {
      region[1].feature.properties = {};
    }
    region[1].feature.properties.alertEnabled = enabled;

    // Sauvegarder sur le serveur
    return this.updateRegion(regionId, region[1]);
  }

  // ** other methods ...
}