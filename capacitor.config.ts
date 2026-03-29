import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shijing.app',
  appName: '视净',
  webDir: 'dist',
  server: {
    url: 'http://121.41.65.197:3000/#/login',
    cleartext: true
  }
};

export default config;