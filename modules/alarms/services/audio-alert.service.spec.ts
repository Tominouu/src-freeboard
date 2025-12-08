import { TestBed } from '@angular/core/testing';
import { AudioAlertService, AlertLevel } from './audio-alert.service';

describe('AudioAlertService', () => {
  let service: AudioAlertService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AudioAlertService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('inferAlertLevelFromColor', () => {
    it('should infer low level from green hex color', () => {
      const greenColors = ['#00ff00', '#00FF00', '#0f0', '#00aa00', '#44ff44'];
      greenColors.forEach(color => {
        const level = AudioAlertService.inferAlertLevelFromColor(color);
        expect(level).toBe('low', `Failed for color ${color}`);
      });
    });

    it('should infer medium level from orange/yellow hex color', () => {
      const orangeColors = ['#ff8800', '#ffa500', '#ffaa00', '#ff9900'];
      orangeColors.forEach(color => {
        const level = AudioAlertService.inferAlertLevelFromColor(color);
        expect(level).toBe('medium', `Failed for color ${color}`);
      });
    });

    it('should infer high level from red hex color', () => {
      const redColors = ['#ff0000', '#FF0000', '#f00', '#ff1010', '#cc0000'];
      redColors.forEach(color => {
        const level = AudioAlertService.inferAlertLevelFromColor(color);
        expect(level).toBe('high', `Failed for color ${color}`);
      });
    });

    it('should infer level from rgb color format', () => {
      expect(AudioAlertService.inferAlertLevelFromColor('rgb(0, 255, 0)')).toBe('low'); // green
      expect(AudioAlertService.inferAlertLevelFromColor('rgb(255, 165, 0)')).toBe('medium'); // orange
      expect(AudioAlertService.inferAlertLevelFromColor('rgb(255, 0, 0)')).toBe('high'); // red
    });

    it('should infer level from rgba color format', () => {
      expect(AudioAlertService.inferAlertLevelFromColor('rgba(0, 255, 0, 0.5)')).toBe('low'); // green
      expect(AudioAlertService.inferAlertLevelFromColor('rgba(255, 165, 0, 0.8)')).toBe('medium'); // orange
      expect(AudioAlertService.inferAlertLevelFromColor('rgba(255, 0, 0, 1)')).toBe('high'); // red
    });

    it('should handle short hex format', () => {
      expect(AudioAlertService.inferAlertLevelFromColor('#0f0')).toBe('low'); // green
      expect(AudioAlertService.inferAlertLevelFromColor('#f00')).toBe('high'); // red
    });

    it('should default to medium for blue/purple colors', () => {
      expect(AudioAlertService.inferAlertLevelFromColor('#0000ff')).toBe('medium'); // blue
      expect(AudioAlertService.inferAlertLevelFromColor('#ff00ff')).toBe('medium'); // magenta
    });

    it('should default to medium for invalid color', () => {
      expect(AudioAlertService.inferAlertLevelFromColor('')).toBe('medium');
      expect(AudioAlertService.inferAlertLevelFromColor('invalid')).toBe('medium');
      expect(AudioAlertService.inferAlertLevelFromColor(null as any)).toBe('medium');
    });

    it('should handle hex colors with alpha channel', () => {
      expect(AudioAlertService.inferAlertLevelFromColor('#00ff0088')).toBe('low'); // green with alpha
      expect(AudioAlertService.inferAlertLevelFromColor('#ff000099')).toBe('high'); // red with alpha
    });
  });

  describe('playAlert', () => {
    beforeEach(() => {
      // Mock Audio constructor to avoid actual audio playback in tests
      spyOn(window as any, 'Audio').and.returnValue({
        volume: 0,
        src: '',
        play: jasmine.createSpy('play').and.returnValue(Promise.resolve()),
        pause: jasmine.createSpy('pause'),
        addEventListener: jasmine.createSpy('addEventListener').and.callFake((event, callback) => {
          if (event === 'canplaythrough') {
            setTimeout(() => callback(), 0);
          }
        })
      });
    });

    it('should respect global mute', async () => {
      await service.playAlert('low', 'test-region', undefined, true);
      expect(window.Audio).not.toHaveBeenCalled();
    });

    it('should play sound for different levels', async () => {
      const levels: AlertLevel[] = ['low', 'medium', 'high'];
      for (const level of levels) {
        await service.playAlert(level, `test-region-${level}`, undefined, false);
        expect(window.Audio).toHaveBeenCalled();
        (window.Audio as any).calls.reset();
      }
    });

    it('should debounce rapid calls for same region', async () => {
      await service.playAlert('low', 'test-region', undefined, false);
      const callCount1 = (window.Audio as any).calls.count();
      
      // Immediate second call should be debounced
      await service.playAlert('low', 'test-region', undefined, false);
      const callCount2 = (window.Audio as any).calls.count();
      
      expect(callCount2).toBe(callCount1);
    });

    it('should allow different regions to play simultaneously', async () => {
      await service.playAlert('low', 'region-1', undefined, false);
      const callCount1 = (window.Audio as any).calls.count();
      
      await service.playAlert('low', 'region-2', undefined, false);
      const callCount2 = (window.Audio as any).calls.count();
      
      expect(callCount2).toBeGreaterThan(callCount1);
    });
  });

  describe('clearDebounce', () => {
    it('should clear debounce for a specific region', async () => {
      spyOn(window as any, 'Audio').and.returnValue({
        volume: 0,
        src: '',
        play: jasmine.createSpy('play').and.returnValue(Promise.resolve()),
        pause: jasmine.createSpy('pause'),
        addEventListener: jasmine.createSpy('addEventListener').and.callFake((event, callback) => {
          if (event === 'canplaythrough') {
            setTimeout(() => callback(), 0);
          }
        })
      });

      await service.playAlert('low', 'test-region', undefined, false);
      const callCount1 = (window.Audio as any).calls.count();
      
      // Clear debounce
      service.clearDebounce('test-region');
      
      // Should allow immediate replay
      await service.playAlert('low', 'test-region', undefined, false);
      const callCount2 = (window.Audio as any).calls.count();
      
      expect(callCount2).toBeGreaterThan(callCount1);
    });
  });
});
