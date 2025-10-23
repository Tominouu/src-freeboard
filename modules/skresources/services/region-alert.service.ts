import { Injectable } from '@angular/core';
import { AppFacade } from 'src/app/app.facade';
import { SKResourceService } from '..';
import { NotificationManager } from '../../alarms';
import { CustomRegionsService } from './custom-regions.service';
import { Position } from 'geojson';
import { point, polygon, booleanPointInPolygon } from '@turf/turf';
import { Subscription } from 'rxjs';

interface RegionAlertState {
  regionId: string;
  isInside: boolean;
  hasAlerted: boolean;
}

@Injectable({ providedIn: 'root' })
export class RegionAlertService {
  private regionStates = new Map<string, RegionAlertState>();
  private audio: HTMLAudioElement;

  // cache des resourceSets zones_alert (format : [id, resourceObj, true])
  private customRegionsCache: any[] = [];
  private customRegionsSub: Subscription | null = null;

  constructor(
    private app: AppFacade,
    private skres: SKResourceService,
    private notiMgr: NotificationManager,
    private customRegionsService: CustomRegionsService
  ) {
    this.audio = new Audio();
    this.audio.src = 'assets/sounds/alert.mp3';

    // Charger les resourceSets custom dès que possible (non bloquant)
    try {
      this.loadCustomRegions();
    } catch (e) {
      console.warn('RegionAlertService: loadCustomRegions failed to start', e);
    }
  }

  /**
   * Charge et met en cache les resourceSets stockés sous /signalk/v2/api/resources/zones_alert
   * Nous utilisons subscribe pour ne pas bloquer le constructeur (observables).
   */
  private loadCustomRegions() {
    // désabonner si on avait une subscription précédente
    if (this.customRegionsSub) {
      this.customRegionsSub.unsubscribe();
      this.customRegionsSub = null;
    }

    this.customRegionsSub = this.customRegionsService.listCustomRegions().subscribe({
      next: (res: any) => {
        this.customRegionsCache = [];

        // L'API peut renvoyer soit un tableau, soit un objet map — on gère les deux
        if (Array.isArray(res)) {
          res.forEach((r: any) => {
            const id = r && (r.id || r.name) ? (r.id || r.name) : JSON.stringify(r).slice(0, 24);
            this.customRegionsCache.push([id, r, true]);
          });
        } else if (res && typeof res === 'object') {
          // si res est un map / object dont les valeurs sont des resourceSets
          for (const [k, v] of Object.entries(res)) {
            const val: any = v; // cast pour éviter erreurs TS (valeurs dynamiques)
            const id = val && (val.id || val.name) ? (val.id || val.name) : k;
            this.customRegionsCache.push([id, val, true]);
          }
        } else {
          console.warn('CustomRegionsService.listCustomRegions() returned unexpected value:', res);
        }
        console.log(`loadCustomRegions: ${this.customRegionsCache.length} custom region(s) loaded.`);
      },
      error: (err) => {
        console.warn('Error loading custom regions (zones_alert):', err);
      }
    });
  }

  checkRegionAlerts(vesselPosition: Position) {
    if (!vesselPosition || !Array.isArray(vesselPosition) || vesselPosition.length < 2) {
      console.warn('checkRegionAlerts: position non valide', vesselPosition);
      return;
    }

    // Normaliser la position pour Turf : Turf attend [lon, lat].
    const normalizedPos = this.normalizePosition(vesselPosition);
    const vesselPoint = point(normalizedPos);

    // Récupérer les régions via skres.regions() si disponible
    let regionsArray: any[] = [];
    try {
      const maybe = (this.skres && typeof (this.skres as any).regions === 'function') ? (this.skres as any).regions() : null;
      if (Array.isArray(maybe)) {
        regionsArray = maybe;
      } else if (maybe && typeof maybe === 'object') {
        try {
          regionsArray = Array.from(Object.entries(maybe));
        } catch {
          regionsArray = [];
        }
      }
    } catch (err) {
      console.warn('Erreur en appelant skres.regions():', err);
      regionsArray = [];
    }

    // Si aucune région retournée via skres, tenter d'utiliser le cache des custom regions
    if (!regionsArray || regionsArray.length === 0) {
      if (this.customRegionsCache && this.customRegionsCache.length > 0) {
        regionsArray = regionsArray.concat(this.customRegionsCache);
        console.log(`Utilisation du cache customRegions: ${this.customRegionsCache.length} région(s)`);
      } else {
        // forcer un rechargement asynchrone si on n'a rien en cache (ne bloque pas la fonction)
        console.log('Aucune région trouvée via skres.regions(). Recherche via API zones_alert (loadCustomRegions déclenché)...');
        this.loadCustomRegions();
      }
    }

    console.log(`Étape 2: Vérification de ${regionsArray.length} région(s)`);

    regionsArray.forEach((entry: any, idx: number) => {
      let regionId: string | undefined;
      let regionObj: any;

      if (Array.isArray(entry)) {
        regionId = entry[0];
        regionObj = entry[1];
      } else if (entry && typeof entry === 'object') {
        regionId = (entry as any).id || (entry as any).regionId || (entry as any).resource?.id;
        regionObj = (entry as any).region || (entry as any).resource || entry;
      } else {
        console.warn('Entrée région inattendue (ignorée) :', entry);
        return;
      }

      if (!regionId) {
        regionId = (regionObj && ((regionObj as any).id || (regionObj as any).name)) ? ((regionObj as any).id || (regionObj as any).name) : `unknown-${idx}`;
      }

      const extracted = this.extractFeatureAndProps(regionObj);
      const feature = extracted.feature;
      const properties = extracted.properties;
      const regionName = extracted.name || `region-${regionId}`;

      if (!feature) {
        console.log(`Ignorée: région '${regionName}' (${regionId}) sans feature détectable.`);
        return;
      }

      console.log(`Étape 3: Région '${regionName}' -> alertEnabled: ${Boolean(properties?.alertEnabled)}`);

      if (!properties?.alertEnabled) {
        return;
      }

      const coords = feature.geometry?.coordinates;
      if (!coords) {
        console.warn(`Région '${regionName}' (${regionId}) sans coordonnées (feature) — contenu:`, feature);
        return;
      }

      let isInside = false;
      try {
        const geomType = feature.geometry?.type;

        // helper: inverse [lat,lon] -> [lon,lat] pour une liste de positions
        const swapPosition = (pos: any[]) => [Number(pos[1]), Number(pos[0])];

        // helper: swap un tableau de positions (et gère nesting pour MultiPolygon)
        const swapCoords = (coords: any): any => {
            if (!coords) return coords;
            // Polygon: coords = [ [ [x,y], [x,y], ... ] ]
            if (Array.isArray(coords) && coords.length && Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
            // Polygon or MultiPolygon depending on depth
            // Detect depth: Polygon depth 3 (ring array), MultiPolygon depth 4 (array of polygons)
            const depth = (() => {
                let d = 0;
                let cur: any = coords;
                while (Array.isArray(cur)) { d++; cur = cur[0]; if (d > 6) break; }
                return d;
            })();

            if (depth === 3) {
                // Polygon: array of rings, each ring is array of positions
                return (coords as any[]).map((ring: any[]) => ring.map((p: any[]) => swapPosition(p)));
            } else if (depth >= 4) {
                // MultiPolygon: array of polygons -> map polygons -> rings -> positions
                return (coords as any[]).map((poly: any[]) =>
                poly.map((ring: any[]) => ring.map((p: any[]) => swapPosition(p)))
                );
            }
            }
            // fallback: try map at lower depth
            try {
            return coords.map((c: any) => swapCoords(c));
            } catch {
            return coords;
            }
        };

        const testPointIn = (polyCoords: any, type: string) => {
            if (type === 'Polygon') {
            const poly = polygon(polyCoords as any);
            return booleanPointInPolygon(vesselPoint, poly);
            } else if (type === 'MultiPolygon') {
            for (const polyCoordsPart of polyCoords as any[]) {
                const poly = polygon(polyCoordsPart);
                if (booleanPointInPolygon(vesselPoint, poly)) {
                return true;
                }
            }
            return false;
            }
            return false;
        };

        if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
            // debug log : affiche brièvement la géométrie et la position du bateau
            console.debug(`Debug region geometry sample:`, feature.geometry?.type, feature.geometry?.coordinates?.[0]?.slice?.(0,2) || feature.geometry?.coordinates);
            console.debug(`Debug vessel position (normalized):`, normalizedPos);

            // test with original coords
            isInside = testPointIn(coords, geomType);
            if (!isInside) {
            // try swapped coords (in case polygon coords are saved [lat,lon])
            try {
                const swapped = swapCoords(coords);
                const swappedResult = testPointIn(swapped, geomType);
                if (swappedResult) {
                console.warn(`Coordinate order mismatch detected for region '${regionName}'. Using swapped polygon coordinates for detection. Consider fixing stored resource coordinates.`);
                isInside = true;
                // optionally: replace coords variable so subsequent logic uses swapped geometry
                // feature.geometry.coordinates = swapped;
                }
            } catch (swapErr) {
                console.error('Error while trying swapped coords for region', regionName, swapErr);
            }
            }
        } else {
            console.warn(`Type de géométrie non géré pour la région '${regionName}':`, geomType);
        }
        } catch (error) {
        console.error(`Error checking region ${regionId}:`, error, feature);
        }

      console.log(`Étape 4: Région '${regionName}' -> isInside: ${isInside}`);

      this.handleRegionAlert(regionId, regionName, isInside);
    });
  }

  /**
   * Nouvelle version robuste : recherche récursive d'une feature/geometry dans l'objet fourni.
   * Retourne le premier objet Feature-like trouvé et des properties / name associés.
   */
  private extractFeatureAndProps(regionObj: any): { feature?: any; properties?: any; name?: string } {
    if (!regionObj) return {};

    // helper pour détecter si un node est une GeoJSON Feature-like avec geometry
    const isFeatureLike = (node: any) =>
      node && node.geometry && node.geometry.type && Array.isArray(node.geometry.coordinates);

    // helper DFS limité pour trouver une feature-like
    const findFeatureRecursive = (node: any, depth = 0, visited = new Set<any>()): any | null => {
      if (!node || depth > 6) return null;
      if (visited.has(node)) return null;
      visited.add(node);

      // Si node lui-même est une Feature-like
      if (isFeatureLike(node)) return node;

      // Si node.feature est une Feature-like
      if (isFeatureLike(node.feature)) return node.feature;

      // Si node.resource.feature est une Feature-like
      if (node.resource && isFeatureLike(node.resource.feature)) return node.resource.feature;

      // Si node.resources est un tableau, inspecter les éléments
      if (Array.isArray(node.resources) && node.resources.length > 0) {
        for (const r of node.resources) {
          // cas r.feature, r.resource.feature, r.geometry direct
          if (isFeatureLike(r)) return r;
          if (isFeatureLike(r.feature)) return r.feature;
          if (r.resource && isFeatureLike(r.resource.feature)) return r.resource.feature;
          // sinon tenter récursion sur les sous-objets
          const sub = findFeatureRecursive(r, depth + 1, visited);
          if (sub) return sub;
        }
      }

      // recherche dans les propriétés directes (wrapper)
      for (const key of Object.keys(node)) {
        try {
          const child = node[key];
          if (child && typeof child === 'object') {
            // évite trop d'itérations sur des tableaux non pertinents
            if (Array.isArray(child) && child.length > 50) continue;
            const res = findFeatureRecursive(child, depth + 1, visited);
            if (res) return res;
          }
        } catch (e) {
          // ignorer les accès problématiques
        }
      }

      return null;
    };

    // tenter d'extraire la feature
    const feature = findFeatureRecursive(regionObj);

    if (!feature) return {};

    // properties potentiels : privilégier feature.properties, sinon chercher up-level props
    const props = feature.properties ?? regionObj.properties ?? (regionObj.resource && regionObj.resource.properties) ?? {};
    const name =
      (regionObj && (regionObj.name || regionObj.title)) ||
      props.name ||
      (feature.properties && (feature.properties.name || feature.properties.title));

    return { feature, properties: props, name };
  }

  private normalizePosition(pos: Position): Position {
    const [a, b] = pos;
    const aNum = Number(a);
    const bNum = Number(b);
    const aIsLat = !Number.isNaN(aNum) && aNum >= -90 && aNum <= 90;
    const bIsLon = !Number.isNaN(bNum) && bNum >= -180 && bNum <= 180;
    const aIsLon = !Number.isNaN(aNum) && aNum >= -180 && aNum <= 180;
    const bIsLat = !Number.isNaN(bNum) && bNum >= -90 && bNum <= 90;

    if (aIsLat && bIsLon && !(aIsLon && bIsLat)) {
      console.warn('Position fournie semble être [lat, lon]. Inversion automatique en [lon, lat] pour Turf.');
      return [bNum, aNum];
    }
    return [aNum, bNum];
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

    if ((this.app as any).config?.notifications?.sound) {
      this.playAlertSound();
    }

    if ('Notification' in window && (Notification as any).permission === 'granted') {
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