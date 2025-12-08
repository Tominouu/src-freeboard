import { TestBed } from '@angular/core/testing';
import { RegionAlertSoundService, AlertLevel } from './region-alert-sound.service';

describe('RegionAlertSoundService', () => {
  let service: RegionAlertSoundService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RegionAlertSoundService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('colorToAlertLevel', () => {
    it('should map green colors to low alert level', () => {
      expect(RegionAlertSoundService.colorToAlertLevel('#00ff00')).toBe('low');
      expect(RegionAlertSoundService.colorToAlertLevel('#0f0')).toBe('low');
      expect(RegionAlertSoundService.colorToAlertLevel('#00ff0033')).toBe('low');
      expect(RegionAlertSoundService.colorToAlertLevel('green')).toBe('low');
    });

    it('should map red colors to high alert level', () => {
      expect(RegionAlertSoundService.colorToAlertLevel('#ff0000')).toBe('high');
      expect(RegionAlertSoundService.colorToAlertLevel('#f00')).toBe('high');
      expect(RegionAlertSoundService.colorToAlertLevel('#ff000033')).toBe('high');
      expect(RegionAlertSoundService.colorToAlertLevel('red')).toBe('high');
    });

    it('should map orange colors to medium alert level', () => {
      expect(RegionAlertSoundService.colorToAlertLevel('#ffa500')).toBe('medium');
      expect(RegionAlertSoundService.colorToAlertLevel('#ff8800')).toBe('medium');
      expect(RegionAlertSoundService.colorToAlertLevel('orange')).toBe('medium');
    });

    it('should default to medium for unknown colors', () => {
      expect(RegionAlertSoundService.colorToAlertLevel('#0000ff')).toBe('medium');
      expect(RegionAlertSoundService.colorToAlertLevel('blue')).toBe('medium');
      expect(RegionAlertSoundService.colorToAlertLevel('')).toBe('medium');
    });

    it('should handle RGB parsing correctly', () => {
      // High green value -> low
      expect(RegionAlertSoundService.colorToAlertLevel('#00ff00')).toBe('low');
      
      // High red value -> high
      expect(RegionAlertSoundService.colorToAlertLevel('#ff0000')).toBe('high');
      
      // High red, medium green, low blue -> medium (orange-like)
      expect(RegionAlertSoundService.colorToAlertLevel('#ff8000')).toBe('medium');
    });
  });

  describe('global mute', () => {
    it('should start unmuted', () => {
      expect(service.isGlobalMuted()).toBe(false);
    });

    it('should toggle mute state', () => {
      service.setGlobalMute(true);
      expect(service.isGlobalMuted()).toBe(true);
      
      service.setGlobalMute(false);
      expect(service.isGlobalMuted()).toBe(false);
    });
  });

  describe('playAlert', () => {
    it('should not play when globally muted', async () => {
      service.setGlobalMute(true);
      
      // Mock console.log to check if muted message appears
      const consoleSpy = spyOn(console, 'log');
      
      await service.playAlert('low');
      
      expect(consoleSpy).toHaveBeenCalledWith('Alert sound muted globally');
    });
  });
});
