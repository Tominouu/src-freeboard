# Sound Alert Files

This directory contains audio files for region alert levels.

## Files

- `alert_small.ogg` / `alert_small.mp3` - Low level alert sound
- `alert_medium.ogg` / `alert_medium.mp3` - Medium level alert sound
- `alert_large.ogg` / `alert_large.mp3` - High level alert sound

## Placeholder Notice

The current files are placeholders. To replace them:

1. Add your custom sound files with the same names
2. Supported formats: .ogg (recommended) and .mp3
3. Keep sounds short (< 1 second recommended)
4. Volumes are controlled by code: low=0.4, medium=0.7, high=1.0

## Custom Sound URLs

You can also specify custom sound URLs per region by adding a `customSoundUrl` property to the region's feature properties.
