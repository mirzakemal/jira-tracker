import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('logger', () => {
  let logger;

  beforeEach(async () => {
    // Clear module registry so we get a fresh logger each test
    vi.resetModules();
    logger = (await import('../utils/logger.js')).default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('level filtering', () => {
    it('starts at debug level in test environment', () => {
      expect(logger.getLevel()).toBe('debug');
    });

    it('outputs all levels at debug level', () => {
      logger.setLevel('debug');
      const spyDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});

      logger.debug('debug msg');
      logger.info('info msg');
      logger.warn('warn msg');
      logger.error('error msg');

      expect(spyDebug).toHaveBeenCalledWith('debug msg');
      expect(spyLog).toHaveBeenCalledWith('info msg');
      expect(spyWarn).toHaveBeenCalledWith('warn msg');
      expect(spyError).toHaveBeenCalledWith('error msg');
    });

    it('filters debug at info level', () => {
      logger.setLevel('info');
      const spyDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.debug('should be filtered');
      logger.info('should pass');

      expect(spyDebug).not.toHaveBeenCalled();
      expect(spyLog).toHaveBeenCalledWith('should pass');
    });

    it('filters debug and info at warn level', () => {
      logger.setLevel('warn');
      const spyDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});

      logger.debug('filtered');
      logger.info('filtered');
      logger.warn('passes');
      logger.error('passes');

      expect(spyDebug).not.toHaveBeenCalled();
      expect(spyLog).not.toHaveBeenCalled();
      expect(spyWarn).toHaveBeenCalledWith('passes');
      expect(spyError).toHaveBeenCalledWith('passes');
    });
  });

  describe('prefix filtering', () => {
    it('allows all prefixes when allowedPrefixes is null', () => {
      logger.setLevel('info');
      const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('[Route] Navigating');
      logger.info('[Sync] Syncing');
      logger.info('bare message');

      expect(spyLog).toHaveBeenCalledTimes(3);
    });

    it('restricts to allowed prefixes only', () => {
      logger.setLevel('info');
      logger.setAllowedPrefixes(['Route']);
      const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('[Route] Navigating');
      logger.info('[Sync] Syncing');
      logger.info('[DB] Querying');
      logger.info('bare message');

      // Bare messages always pass through; only prefixed ones are restricted
      expect(spyLog).toHaveBeenCalledTimes(2);
      expect(spyLog).toHaveBeenCalledWith('[Route] Navigating');
      expect(spyLog).toHaveBeenCalledWith('bare message');
    });

    it('allows messages without prefix when allowedPrefixes is set', () => {
      logger.setLevel('info');
      logger.setAllowedPrefixes(['Route']);
      const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('bare message without prefix');

      expect(spyLog).toHaveBeenCalledTimes(1);
    });

    it('supports multiple allowed prefixes', () => {
      logger.setLevel('info');
      logger.setAllowedPrefixes(['Route', 'Sync']);
      const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('[Route] A');
      logger.info('[Sync] B');
      logger.info('[DB] C');

      expect(spyLog).toHaveBeenCalledTimes(2);
    });

    it('resets to allow all when setAllowedPrefixes(null)', () => {
      logger.setLevel('info');
      logger.setAllowedPrefixes(['Route']);
      logger.setAllowedPrefixes(null);
      const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('[Sync] A');
      logger.info('[DB] B');

      expect(spyLog).toHaveBeenCalledTimes(2);
    });
  });

  describe('prefix detection', () => {
    it('detects prefix from bracketed strings', () => {
      logger.setLevel('info');
      logger.setAllowedPrefixes(['Sync']);
      const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('[Sync] Starting');
      expect(spyLog).toHaveBeenCalledTimes(1);

      logger.info('[Syncing] Starting');
      expect(spyLog).toHaveBeenCalledTimes(1);
    });

    it('handles multi-word prefix', () => {
      logger.setLevel('info');
      logger.setAllowedPrefixes(['Jira API']);
      const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('[Jira API] Request failed');
      expect(spyLog).toHaveBeenCalledTimes(1);
    });
  });

  describe('prod stripping simulation', () => {
    it('warn level (prod-like) suppresses debug and info', () => {
      logger.setLevel('warn');
      const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      logger.info('should not appear in output');
      logger.warn('warning message');

      expect(spyLog).not.toHaveBeenCalled();
      expect(spyWarn).toHaveBeenCalledWith('warning message');
    });

    it('error always outputs at any level', () => {
      logger.setLevel('error');
      const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});

      logger.error('critical error');

      expect(spyError).toHaveBeenCalledWith('critical error');
    });
  });

  describe('runtime level override', () => {
    it('setLevel overrides default level', () => {
      logger.setLevel('error');
      expect(logger.getLevel()).toBe('error');

      const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('should be filtered');
      expect(spyLog).not.toHaveBeenCalled();
    });

    it('setLevel("debug") restores all output', () => {
      logger.setLevel('warn');
      logger.setLevel('debug');
      expect(logger.getLevel()).toBe('debug');

      const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.info('should pass');
      expect(spyLog).toHaveBeenCalledWith('should pass');
    });
  });
});
