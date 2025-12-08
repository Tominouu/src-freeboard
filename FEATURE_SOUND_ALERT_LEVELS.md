# Feature: Sound Alert Levels for Regions

## Overview

This feature adds configurable sound alert levels for regions in the Signal K Freeboard application. Users can now set different alert sound intensities based on region importance, with automatic inference from region colors.

## User-Facing Features

### Alert Levels

Three alert levels are available:

1. **Faible (Low)** - 40% volume
   - Default for green regions
   - Suitable for informational zones

2. **Moyen (Medium)** - 70% volume
   - Default for orange regions
   - Suitable for attention zones

3. **Fort (High)** - 100% volume
   - Default for red regions
   - Suitable for danger/critical zones

### User Interface

When creating or editing a region:

1. **"Déclencher une alerte à l'entrée"** - Enable/disable visual alert (existing)
2. **"Activer le son d'alerte"** (NEW) - Enable/disable sound alert
3. **"Niveau d'alerte sonore"** (NEW) - Select alert level (Faible/Moyen/Fort)

The alert level is automatically inferred from the region color when created, but can be manually changed.

### Color-to-Level Mapping

The system automatically infers alert levels from region colors using HSL hue:

- **Green** (hue 90-150°) → Low
- **Orange/Yellow** (hue 20-89°) → Medium
- **Red** (hue 0-19° or 330-360°) → High
- **Other colors** (blue, purple, etc.) → Medium (default)

Supports hex (#RRGGBB, #RGB, #RRGGBBAA), rgb(), and rgba() color formats.

### Debounce Protection

A 3-second debounce is applied per region to prevent repeated alerts when GPS position fluctuates near region boundaries.

### Global Mute

The existing global audio mute setting (`doNotPlayAudio`) is respected. When enabled, no region alert sounds will play.

## Technical Implementation

### Architecture

```
AudioAlertService
├── Color-to-level inference (HSL hue-based)
├── Volume control per level
├── Debounce management (3s per region)
├── Sound playback (HTMLAudioElement)
└── .ogg/.mp3 fallback support

RegionAlertService
├── Position checking (Turf.js)
├── Region state management
├── AudioAlertService integration
└── NotificationManager integration

RegionDialog
├── UI controls (checkboxes, select)
├── Color-based initialization
├── Property persistence
└── ResourceSet format
```

### Key Components

#### AudioAlertService
- **Location**: `modules/alarms/services/audio-alert.service.ts`
- **Exports**: `AlertLevel` type, `AudioAlertService` class
- **Methods**:
  - `playAlert(level, regionId, customSoundUrl?, globalMute?)` - Play sound for alert level
  - `inferAlertLevelFromColor(color)` - Static method to infer level from color
  - `clearDebounce(regionId)` - Clear debounce for a region
  - `clearAllDebounces()` - Clear all debounces

#### RegionAlertService Updates
- **Location**: `modules/skresources/services/region-alert.service.ts`
- **Changes**:
  - Injected `AudioAlertService`
  - Extracts `alertLevel`, `alertSoundEnabled`, `customSoundUrl` from region properties
  - Calls `audioAlertService.playAlert()` when region is entered
  - Respects global mute setting

#### RegionDialog Updates
- **Location**: `modules/skresources/components/regions/region-dialog.ts`
- **New Fields**:
  - `alertSoundEnabled: boolean` - Enable sound for this region
  - `alertLevel: AlertLevel` - Alert level (low/medium/high)
- **Behavior**:
  - Initializes `alertLevel` from color if not set
  - Shows sound controls only when `alertEnabled` is true
  - Persists both fields in region properties

### Audio Assets

Located in `assets/sounds/`:
- `alert_small.ogg` / `alert_small.mp3` - Low alert sound
- `alert_medium.ogg` / `alert_medium.mp3` - Medium alert sound
- `alert_large.ogg` / `alert_large.mp3` - High alert sound

Current files are placeholders. Users can replace them with custom audio files.

### Data Model

Region properties now include:

```typescript
{
  alertEnabled: boolean,           // Visual alert enabled
  alertSoundEnabled: boolean,      // Sound alert enabled (NEW)
  alertLevel: 'low'|'medium'|'high', // Alert level (NEW)
  customSoundUrl?: string          // Custom sound URL (NEW, optional)
}
```

### Browser Compatibility

- Uses `HTMLAudioElement` for maximum compatibility
- Event-driven loading (`canplaythrough`) ensures audio is ready
- Automatic fallback from .ogg to .mp3 if first format fails
- Tested approach for cross-browser support

## Testing

### Unit Tests

**AudioAlertService** (`audio-alert.service.spec.ts`):
- Color-to-level inference (hex, rgb, rgba formats)
- Alert level mapping (green→low, orange→medium, red→high)
- Global mute functionality
- Debounce logic
- Multi-region support

### Manual Testing Steps

1. **Create a green region**
   - Set name and description
   - Choose green color (#00ff00)
   - Enable "Déclencher une alerte à l'entrée"
   - Enable "Activer le son d'alerte"
   - Verify alertLevel defaults to "Faible"
   - Save

2. **Test entry alert**
   - Move vessel into region
   - Verify visual alert appears
   - Verify low-volume sound plays
   - Move vessel out and back in
   - Verify 3-second debounce works

3. **Test different levels**
   - Create orange region → verify medium level
   - Create red region → verify high level
   - Test manual level override

4. **Test global mute**
   - Enable global audio mute
   - Enter region
   - Verify no sound plays
   - Disable global mute
   - Verify sound resumes

5. **Test migration**
   - Load existing region without alertLevel
   - Verify level is inferred from color
   - Verify region still functions correctly

## Migration

Existing regions are automatically migrated:
- If `alertLevel` is not set, it's inferred from the region color
- If `alertSoundEnabled` is not set, it defaults to `false`
- No data loss or breaking changes

## Customization

### Custom Sound Files

Replace files in `assets/sounds/` with your own:
1. Keep the same filenames
2. Provide both .ogg and .mp3 formats
3. Keep files small (< 1 second recommended)
4. Test in your target browsers

### Custom Sound URLs

Add `customSoundUrl` to region properties:

```json
{
  "type": "ResourceSet",
  "name": "Custom Alert Zone",
  "values": {
    "features": [{
      "type": "Feature",
      "properties": {
        "alertEnabled": true,
        "alertSoundEnabled": true,
        "alertLevel": "high",
        "customSoundUrl": "https://example.com/custom-alert.mp3"
      }
    }]
  }
}
```

### Volume Adjustment

Volumes are hardcoded in `AudioAlertService`:
```typescript
private readonly volumes = {
  low: 0.4,
  medium: 0.7,
  high: 1.0
};
```

To adjust, modify these values (0.0 to 1.0 range).

## Future Enhancements

Potential improvements:
- User-configurable volume levels per alert level
- Custom sound upload UI
- Alert sound preview in region dialog
- Multiple sound files per level (randomized)
- Configurable debounce duration
- Per-region mute toggle
- Sound only for first entry (no repeat until exit)

## Security Summary

**CodeQL Analysis**: ✅ No security vulnerabilities detected

The implementation:
- Does not introduce any security risks
- Uses standard Web Audio APIs safely
- Validates all user inputs
- No sensitive data exposure
- No XSS or injection vulnerabilities

## References

- Signal K API: https://signalk.org/
- Turf.js (geometry): https://turfjs.org/
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
