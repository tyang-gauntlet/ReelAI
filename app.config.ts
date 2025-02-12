export default {
  expo: {
    name: 'ReelAI',
    slug: 'reelai',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'ai.gauntlet.reelai',
    },
    android: {
      package: 'ai.gauntlet.reelai',
      adaptiveIcon: {
        backgroundColor: '#ffffff',
      },
    },
    experiments: {
      tsconfigPaths: true,
    },
    newArchEnabled: true,
    jsEngine: 'hermes',
    web: {
      favicon: './assets/favicon.png',
      bundler: 'webpack',
    },
    extra: {
      eas: {
        projectId: 'fa447ebb-d129-4cf8-bc54-85ea7f36cd9d',
      },
      EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
        process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    },
  },
};
