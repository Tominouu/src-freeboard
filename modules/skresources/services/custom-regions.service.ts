import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AppFacade } from 'src/app/app.facade';
 
@Injectable({
    providedIn: 'root'
 })
 export class CustomRegionsService {
    private readonly API_BASE = '/signalk/v2/api/resources';
    private readonly CUSTOM_PATH = 'zones_alert';
 
    constructor(private http: HttpClient, private appFacade: AppFacade) {}
 
    /**
     * Sauvegarde une région en tant que ResourceSet dans le dossier zones_alert
     */
    saveCustomRegion(id: string, resourceSet: any): Observable<any> {
      const url = `${this.API_BASE}/${this.CUSTOM_PATH}/${id}`;
      console.log('Saving to:', url);
      console.log('Data:', resourceSet);
      return this.http.put(url, resourceSet).pipe(
         tap(() => {
            // Tenter d'activer la couche zones_alert par défaut pour cet id
            try {
              const app: any = (this.appFacade as any);
              if (!app || !app.config) return;
              if (!app.config.selections) app.config.selections = {};
              if (!app.config.selections.resourceSets) app.config.selections.resourceSets = {};
              const path = this.CUSTOM_PATH;
              if (!Array.isArray(app.config.selections.resourceSets[path])) {
                 app.config.selections.resourceSets[path] = [];
              }
              if (!app.config.selections.resourceSets[path].includes(id)) {
                 app.config.selections.resourceSets[path].push(id);
                 if (typeof app.saveConfig === 'function') {
                    app.saveConfig();
                 }
              }
            } catch (e) {
              console.error('Impossible de mettre à jour la config pour zones_alert:', e);
            }
         })
      );
    }
 
    /**
     * Récupère une région custom
     */
    getCustomRegion(id: string): Observable<any> {
      const url = `${this.API_BASE}/${this.CUSTOM_PATH}/${id}`;
      return this.http.get(url);
    }
 
    /**
     * Supprime une région custom
     */
    deleteCustomRegion(id: string): Observable<any> {
      const url = `${this.API_BASE}/${this.CUSTOM_PATH}/${id}`;
      return this.http.delete(url);
    }
 
    /**
     * Liste toutes les régions custom
     */
    listCustomRegions(): Observable<any> {
      const url = `${this.API_BASE}/${this.CUSTOM_PATH}`;
      return this.http.get(url);
    }
 }
