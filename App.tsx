import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StripeProvider } from '@stripe/stripe-react-native';
import { UserProvider } from './src/context/UserContext';
import AppNavigator from './src/navigation/AppNavigator';
import { registerForPushNotifications } from './src/lib/notifications';

const STRIPE_KEY = 'pk_test_51TZeUl2VTsh8o4Gw9n2FX52SxHgbgyZhtfI2wIzmQ73WoxdIl1JmXend8Gb9DtceUXmnr4ofj4HEzgUOJ4Wf7emc00ACGjjjmo';

// Request notification permissions on app start
registerForPushNotifications();

export default function App() {
  return (
    <SafeAreaProvider>
      <StripeProvider publishableKey={STRIPE_KEY} merchantIdentifier="merchant.com.oinker">
        <UserProvider>
          <StatusBar style="light" />
          <AppNavigator />
        </UserProvider>
      </StripeProvider>
    </SafeAreaProvider>
  );
}
