import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, AppStateStatus } from 'react-native';
import { api } from './api';

const BACKGROUND_LOCATION_TASK = 'driver-background-location';
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: any = null;

// Define the background task - must be at module level
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.log('[BackgroundLocation] Error:', error.message);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const location = locations[0];

    if (location) {
      try {
        await api.updateDriverProfile({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          is_online: true,
        });
        console.log('[BackgroundLocation] Updated position');
      } catch (err) {
        console.log('[BackgroundLocation] Failed to update:', err);
      }
    }
  }
});

async function ensureRunning(): Promise<void> {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (!isRunning) {
      console.log('[BackgroundLocation] Task died, restarting...');
      await startTask();
    }
  } catch (err) {
    console.log('[BackgroundLocation] Keep-alive check failed:', err);
  }
}

async function startTask(): Promise<void> {
  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 15000,
    distanceInterval: 30,
    deferredUpdatesInterval: 15000,
    showsBackgroundLocationIndicator: true,
    pausesLocationUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'Oinker Driver',
      notificationBody: 'You are online and accepting deliveries',
      notificationColor: '#6c5ce7',
    },
  });
}

export async function startBackgroundLocation(): Promise<boolean> {
  try {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.log('[BackgroundLocation] Foreground permission denied');
      return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.log('[BackgroundLocation] Background permission denied');
      return false;
    }

    // Stop first to avoid conflicts
    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch {}

    await startTask();

    // Start keep-alive: check every 60s if the task is still running
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    keepAliveInterval = setInterval(ensureRunning, 60000);

    // Also restart the task when app comes back to foreground
    if (appStateSubscription) appStateSubscription.remove();
    appStateSubscription = AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (state === 'active') {
        await ensureRunning();
      }
    });

    console.log('[BackgroundLocation] Started');
    return true;
  } catch (err) {
    console.log('[BackgroundLocation] Failed to start:', err);
    return false;
  }
}

export async function isBackgroundLocationRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}

export async function stopBackgroundLocation(): Promise<void> {
  try {
    // Clear keep-alive
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }

    const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log('[BackgroundLocation] Stopped');
    }
  } catch (err) {
    console.log('[BackgroundLocation] Failed to stop:', err);
  }
}
