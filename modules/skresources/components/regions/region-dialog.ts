/** Region Details Dialog Component **
 ********************************/

import { Component, OnInit, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA
} from '@angular/material/dialog';
// ADD: Import MatCheckboxModule and MatSelectModule
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { SKRegion } from '../../resource-classes';
import { CustomRegionsService } from '../../services/custom-regions.service';
import { AudioAlertService, AlertLevel } from '../../../alarms/services/audio-alert.service';

/********* RegionDialog **********
  data: {
    region: SKRegion
  }
***********************************/
@Component({
  selector: 'ap-regiondialog',
  imports: [
    FormsModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatDialogModule,
    MatCheckboxModule, // ADD: Add the module to imports
    MatSelectModule
  ],
  template: `
    <div class="_ap-region">
      <div style="display:flex;">
        <div style="padding: 15px 0 0 10px;">
          <mat-icon class="icon-region">tab_unselected</mat-icon>
        </div>
        <div>
          <h1 mat-dialog-title>Détails de la région</h1>
        </div>
      </div>

      <mat-dialog-content>
        <div style="padding-left: 10px;">
          <mat-form-field floatLabel="always">
            <mat-label>Nom</mat-label>
            <input
              matInput
              #inpname="ngModel"
              type="text"
              required
              [readonly]="readOnly"
              [(ngModel)]="name"
            />
            @if(inpname.invalid && (inpname.dirty || inpname.touched)) {
            <mat-error> Veuillez entrer un nom.</mat-error>
            }
          </mat-form-field>

          <mat-form-field floatLabel="always" style="margin-top: 10px;">
            <mat-label>Description</mat-label>
            <textarea
              matInput
              rows="3"
              #inpcmt="ngModel"
              [readonly]="readOnly"
              [(ngModel)]="description"
            ></textarea>
          </mat-form-field>

          <div style="margin-top: 20px;">
            <label style="display: block; margin-bottom: 8px; color: rgba(255, 255, 255, 1); font-size: 24px;">
              Couleur
            </label>
            <input
              type="color"
              [(ngModel)]="color"
              [disabled]="readOnly"
              style="width: 100px; height: 40px; cursor: pointer; border: 1px solid #ccc; border-radius: 4px;"
            />
          </div>

          <div style="margin-top: 20px;">
            <mat-checkbox [(ngModel)]="alertEnabled" [disabled]="readOnly">
              Déclencher une alerte à l'entrée
            </mat-checkbox>
          </div>

          @if(alertEnabled) {
          <div style="margin-top: 20px;">
            <mat-checkbox [(ngModel)]="alertSoundEnabled" [disabled]="readOnly">
              Activer le son d'alerte
            </mat-checkbox>
          </div>

          <div style="margin-top: 20px;">
            <mat-form-field floatLabel="always">
              <mat-label>Niveau d'alerte sonore</mat-label>
              <mat-select [(ngModel)]="alertLevel" [disabled]="readOnly || !alertSoundEnabled">
                <mat-option value="low">Faible (volume 40%)</mat-option>
                <mat-option value="medium">Moyen (volume 70%)</mat-option>
                <mat-option value="high">Fort (volume 100%)</mat-option>
              </mat-select>
            </mat-form-field>
          </div>
          }
        </div>
      </mat-dialog-content>

      <mat-dialog-actions>
        <div style="text-align:center;width:100%;">
          @if(!readOnly) {
          <button
            mat-raised-button
            [disabled]="inpname.invalid || readOnly"
            (click)="handleClose(true)"
          >
            ENREGISTRER
          </button>
          }
          <button mat-raised-button (click)="handleClose(false)">ANNULER</button>
        </div>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      ._ap-region {
        min-width: 300px;
      }
      
      mat-form-field {
        width: 100%;
      }
    `
  ]
})
export class RegionDialog implements OnInit {
  protected name: string;
  protected description: string;
  protected color: string;
  protected alertEnabled = false; // ADD: Property for checkbox
  protected alertSoundEnabled = false; // ADD: Property to enable sound
  protected alertLevel: AlertLevel = 'medium'; // ADD: Sound alert level
  protected readOnly = false;

  constructor(
    private dialogRef: MatDialogRef<RegionDialog>,
    private customRegionsService: CustomRegionsService,
    @Inject(MAT_DIALOG_DATA)
    protected data: {
      region: SKRegion;
    }
  ) {}

  ngOnInit() {
    this.name = this.data.region.name ?? '';
    this.description = this.data.region.description ?? '';
    this.readOnly =
      (this.data.region.feature as any)?.properties?.readOnly ?? false;
    
    const feature = this.data.region.feature as any;
    
    // Vérifier si c'est un ResourceSet ou une simple Feature
    if (feature?.type === 'ResourceSet') {
      // C'est un ResourceSet avec des styles personnalisés
      const style = feature.styles?.customStyle;
      const existingColor = style?.stroke || style?.fill;
      this.color = existingColor ? this.extractHexColor(existingColor) : '#00ff00';
      
      // Récupérer le nom et la description du ResourceSet
      this.name = feature.name || this.name;
      this.description = feature.description || this.description;

      // ADD: Load alertEnabled value
      this.alertEnabled = feature.values?.features?.[0]?.properties?.alertEnabled ?? false;
      
      // ADD: Load alertSoundEnabled and alertLevel
      const props = feature.values?.features?.[0]?.properties;
      this.alertSoundEnabled = props?.alertSoundEnabled ?? false;
      this.alertLevel = props?.alertLevel || AudioAlertService.inferAlertLevelFromColor(this.color);
      
      console.log('Loading ResourceSet:', feature);
    } else {
      // C'est une Feature classique
      const props = feature?.properties;
      const style = props?.style;
      let existingColor = style?.fill || style?.stroke;
      
      if (!existingColor) {
        existingColor = props?.fillColor || props?.strokeColor || props?.fill || props?.stroke;
      }
      
      this.color = existingColor ? this.extractHexColor(existingColor) : '#00ff00';

      // ADD: Load alertEnabled value
      this.alertEnabled = props?.alertEnabled ?? false;
      
      // ADD: Load alertSoundEnabled and alertLevel
      this.alertSoundEnabled = props?.alertSoundEnabled ?? false;
      this.alertLevel = props?.alertLevel || AudioAlertService.inferAlertLevelFromColor(this.color);
      
      console.log('Loading Feature:', feature);
    }
    
    console.log('Extracted color:', this.color);
    console.log('Extracted alertEnabled:', this.alertEnabled);
    console.log('Extracted alertSoundEnabled:', this.alertSoundEnabled);
    console.log('Extracted/inferred alertLevel:', this.alertLevel);
  }

  // Extraire la couleur hexadécimale (sans l'opacité)
  private extractHexColor(color: string): string {
    if (!color) return '#00ff00';
    
    // Si la couleur commence par # et a 9 caractères (avec opacité #RRGGBBAA)
    if (color.startsWith('#') && color.length === 9) {
      return color.substring(0, 7); // Retourne #RRGGBB sans l'opacité
    }
    // Si la couleur commence par # et a plus de 7 caractères
    if (color.startsWith('#') && color.length > 7) {
      return color.substring(0, 7);
    }
    // Si la couleur est au format rgba
    if (color.startsWith('rgba')) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        const r = parseInt(match[1]).toString(16).padStart(2, '0');
        const g = parseInt(match[2]).toString(16).padStart(2, '0');
        const b = parseInt(match[3]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
      }
    }
    return color;
  }

  // Convertir la couleur hex en rgba avec opacité
  private hexToRgba(hex: string, opacity: number = 0.2): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  handleClose(save: boolean) {
    if (save) {
      this.data.region.name = this.name;
      this.data.region.description = this.description;

      const feature = this.data.region.feature as any;
      
      // Extraire la géométrie de la feature existante
      let geometry;
      if (feature?.type === 'ResourceSet') {
        geometry = feature.values?.features?.[0]?.geometry;
      } else if (feature?.type === 'Feature') {
        geometry = feature.geometry;
      } else {
        geometry = feature;
      }
      
      // Créer un ResourceSet complet selon le format du README
      const styleName = 'style_' + this.name.toLowerCase().replace(/\s+/g, '_');
      
      const resourceSet = {
        type: 'ResourceSet',
        name: this.name,
        description: this.description,
        styles: {
          [styleName]: {
            stroke: this.color,
            fill: this.color + '33',
            width: 2
          }
        },
        values: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { 
                styleRef: styleName,
                alertEnabled: this.alertEnabled, // ADD: Save the property
                alertSoundEnabled: this.alertSoundEnabled, // ADD: Save the sound
                alertLevel: this.alertLevel // ADD: Save the level
              },
              geometry: geometry
            }
          ]
        }
      };
      
      // Générer un UUID pour le fichier si la région n'en a pas
      const regionId = (this.data.region as any).id || this.generateUUID();
      
      // Sauvegarder directement dans zones_alert via l'API Signal K
      this.customRegionsService.saveCustomRegion(regionId, resourceSet).subscribe({
        next: (response) => {
          console.log('Region saved successfully in zones_alert:', response);
          (this.data.region as any).feature = resourceSet;
          (this.data.region as any).id = regionId;
          (this.data.region as any).customPath = 'zones_alert';
          this.dialogRef.close({ save: true, region: this.data.region });
          // Recharger la page après la fermeture du dialog pour appliquer l'activation par défaut
          setTimeout(() => {
            try { window.location.reload(); } catch (e) { console.error('reload failed', e); }
          }, 150);
        },
        error: (error) => {
          console.error('Error saving region:', error);
          alert('Erreur lors de la sauvegarde de la région. Vérifiez que le path "zones_alert" existe dans Resources Provider.');
          this.dialogRef.close({ save: false });
        }
      });
    } else {
      this.dialogRef.close({ save: false });
    }
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}