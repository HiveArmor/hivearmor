import { describe, expect, it } from 'vitest';

import {
  installScriptDownloadFilename,
  sanitizeInstallScriptFilename,
} from './installScriptDownload';

describe('installScriptDownload', () => {
  it('sanitizes alias for filename', () => {
    expect(sanitizeInstallScriptFilename('Web Server 01')).toBe('web-server-01');
    expect(sanitizeInstallScriptFilename('---')).toBe('agent');
  });

  it('builds platform-specific filenames', () => {
    expect(installScriptDownloadFilename('web-server-01', 'linux')).toBe('hivearmor-install-web-server-01.sh');
    expect(installScriptDownloadFilename('web-server-01', 'windows')).toBe('hivearmor-install-web-server-01.ps1');
  });
});
