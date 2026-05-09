/**
 * @format
 */

import { AppRegistry } from 'react-native';
import notifee from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';

// Required on Android so Notifee can deliver trigger / action events when the app is backgrounded.
notifee.onBackgroundEvent(async () => {
  // no-op — scheduled reminders display without custom handling
});

AppRegistry.registerComponent(appName, () => App);
