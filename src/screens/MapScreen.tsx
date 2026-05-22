import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, FlatList, AppState, Modal, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../constants/theme';
import { api } from '../lib/api';
import { startBackgroundLocation, stopBackgroundLocation, isBackgroundLocationRunning } from '../lib/backgroundLocation';
import { RootStackParamList } from '../navigation/types';
import { useUser } from '../context/UserContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Driver {
  id: string;
  name: string;
  rating: number;
  rate_per_mile: number;
  latitude: number;
  longitude: number;
  is_online: boolean;
  distance?: number; // distance in miles from user
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function MapScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { role } = useUser();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [userName, setUserName] = useState('');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [minPayout, setMinPayout] = useState('3.00');
  const [ratePerMile, setRatePerMile] = useState('3.00');
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchDrivers = useCallback(async (lat: number, lng: number) => {
    try {
      const data = await api.getNearbyDrivers(lat, lng, 5000);
      // Calculate distance from user to each driver
      const driversWithDistance = data.map((driver: Driver) => ({
        ...driver,
        distance: haversineDistance(lat, lng, driver.latitude, driver.longitude),
      }));
      // Sort by distance
      driversWithDistance.sort((a: Driver, b: Driver) => (a.distance || 0) - (b.distance || 0));
      setDrivers(driversWithDistance);
    } catch (err) {
      // Silently fail - will retry on next poll
      console.log('Failed to fetch drivers:', err);
    }
  }, []);

  const toggleOnline = async () => {
    if (!location) return;
    setToggling(true);
    const goingOnline = !isOnline;
    try {
      await api.updateDriverProfile({
        is_online: goingOnline,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      setIsOnline(goingOnline);

      if (goingOnline) {
        await startBackgroundLocation();
      } else {
        await stopBackgroundLocation();
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update status.');
    } finally {
      setToggling(false);
    }
  };

  useEffect(() => {
    (async () => {
      // Fetch user name for greeting
      try {
        const profile = await api.getProfile();
        if (profile?.name) setUserName(profile.name.split(' ')[0]);
      } catch {}

      // If driver, fetch current online status and settings
      if (role === 'driver') {
        try {
          const driverProfile = await api.getMyDriverProfile();
          if (driverProfile?.is_online) {
            setIsOnline(true);
            // Resume background location if already online
            await startBackgroundLocation();
          }
          if (driverProfile?.minimum_payout) setMinPayout(driverProfile.minimum_payout.toFixed(2));
          if (driverProfile?.rate_per_mile) setRatePerMile(driverProfile.rate_per_mile.toFixed(2));
        } catch {}
      }

      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
      fetchDrivers(loc.coords.latitude, loc.coords.longitude);
    })();
  }, [fetchDrivers, role]);

  // Poll for driver updates every 15 seconds, and update own location if driver is online
  useEffect(() => {
    if (!location) return;
    const interval = setInterval(() => {
      fetchDrivers(location.coords.latitude, location.coords.longitude);
      if (role === 'driver' && isOnline) {
        api.updateDriverProfile({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        }).catch(() => {});
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [location, fetchDrivers, role, isOnline]);

  // Sync online status when returning to this screen
  useFocusEffect(
    useCallback(() => {
      if (role === 'driver') {
        // Check if background task is running as source of truth
        isBackgroundLocationRunning().then((running) => {
          if (running) {
            setIsOnline(true);
          } else {
            // Fall back to backend value
            api.getMyDriverProfile().then((profile) => {
              if (profile) {
                setIsOnline(profile.is_online);
                // Restart background task if backend says online but task isn't running
                if (profile.is_online) {
                  startBackgroundLocation();
                }
              }
            }).catch(() => {});
          }
        });

        // Always refresh settings
        api.getMyDriverProfile().then((profile) => {
          if (profile) {
            if (profile.minimum_payout) setMinPayout(profile.minimum_payout.toFixed(2));
            if (profile.rate_per_mile) setRatePerMile(profile.rate_per_mile.toFixed(2));
          }
        }).catch(() => {});
      }
    }, [role])
  );

  const handleSelectDriver = (driver: Driver) => {
    setSelectedDriver(selectedDriver?.id === driver.id ? null : driver);
  };

  const handleRequestDelivery = () => {
    if (selectedDriver) {
      navigation.navigate('RequestDelivery', { driver: selectedDriver });
    }
  };

  const [hasCentered, setHasCentered] = useState(false);

  // Center map on user location when first obtained
  useEffect(() => {
    if (location && !hasCentered && mapRef.current) {
      setHasCentered(true);
      mapRef.current.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 1000);
    }
  }, [location, hasCentered]);

  // Default to Minneapolis if location not available
  const defaultRegion = {
    latitude: 44.9778,
    longitude: -93.2650,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  const region = location
    ? {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : defaultRegion;

  return (
    <View style={styles.container}>
      {userName !== '' && (
        <View style={[styles.greeting, { top: insets.top + theme.spacing.sm }]}>
          <Text style={styles.greetingText}>
            {role === 'driver' ? `Hey, ${userName}` : `What are you craving, ${userName}?`}
          </Text>
        </View>
      )}
      {errorMsg ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={region}
          showsUserLocation
          showsMyLocationButton
        >
          {drivers.map((driver) => (
            <Marker
              key={driver.id}
              coordinate={{ latitude: driver.latitude, longitude: driver.longitude }}
              title={driver.name}
              description={`${driver.distance ? driver.distance.toFixed(1) + 'mi • ' : ''}$${driver.rate_per_mile.toFixed(2)}/mile • ${driver.rating}⭐`}
              onCalloutPress={() => handleSelectDriver(driver)}
            >
              <View style={[
                styles.markerContainer,
                selectedDriver?.id === driver.id && styles.markerSelected,
              ]}>
                <Text style={styles.markerIcon}>🚗</Text>
              </View>
            </Marker>
          ))}
        </MapView>
      )}

      {role === 'driver' && (
        <>
          <TouchableOpacity
            style={[styles.onlineButton, { top: insets.top + theme.spacing.sm }, isOnline && styles.onlineButtonActive]}
            onPress={toggleOnline}
            disabled={toggling}
          >
            <Text style={styles.onlineButtonText}>
              {toggling ? '...' : isOnline ? '🟢 Online' : '⚪ Go Online'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.settingsButton, { top: insets.top + theme.spacing.sm + 50 }]}
            onPress={() => setSettingsVisible(true)}
          >
            <Text style={styles.settingsButtonText}>⚙️</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Driver Settings Modal */}
      <Modal
        visible={settingsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <Pressable style={styles.settingsOverlay} onPress={() => setSettingsVisible(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.settingsKeyboardView}
          >
            <Pressable style={styles.settingsModal} onPress={() => {}}>
              <Text style={styles.settingsTitle}>Driver Settings</Text>

              <Text style={styles.settingsLabel}>Rate per mile ($)</Text>
              <TextInput
                style={styles.settingsInput}
                value={ratePerMile}
                onChangeText={setRatePerMile}
                keyboardType="decimal-pad"
                placeholder="3.00"
                placeholderTextColor={theme.colors.textMuted}
              />

              <Text style={styles.settingsLabel}>Minimum payout ($)</Text>
              <TextInput
                style={styles.settingsInput}
                value={minPayout}
                onChangeText={setMinPayout}
                keyboardType="decimal-pad"
                placeholder="3.00"
                placeholderTextColor={theme.colors.textMuted}
              />

              <View style={styles.settingsButtonRow}>
                <TouchableOpacity
                  style={styles.settingsCancelButton}
                  onPress={() => setSettingsVisible(false)}
                >
                  <Text style={styles.settingsCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.settingsSaveButton, savingSettings && { opacity: 0.5 }]}
                  onPress={async () => {
                    const rate = parseFloat(ratePerMile);
                    const min = parseFloat(minPayout);
                    if (isNaN(rate) || rate < 0 || isNaN(min) || min < 0) {
                      Alert.alert('Invalid', 'Please enter valid numbers.');
                      return;
                    }
                    setSavingSettings(true);
                    try {
                      await api.updateDriverProfile({ rate_per_mile: rate, minimum_payout: min });
                      setSettingsVisible(false);
                      Alert.alert('Saved', 'Your settings have been updated.');
                    } catch (err: any) {
                      Alert.alert('Error', err.message || 'Failed to save settings.');
                    } finally {
                      setSavingSettings(false);
                    }
                  }}
                  disabled={savingSettings}
                >
                  <Text style={styles.settingsSaveText}>{savingSettings ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Driver cards - only for eaters */}
      {role !== 'driver' && (
        <View style={styles.bottomCard}>
          {drivers.length > 0 ? (
            <>
              <Text style={styles.cardTitle}>
                {selectedDriver
                  ? `${selectedDriver.name} (${selectedDriver.distance?.toFixed(1)} mi)`
                  : `${drivers.length} driver${drivers.length !== 1 ? 's' : ''} nearby`}
              </Text>
              <FlatList
                data={drivers}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.driverList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.driverCard,
                      selectedDriver?.id === item.id && styles.driverCardSelected,
                    ]}
                    onPress={() => handleSelectDriver(item)}
                  >
                    <View style={styles.driverAvatar}>
                      <Text style={styles.driverAvatarText}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.driverName} numberOfLines={1}>{item.name.split(' ')[0]}</Text>
                    <Text style={styles.driverRating}>{item.rating.toFixed(1)} ★</Text>
                    {item.distance !== undefined && (
                      <Text style={styles.driverDistance}>{item.distance.toFixed(1)} mi away</Text>
                    )}
                    <Text style={styles.driverRate}>${item.rate_per_mile.toFixed(2)}/mi</Text>
                  </TouchableOpacity>
                )}
              />
              {selectedDriver && (
                <TouchableOpacity
                  style={styles.requestButton}
                  onPress={handleRequestDelivery}
                >
                  <Text style={styles.requestButtonText}>Request Delivery</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <Text style={styles.cardTitle}>Nearby Drivers</Text>
              <Text style={styles.cardSubtitle}>No drivers online right now. Check back soon!</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  map: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 16,
    textAlign: 'center',
  },
  greeting: {
    position: 'absolute',
    left: theme.spacing.lg,
    zIndex: 10,
    backgroundColor: 'rgba(26, 26, 26, 0.9)',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  greetingText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  markerContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.full,
    padding: theme.spacing.sm,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  markerSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: 'rgba(0, 206, 201, 0.2)',
  },
  markerIcon: {
    fontSize: 20,
  },
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  cardSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    paddingHorizontal: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  driverList: {
    gap: theme.spacing.sm,
  },
  driverCard: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    width: 120,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  driverCardSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: 'rgba(0, 206, 201, 0.1)',
  },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  driverAvatarText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  driverName: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  driverRating: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  driverDistance: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  driverRate: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  requestButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  requestButtonText: {
    color: theme.colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  onlineButton: {
    position: 'absolute',
    right: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.full,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  onlineButtonActive: {
    borderColor: theme.colors.success,
    backgroundColor: 'rgba(81, 207, 102, 0.15)',
  },
  onlineButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  settingsButton: {
    position: 'absolute',
    right: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.full,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  settingsButtonText: {
    fontSize: 18,
  },
  settingsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsKeyboardView: {
    width: '100%',
    alignItems: 'center',
  },
  settingsModal: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    width: '85%',
    maxWidth: 360,
  },
  settingsTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  settingsLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
  },
  settingsInput: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    fontSize: 16,
    marginBottom: theme.spacing.md,
  },
  settingsButtonRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  settingsCancelButton: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  settingsCancelText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  settingsSaveButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  settingsSaveText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
});
