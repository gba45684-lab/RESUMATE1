import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.resumate.app',
  appName: 'ResuMate',
  webDir: 'www',
  bundledWebRuntime: false,
  android: {
    backgroundColor: '#F3EEDE'
  },
  server: {
    cleartext: false
  }
};

export default config;
