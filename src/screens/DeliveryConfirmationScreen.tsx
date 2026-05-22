import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../constants/theme';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DeliveryConfirmation'>;

const GEOFENCE_RADIUS = 100; // meters
const MAX_ATTEMPTS = 3;

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DeliveryConfirmationScreen({ route, navigation }: Props) {
  const { order } = route.params;
  console.log('[Delivery] Order:', JSON.stringify(order, null, 2));

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [locationValid, setLocationValid] = useState<boolean | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [overrideActive, setOverrideActive] = useState(false);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const checkLocation = async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required.');
        return false;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const dist = haversineDistance(
        loc.coords.latitude,
        loc.coords.longitude,
        order.dropoff_lat,
        order.dropoff_lng,
      );

      setDistance(dist);
      return dist <= GEOFENCE_RADIUS;
    } catch (err) {
      console.error('[Location] Error:', err);
      return true; // Allow photo if location fails
    }
  };

  const handleTakePhoto = async () => {
    console.log('[Photo] Starting take photo flow');
    setChecking(true);

    try {
      // Request camera permission first
      console.log('[Photo] Requesting camera permission');
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      console.log('[Photo] Camera permission:', cameraPermission.granted);

      if (!cameraPermission.granted) {
        Alert.alert('Permission denied', 'Camera permission is required to take a photo.');
        setChecking(false);
        return;
      }

      // Check location
      console.log('[Photo] Checking location');
      const isNearby = await checkLocation();
      console.log('[Photo] Is nearby:', isNearby);

      if (!isNearby && !overrideActive) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setLocationValid(false);
        setChecking(false);

        if (newAttempts >= MAX_ATTEMPTS) {
          Alert.alert(
            'Location Mismatch',
            `You appear to be ${distance ? distance.toFixed(0) : '?'}m from the dropoff. If you're sure you're at the right place, you can override.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Override',
                onPress: () => setOverrideActive(true),
                style: 'destructive',
              },
            ],
          );
        } else {
          Alert.alert(
            'Not at Dropoff',
            `You're ${distance ? distance.toFixed(0) : '?'}m away. You need to be within ${GEOFENCE_RADIUS}m. (${newAttempts}/${MAX_ATTEMPTS} attempts)`,
          );
        }
        return;
      }

      setLocationValid(true);
      setChecking(false);

      // Launch camera
      console.log('[Photo] Launching camera');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        allowsEditing: false,
        exif: false,
        base64: false,
      });
      console.log('[Photo] Camera result:', result.canceled);

      if (!result.canceled && result.assets[0]) {
        console.log('[Photo] Photo URI:', result.assets[0].uri);
        setPhotoUri(result.assets[0].uri);
      }
    } catch (err: any) {
      console.error('[Photo] Error:', err);
      Alert.alert('Error', `Photo failed: ${err.message || 'Unknown error'}`);
      setChecking(false);
    }
  };

  const handleChooseFromGallery = async () => {
    console.log('[Photo] Opening gallery');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        allowsEditing: false,
        exif: false,
        base64: false,
      });
      console.log('[Photo] Gallery result:', result.canceled);

      if (!result.canceled && result.assets[0]) {
        console.log('[Photo] Photo URI:', result.assets[0].uri);
        setPhotoUri(result.assets[0].uri);
        setLocationValid(true); // Skip location check for gallery picks
      }
    } catch (err: any) {
      console.error('[Photo] Gallery error:', err);
      Alert.alert('Error', err.message || 'Failed to pick photo.');
    }
  };

  const handleConfirm = async () => {
    if (!photoUri) return;

    console.log('[Upload] Starting upload for:', photoUri);
    setSubmitting(true);
    try {
      const fileName = `delivery-${order.id}-${Date.now()}.jpg`;
      console.log('[Upload] File name:', fileName);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      console.log('[Upload] Got token:', !!token);

      const uploadUrl = `https://ucovpdohyahwbhujsyyi.supabase.co/storage/v1/object/delivery__photos/${fileName}`;
      console.log('[Upload] Uploading to:', uploadUrl);

      const result = await FileSystem.uploadAsync(uploadUrl, photoUri, {
        httpMethod: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'image/jpeg',
        },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });

      console.log('[Upload] Result status:', result.status);
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`Upload failed with status ${result.status}`);
      }

      console.log('[Upload] Updating order');
      await api.updateOrder(order.id, {
        status: 'delivered',
        photo_url: fileName,
      });

      console.log('[Upload] Done!');
      Alert.alert('Delivered!', 'Photo proof saved. Order marked as delivered.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      console.error('[Upload] Error:', err);
      Alert.alert('Error', err.message || 'Failed to upload photo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Delivery Proof</Text>
      <Text style={styles.subtitle}>
        Take a photo or choose from gallery to confirm delivery
      </Text>

      {/* Location Status */}
      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Location Check</Text>
        {locationValid === null ? (
          <Text style={styles.statusText}>Take a photo to verify location</Text>
        ) : locationValid ? (
          <Text style={[styles.statusText, styles.statusGood]}>
            ✓ At dropoff location
          </Text>
        ) : (
          <Text style={[styles.statusText, styles.statusBad]}>
            ✗ Too far from dropoff ({distance?.toFixed(0)}m away)
          </Text>
        )}
        {overrideActive && (
          <Text style={styles.overrideText}>Override active — location check bypassed</Text>
        )}
      </View>

      {/* Photo Preview or Capture Buttons */}
      {photoUri ? (
        <View style={styles.previewContainer}>
          <Image source={{ uri: photoUri }} style={styles.preview} />
          <TouchableOpacity
            style={styles.retakeButton}
            onPress={() => {
              setPhotoUri(null);
              setLocationValid(null);
            }}
          >
            <Text style={styles.retakeButtonText}>Choose Different Photo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.captureButtonContainer}>
          <TouchableOpacity
            style={[styles.captureButton, checking && styles.captureButtonDisabled]}
            onPress={handleTakePhoto}
            disabled={checking}
          >
            {checking ? (
              <ActivityIndicator size="large" color={theme.colors.text} />
            ) : (
              <>
                <Text style={styles.captureIcon}>📷</Text>
                <Text style={styles.captureText}>Take Photo</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.galleryButton, checking && styles.captureButtonDisabled]}
            onPress={handleChooseFromGallery}
            disabled={checking}
          >
            <Text style={styles.captureIcon}>🖼️</Text>
            <Text style={styles.captureText}>Gallery</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Override button after max attempts */}
      {!overrideActive && attempts >= MAX_ATTEMPTS && !photoUri && (
        <TouchableOpacity
          style={styles.overrideButton}
          onPress={() => setOverrideActive(true)}
        >
          <Text style={styles.overrideButtonText}>
            I'm at the right location — Override
          </Text>
        </TouchableOpacity>
      )}

      {/* Confirm Button */}
      {photoUri && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.confirmButton, submitting && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={theme.colors.text} />
            ) : (
              <Text style={styles.confirmButtonText}>Confirm Delivery</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginBottom: theme.spacing.lg,
  },
  statusCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statusLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
  },
  statusText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  statusGood: {
    color: theme.colors.success,
  },
  statusBad: {
    color: theme.colors.error,
  },
  overrideText: {
    color: theme.colors.accent,
    fontSize: 12,
    marginTop: theme.spacing.sm,
    fontWeight: '600',
  },
  captureButtonContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    maxHeight: 300,
  },
  captureButton: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  galleryButton: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureIcon: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  captureText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  previewContainer: {
    flex: 1,
    maxHeight: 300,
  },
  preview: {
    flex: 1,
    borderRadius: theme.borderRadius.md,
    resizeMode: 'cover',
  },
  retakeButton: {
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  retakeButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  overrideButton: {
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  overrideButtonText: {
    color: theme.colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  bottomBar: {
    paddingTop: theme.spacing.md,
  },
  confirmButton: {
    backgroundColor: theme.colors.success,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
});
