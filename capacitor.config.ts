import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.forgiveme.www',
  appName: 'Forgivemе',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: '#0d0808',
      androidSplashResourceName: 'splash',
      showSpinner: false
    },
    Camera: {
      presentationStyle: 'popover'
    },
    App: {
      appUrlOpen: true
    }
  }
}

export default config
