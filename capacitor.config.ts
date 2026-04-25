import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shijing.app',
  appName: '视净',
  webDir: 'dist',
  server: {
    cleartext: true
  }
};

export default config;
