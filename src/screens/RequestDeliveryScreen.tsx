import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  FlatList,
  Keyboard,
  Linking,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../constants/theme';
import { api } from '../lib/api';
import { RootStackParamList } from '../navigation/types';
import { searchNearbyRestaurants, searchRestaurants, PlaceResult } from '../lib/places';

type Props = NativeStackScreenProps<RootStackParamList, 'RequestDelivery'>;

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export default function RequestDeliveryScreen({ route, navigation }: Props) {
  const { driver } = route.params;

  const [dropoffLocation, setDropoffLocation] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<PlaceResult | null>(null);
  const [restaurants, setRestaurants] = useState<PlaceResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const PLATFORM_FEE_PERCENT = 0.15;
  const PLATFORM_FEE_MINIMUM = 2;
  const PROCESSING_FEE_RATE = 0.029;
  const MINIMUM_FEE = 2;

  // Auto-fill dropoff with current location and fetch nearby restaurants
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location permission is required.');
        setLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const [place] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      const address = place
        ? `${place.street || ''} ${place.city || ''}, ${place.region || ''}`.trim()
        : 'Current location';

      setDropoffLocation({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        address,
      });

      // Fetch nearby restaurants
      try {
        const results = await searchNearbyRestaurants(
          loc.coords.latitude,
          loc.coords.longitude,
        );
        setRestaurants(results);
      } catch (err) {
        console.log('Failed to fetch restaurants:', err);
      }

      setLoading(false);
    })();
  }, []);

  // Search for restaurants
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !dropoffLocation) return;
    Keyboard.dismiss();
    setSearching(true);
    try {
      const results = await searchRestaurants(
        searchQuery.trim(),
        dropoffLocation.lat,
        dropoffLocation.lng,
      );
      setRestaurants(results);
    } catch (err) {
      console.log('Search failed:', err);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, dropoffLocation]);

  // Select a restaurant
  const handleSelectRestaurant = (restaurant: PlaceResult) => {
    setSelectedRestaurant(restaurant);
  };

  // Distance from driver to restaurant
  const driverToRestaurant =
    selectedRestaurant
      ? haversineDistance(
          driver.latitude,
          driver.longitude,
          selectedRestaurant.lat,
          selectedRestaurant.lng,
        )
      : null;

  // Distance from restaurant to dropoff
  const restaurantToDropoff =
    selectedRestaurant && dropoffLocation
      ? haversineDistance(
          selectedRestaurant.lat,
          selectedRestaurant.lng,
          dropoffLocation.lat,
          dropoffLocation.lng,
        )
      : null;

  // Total distance (driver → restaurant → dropoff)
  const distance = driverToRestaurant !== null && restaurantToDropoff !== null
    ? driverToRestaurant + restaurantToDropoff
    : null;

  const estimatedPrice = distance ? Math.max(distance * driver.rate_per_mile, MINIMUM_FEE) : null;

  const platformFee = estimatedPrice ? Math.max(Math.round(estimatedPrice * PLATFORM_FEE_PERCENT * 100) / 100, PLATFORM_FEE_MINIMUM) : 0;

  // Card: processing fee on delivery fee. Cash: processing fee on platform fee only (charged to card).
  const processingFee = estimatedPrice
    ? paymentMethod === 'card'
      ? Math.round(estimatedPrice * PROCESSING_FEE_RATE * 100) / 100
      : Math.round(platformFee * PROCESSING_FEE_RATE * 100) / 100
    : 0;

  const total = estimatedPrice ? estimatedPrice + platformFee + processingFee : 0;
  const chargedToCard = paymentMethod === 'card' ? total : platformFee + processingFee;
  const paidToCash = paymentMethod === 'cash' && estimatedPrice ? estimatedPrice : 0;

  const handleConfirm = async () => {
    if (!selectedRestaurant || !dropoffLocation) {
      Alert.alert('Missing info', 'Please select a restaurant.');
      return;
    }

    setSubmitting(true);
    try {
      const order = await api.createOrder({
        pickup_address: `${selectedRestaurant.name}, ${selectedRestaurant.address}`,
        pickup_lat: selectedRestaurant.lat,
        pickup_lng: selectedRestaurant.lng,
        dropoff_address: dropoffLocation.address,
        dropoff_lat: dropoffLocation.lat,
        dropoff_lng: dropoffLocation.lng,
        delivery_instructions: instructions.trim() || undefined,
        payment_method: paymentMethod,
      });

      const message = paymentMethod === 'card'
        ? 'Your card will be charged the full amount when a driver accepts.'
        : 'Pay the driver in cash for the delivery. The platform fee will be charged to your card when a driver accepts.';
      Alert.alert('Order placed!', message, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderRestaurant = ({ item }: { item: PlaceResult }) => {
    const isSelected = selectedRestaurant?.place_id === item.place_id;
    return (
      <TouchableOpacity
        style={[styles.restaurantCard, isSelected && styles.restaurantCardSelected]}
        onPress={() => handleSelectRestaurant(item)}
      >
        <View style={styles.restaurantInfo}>
          <Text style={styles.restaurantName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.restaurantAddress} numberOfLines={1}>{item.address}</Text>
          <View style={styles.restaurantMeta}>
            {item.rating != null && item.rating > 0 && (
              <Text style={styles.restaurantRating}>{item.rating.toFixed(1)} ★</Text>
            )}
            {item.is_open !== null && (
              <Text style={[styles.restaurantOpen, !item.is_open && styles.restaurantClosed]}>
                {item.is_open ? 'Open' : 'Closed'}
              </Text>
            )}
          </View>
        </View>
        {isSelected && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Finding restaurants near you...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Driver Card */}
      <View style={styles.driverCard}>
        <View style={styles.driverAvatar}>
          <Text style={styles.driverAvatarText}>
            {driver.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.driverInfo}>
          <Text style={styles.driverName}>{driver.name.split(' ')[0]}</Text>
          <Text style={styles.driverDetails}>
            {driver.rating.toFixed(1)} ★ · ${driver.rate_per_mile.toFixed(2)}/mile
            {driver.distance !== undefined && ` · ${driver.distance.toFixed(1)} mi away`}
          </Text>
        </View>
      </View>

      {/* Delivering to */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>📍 Delivering to</Text>
        <View style={styles.addressBox}>
          <Text style={styles.addressText}>{dropoffLocation?.address}</Text>
        </View>
      </View>

      {/* Search restaurants */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>🏪 Select a restaurant</Text>
        {selectedRestaurant ? (
          <View style={styles.selectedRestaurantBox}>
            <View style={styles.selectedRestaurantInfo}>
              <Text style={styles.selectedRestaurantName}>{selectedRestaurant.name}</Text>
              <Text style={styles.selectedRestaurantAddress}>{selectedRestaurant.address}</Text>
            </View>
            <TouchableOpacity
              style={styles.changeButton}
              onPress={() => setSelectedRestaurant(null)}
            >
              <Text style={styles.changeButtonText}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search restaurants..."
              placeholderTextColor={theme.colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.searchButton} onPress={handleSearch} disabled={searching}>
              {searching ? (
                <ActivityIndicator size="small" color={theme.colors.text} />
              ) : (
                <Text style={styles.searchButtonText}>Search</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Restaurant list */}
      <FlatList
        data={restaurants}
        renderItem={renderRestaurant}
        keyExtractor={(item) => item.place_id}
        style={styles.restaurantList}
        contentContainerStyle={styles.restaurantListContent}
        scrollEnabled={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No restaurants found</Text>
            <Text style={styles.emptySubtext}>Try a different search term</Text>
          </View>
        }
      />

      {/* Bottom section: order yourself, instructions, estimate, confirm */}
      {selectedRestaurant && (
        <View style={styles.bottomSection}>
          {/* Order yourself prompt */}
          <View style={styles.orderYourselfCard}>
            <Text style={styles.orderYourselfTitle}>📞 Order your food first!</Text>
            <Text style={styles.orderYourselfText}>
              Visit {selectedRestaurant.name}'s app/website or call to place your order, then confirm your delivery below.
            </Text>
            <View style={styles.contactButtons}>
              {selectedRestaurant.website && (
                <TouchableOpacity
                  style={styles.contactButton}
                  onPress={() => Linking.openURL(selectedRestaurant.website!)}
                >
                  <Text style={styles.contactButtonText}>🌐 Website</Text>
                </TouchableOpacity>
              )}
              {selectedRestaurant.phone && (
                <TouchableOpacity
                  style={styles.contactButton}
                  onPress={() => Linking.openURL(`tel:${selectedRestaurant.phone}`)}
                >
                  <Text style={styles.contactButtonText}>📞 {formatPhone(selectedRestaurant.phone)}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Map preview */}
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              region={{
                latitude: (selectedRestaurant.lat + (dropoffLocation?.lat || 0)) / 2,
                longitude: (selectedRestaurant.lng + (dropoffLocation?.lng || 0)) / 2,
                latitudeDelta: Math.abs(selectedRestaurant.lat - (dropoffLocation?.lat || 0)) * 1.5 + 0.01,
                longitudeDelta: Math.abs(selectedRestaurant.lng - (dropoffLocation?.lng || 0)) * 1.5 + 0.01,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
            >
              <Marker
                coordinate={{ latitude: selectedRestaurant.lat, longitude: selectedRestaurant.lng }}
                title="Pickup"
                pinColor={theme.colors.accent}
              />
              {dropoffLocation && (
                <Marker
                  coordinate={{ latitude: dropoffLocation.lat, longitude: dropoffLocation.lng }}
                  title="Dropoff"
                  pinColor={theme.colors.primary}
                />
              )}
            </MapView>
          </View>

          {/* Instructions */}
          <TextInput
            style={styles.instructionsInput}
            placeholder="Delivery instructions (optional)"
            placeholderTextColor={theme.colors.textMuted}
            value={instructions}
            onChangeText={setInstructions}
            maxLength={200}
          />

          {/* Estimate */}
          {distance !== null && estimatedPrice !== null && (
            <View style={styles.estimateCard}>
              {driverToRestaurant !== null && (
                <View style={styles.estimateRow}>
                  <Text style={styles.estimateLabel}>Driver → Restaurant ({driverToRestaurant.toFixed(1)} mi)</Text>
                  <Text style={styles.estimatePrice}>${(driverToRestaurant * driver.rate_per_mile).toFixed(2)}</Text>
                </View>
              )}
              {restaurantToDropoff !== null && (
                <View style={styles.estimateRow}>
                  <Text style={styles.estimateLabel}>Restaurant → You ({restaurantToDropoff.toFixed(1)} mi)</Text>
                  <Text style={styles.estimatePrice}>${(restaurantToDropoff * driver.rate_per_mile).toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.estimateDivider} />
              <View style={styles.estimateRow}>
                <Text style={styles.estimateLabel}>Delivery fee ({distance.toFixed(1)} mi)</Text>
                <Text style={styles.estimatePrice}>${estimatedPrice.toFixed(2)}</Text>
              </View>
              <View style={styles.estimateRow}>
                <Text style={styles.estimateLabel}>Platform fee (15%)</Text>
                <Text style={styles.estimatePrice}>${platformFee.toFixed(2)}</Text>
              </View>
              {processingFee > 0 && (
                <View style={styles.estimateRow}>
                  <Text style={styles.estimateLabel}>Card processing</Text>
                  <Text style={styles.estimatePrice}>${processingFee.toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.estimateDivider} />
              {paymentMethod === 'cash' ? (
                <>
                  <View style={styles.estimateRow}>
                    <Text style={styles.estimateTotalLabel}>Pay driver (cash)</Text>
                    <Text style={styles.estimateTotalPrice}>${paidToCash.toFixed(2)}</Text>
                  </View>
                  <View style={styles.estimateRow}>
                    <Text style={styles.estimateTotalLabel}>Charged to card</Text>
                    <Text style={styles.estimateTotalPrice}>${chargedToCard.toFixed(2)}</Text>
                  </View>
                </>
              ) : (
                <View style={styles.estimateRow}>
                  <Text style={styles.estimateTotalLabel}>Total charged to card</Text>
                  <Text style={styles.estimateTotalPrice}>${chargedToCard.toFixed(2)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Payment Method */}
          <View style={styles.paymentSection}>
            <Text style={styles.paymentLabel}>Payment</Text>
            <View style={styles.paymentOptions}>
              <TouchableOpacity
                style={[styles.paymentOption, paymentMethod === 'cash' && styles.paymentOptionSelected]}
                onPress={() => setPaymentMethod('cash')}
              >
                <Text style={styles.paymentOptionIcon}>💵</Text>
                <Text style={[styles.paymentOptionText, paymentMethod === 'cash' && styles.paymentOptionTextSelected]}>Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.paymentOption, paymentMethod === 'card' && styles.paymentOptionSelected]}
                onPress={() => setPaymentMethod('card')}
              >
                <Text style={styles.paymentOptionIcon}>💳</Text>
                <Text style={[styles.paymentOptionText, paymentMethod === 'card' && styles.paymentOptionTextSelected]}>Card</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm */}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl * 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    color: theme.colors.textMuted,
    marginTop: theme.spacing.md,
    fontSize: 16,
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    margin: theme.spacing.md,
    marginBottom: 0,
  },
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  driverAvatarText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  driverDetails: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  sectionLabel: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  addressBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  addressText: {
    color: theme.colors.text,
    fontSize: 13,
  },
  searchRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  selectedRestaurantBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  selectedRestaurantInfo: {
    flex: 1,
  },
  selectedRestaurantName: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  selectedRestaurantAddress: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  changeButton: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  changeButtonText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  searchInput: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    fontSize: 14,
  },
  searchButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  restaurantList: {
    flex: 1,
    marginTop: theme.spacing.sm,
  },
  restaurantListContent: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  restaurantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  restaurantCardSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: 'rgba(0, 206, 201, 0.1)',
  },
  restaurantInfo: {
    flex: 1,
  },
  restaurantName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  restaurantAddress: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  restaurantMeta: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: 4,
  },
  restaurantRating: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  restaurantOpen: {
    color: theme.colors.success,
    fontSize: 12,
    fontWeight: '600',
  },
  restaurantClosed: {
    color: theme.colors.error,
  },
  checkmark: {
    color: theme.colors.accent,
    fontSize: 20,
    fontWeight: '700',
    marginLeft: theme.spacing.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  bottomSection: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  orderYourselfCard: {
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  orderYourselfTitle: {
    color: theme.colors.primary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  orderYourselfText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginBottom: theme.spacing.sm,
  },
  contactButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  contactButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    flex: 1,
    alignItems: 'center',
  },
  contactButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  mapContainer: {
    height: 120,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
  },
  map: {
    flex: 1,
  },
  instructionsInput: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    fontSize: 13,
    marginBottom: theme.spacing.sm,
  },
  estimateCard: {
    marginBottom: theme.spacing.sm,
  },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  estimateLabel: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  estimatePrice: {
    color: theme.colors.accent,
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  cashLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  estimateDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.sm,
  },
  estimateTotalLabel: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  estimateTotalPrice: {
    color: theme.colors.primary,
    fontSize: 20,
    fontWeight: '800',
    flex: 1,
    textAlign: 'right',
  },
  paymentSection: {
    marginBottom: theme.spacing.md,
  },
  paymentLabel: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.sm,
    borderWidth: 2,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  paymentOptionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '10',
  },
  paymentOptionIcon: {
    fontSize: 20,
  },
  paymentOptionText: {
    color: theme.colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  paymentOptionTextSelected: {
    color: theme.colors.primary,
  },
  confirmButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
