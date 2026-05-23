import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { theme } from '../constants/theme';
import { api } from '../lib/api';
import { startBackgroundLocation } from '../lib/backgroundLocation';
import { supabase } from '../lib/supabase';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useUser } from '../context/UserContext';
import { RootStackParamList } from '../navigation/types';
import RatingModal from '../components/RatingModal';

interface Order {
  id: string;
  driver_id: string | null;
  status: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  price: number | null;
  delivery_instructions: string | null;
  photo_url: string | null;
  payment_method: string;
  platform_fee: number;
  processing_fee: number | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  pending: theme.colors.textMuted,
  accepted: theme.colors.primary,
  picked_up: theme.colors.accent,
  in_progress: theme.colors.primary,
  delivered: theme.colors.success,
  cancelled: theme.colors.error,
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  picked_up: 'Picked Up',
  in_progress: 'In Progress',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const ORDER_STEPS = ['pending', 'accepted', 'picked_up', 'delivered'] as const;

export default function OrdersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { role } = useUser();
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [fullScreenPhoto, setFullScreenPhoto] = useState<string | null>(null);
  const [ratingOrderId, setRatingOrderId] = useState<string | null>(null);
  const ratedOrderIds = useRef<Set<string>>(new Set());
  const sectionListRef = useRef<SectionList>(null);
  const prevPendingCount = useRef(0);

  const statusOrder: Record<string, number> = { delivered: 4, picked_up: 3, in_progress: 3, accepted: 2, pending: 1, cancelled: 0 };

  const sortOrders = (orders: Order[]) => {
    return [...orders].sort((a, b) => {
      const diff = (statusOrder[b.status] || 0) - (statusOrder[a.status] || 0);
      if (diff !== 0) return diff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  };

  const fetchOrders = useCallback(async () => {
    try {
      const data = await api.getOrders();
      setOrders(sortOrders(data));
      if (role === 'driver') {
        const pending = await api.getPendingOrders();
        setPendingOrders(pending);
      }
    } catch (err) {
      console.log('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useFocusEffect(
    useCallback(() => {
      fetchOrders();

      const channels: ReturnType<typeof supabase.channel>[] = [];

      if (role === 'eater') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session?.user?.id) return;
          const ch = supabase
            .channel('orders-eater')
            .on('postgres_changes', {
              event: '*',
              schema: 'public',
              table: 'orders',
              filter: `eater_id=eq.${session.user.id}`,
            }, fetchOrders)
            .subscribe();
          channels.push(ch);
        });
      } else {
        // Drivers need all pending orders (new work) + their assigned orders
        const ch = supabase
          .channel('orders-driver')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
          .subscribe();
        channels.push(ch);
      }

      return () => {
        channels.forEach(ch => supabase.removeChannel(ch));
      };
    }, [fetchOrders, role])
  );

  // Auto-scroll and notify when new pending orders arrive for drivers
  useEffect(() => {
    if (role === 'driver' && pendingOrders.length > prevPendingCount.current) {
      sectionListRef.current?.scrollToLocation({
        sectionIndex: 0,
        itemIndex: 0,
        animated: true,
      });
      // Notify driver of new delivery offer
      Notifications.scheduleNotificationAsync({
        content: {
          title: '🚗 New Delivery Offer!',
          body: 'A new delivery request is available. Tap to view.',
          data: { screen: 'Orders' },
        },
        trigger: null,
      });
    }
    prevPendingCount.current = pendingOrders.length;
  }, [pendingOrders.length, role]);

  // Track previous order states for eater notifications
  const prevOrderStatuses = useRef<Record<string, string>>({});
  useEffect(() => {
    if (role === 'eater') {
      for (const order of orders) {
        const prevStatus = prevOrderStatuses.current[order.id];
        if (prevStatus && prevStatus !== order.status) {
          if (order.status === 'accepted') {
            Notifications.scheduleNotificationAsync({
              content: {
                title: '🎉 Order Accepted!',
                body: 'Your delivery has been accepted and is on the way!',
                data: { screen: 'Orders' },
              },
              trigger: null,
            });
          } else if (order.status === 'picked_up') {
            Notifications.scheduleNotificationAsync({
              content: {
                title: '🍔 Food Picked Up!',
                body: 'Your order has been picked up and is on its way!',
                data: { screen: 'Orders' },
              },
              trigger: null,
            });
          } else if (order.status === 'delivered') {
            Notifications.scheduleNotificationAsync({
              content: {
                title: '🍔 Food Delivered!',
                body: 'Your order has been delivered. Enjoy!',
                data: { screen: 'Orders' },
              },
              trigger: null,
            });
            if (!ratedOrderIds.current.has(order.id)) {
              setRatingOrderId(order.id);
            }
          }
        }
        prevOrderStatuses.current[order.id] = order.status;
      }
    }
  }, [orders, role]);

  const handleAction = async (orderId: string, status: string) => {
    setActionLoading(orderId);
    try {
      await api.updateOrder(orderId, { status });
      // Force driver online when accepting or picking up
      if (role === 'driver' && (status === 'accepted' || status === 'picked_up')) {
        try {
          await api.updateDriverProfile({ is_online: true });
          await startBackgroundLocation();
        } catch {}
      }
      await fetchOrders();

      if (status === 'picked_up') {
        Alert.alert('Picked Up', 'Now head to the dropoff location.');
      } else if (status === 'accepted') {
        Alert.alert('Accepted', 'Head to the restaurant to pick up the order.');
      }
    } catch (err: any) {
      const isDecline = err.message?.toLowerCase().includes('card declined') ||
        err.message?.toLowerCase().includes('declined');
      if (status === 'accepted' && isDecline) {
        Alert.alert(
          'Payment Failed',
          "The eater's card was declined. This order has been removed from the queue.",
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', err.message || 'Failed to update order.');
      }
      await fetchOrders();
    } finally {
      setActionLoading(null);
    }
  };

  const handleNavigate = (order: Order) => {
    Alert.alert('Navigate', 'Choose a navigation app', [
      {
        text: 'Google Maps',
        onPress: () => {
          const url = `https://www.google.com/maps/dir/?api=1&destination=${order.dropoff_lat},${order.dropoff_lng}&origin=${order.pickup_lat},${order.pickup_lng}`;
          Linking.openURL(url);
        },
      },
      {
        text: 'Apple Maps',
        onPress: () => {
          const url = `http://maps.apple.com/?daddr=${order.dropoff_lat},${order.dropoff_lng}&saddr=${order.pickup_lat},${order.pickup_lng}`;
          Linking.openURL(url);
        },
      },
      {
        text: 'Dropoff Only',
        onPress: () => {
          const scheme = Platform.select({
            ios: `maps:0,0?q=${order.dropoff_lat},${order.dropoff_lng}`,
            android: `geo:0,0?q=${order.dropoff_lat},${order.dropoff_lng}`,
          });
          if (scheme) Linking.openURL(scheme);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const getAction = (order: Order) => {
    if (role !== 'driver') return null;
    if (actionLoading === order.id) {
      return <ActivityIndicator size="small" color={theme.colors.primary} />;
    }
    switch (order.status) {
      case 'pending':
        return (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleAction(order.id, 'accepted')}
          >
            <Text style={styles.actionButtonText}>Accept</Text>
          </TouchableOpacity>
        );
      case 'accepted':
        return (
          <View style={styles.actionColumn}>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.navigateButton}
                onPress={() => handleNavigate(order)}
              >
                <Text style={styles.navigateButtonText}>Navigate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.messageButton}
                onPress={() => navigation.navigate('Chat', {
                  orderId: order.id,
                  otherName: 'Eater',
                })}
              >
                <Text style={styles.messageButtonText}>Message</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleAction(order.id, 'picked_up')}
            >
              <Text style={styles.actionButtonText}>Confirm Pickup</Text>
            </TouchableOpacity>
          </View>
        );
      case 'picked_up':
        return (
          <View style={styles.actionColumn}>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.navigateButton}
                onPress={() => handleNavigate(order)}
              >
                <Text style={styles.navigateButtonText}>Navigate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.messageButton}
                onPress={() => navigation.navigate('Chat', {
                  orderId: order.id,
                  otherName: 'Eater',
                })}
              >
                <Text style={styles.messageButtonText}>Message</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonSuccess]}
              onPress={() => navigation.navigate('DeliveryConfirmation', {
                order: {
                  id: order.id,
                  pickup_address: order.pickup_address,
                  pickup_lat: order.pickup_lat,
                  pickup_lng: order.pickup_lng,
                  dropoff_address: order.dropoff_address,
                  dropoff_lat: order.dropoff_lat,
                  dropoff_lng: order.dropoff_lng,
                },
              })}
            >
              <Text style={styles.actionButtonText}>Complete with Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.colors.warning, marginTop: 8 }]}
              onPress={() => {
                Alert.alert(
                  'Confirm Handoff',
                  'Did you hand the order directly to the customer?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Yes', onPress: () => handleAction(order.id, 'delivered') },
                  ]
                );
              }}
            >
              <Text style={styles.actionButtonText}>Handed to Customer</Text>
            </TouchableOpacity>
          </View>
        );
      case 'in_progress':
        return (
          <View style={styles.actionColumn}>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.navigateButton}
                onPress={() => handleNavigate(order)}
              >
                <Text style={styles.navigateButtonText}>Navigate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.messageButton}
                onPress={() => navigation.navigate('Chat', {
                  orderId: order.id,
                  otherName: 'Eater',
                })}
              >
                <Text style={styles.messageButtonText}>Message</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonSuccess]}
              onPress={() => navigation.navigate('DeliveryConfirmation', {
                order: {
                  id: order.id,
                  pickup_address: order.pickup_address,
                  pickup_lat: order.pickup_lat,
                  pickup_lng: order.pickup_lng,
                  dropoff_address: order.dropoff_address,
                  dropoff_lat: order.dropoff_lat,
                  dropoff_lng: order.dropoff_lng,
                },
              })}
            >
              <Text style={styles.actionButtonText}>Complete Delivery</Text>
            </TouchableOpacity>
          </View>
        );
      default:
        return null;
    }
  };

  const activeOrder = role === 'eater'
    ? orders.find(o => ['accepted', 'picked_up'].includes(o.status))
    : null;

  const renderTrackingCard = () => {
    if (!activeOrder) return null;
    const currentStep = ORDER_STEPS.indexOf(activeOrder.status as typeof ORDER_STEPS[number]);

    return (
      <View style={styles.trackingCard}>
        <Text style={styles.trackingTitle}>Active Delivery</Text>
        <Text style={styles.trackingAddress} numberOfLines={1}>
          From: {activeOrder.pickup_address}
        </Text>
        <View style={styles.trackingSteps}>
          {ORDER_STEPS.map((step, index) => {
            const isCompleted = index <= currentStep;
            const isCurrent = index === currentStep;
            return (
              <View key={step} style={styles.trackingStep}>
                <View style={[
                  styles.stepDot,
                  isCompleted && styles.stepDotCompleted,
                  isCurrent && styles.stepDotCurrent,
                ]}>
                  {isCompleted && <Text style={styles.stepCheck}>✓</Text>}
                </View>
                {index < ORDER_STEPS.length - 1 && (
                  <View style={[styles.stepLine, isCompleted && styles.stepLineCompleted]} />
                )}
              </View>
            );
          })}
        </View>
        <View style={styles.trackingLabels}>
          {ORDER_STEPS.map((step) => (
            <Text key={step} style={styles.stepLabel}>
              {statusLabels[step]}
            </Text>
          ))}
        </View>
        <TouchableOpacity
          style={styles.trackingMessageButton}
          onPress={() => navigation.navigate('Chat', {
            orderId: activeOrder.id,
            otherName: 'Driver',
          })}
        >
          <Text style={styles.trackingMessageButtonText}>Message Driver</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const showOrderDetails = (order: Order) => {
    const total = order.price && order.platform_fee
      ? (order.price + order.platform_fee + (order.processing_fee || 0)).toFixed(2)
      : 'N/A';

    const driverBody =
      `Status: ${statusLabels[order.status]}\n` +
      `From: ${order.pickup_address}\n` +
      `To: ${order.dropoff_address}\n` +
      `Your payout: $${order.price?.toFixed(2) || 'N/A'}\n` +
      (order.payment_method === 'cash' ? `Collect cash from customer\n` : `Card — no cash needed\n`) +
      `Ordered: ${new Date(order.created_at).toLocaleString()}`;

    const eaterBody =
      `Status: ${statusLabels[order.status]}\n` +
      `From: ${order.pickup_address}\n` +
      `To: ${order.dropoff_address}\n` +
      `Delivery: $${order.price?.toFixed(2) || 'N/A'}\n` +
      `Platform fee: $${order.platform_fee?.toFixed(2) || '0.00'}\n` +
      (order.processing_fee ? `Card fee: $${order.processing_fee.toFixed(2)}\n` : '') +
      `Total: $${total}\n` +
      `Payment: ${order.payment_method === 'card' ? '💳 Card' : '💵 Cash'}\n` +
      `Ordered: ${new Date(order.created_at).toLocaleString()}`;

    Alert.alert(
      `Order #${order.id.slice(0, 8)}`,
      role === 'driver' ? driverBody : eaterBody,
      [{ text: 'OK' }]
    );
  };

  const renderOrder = ({ item }: { item: Order }) => {
    const statusColor = statusColors[item.status] || theme.colors.textMuted;
    const statusLabel = statusLabels[item.status] || item.status;

    return (
      <View style={styles.orderCard}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => showOrderDetails(item)}
        >
          <View style={styles.orderHeader}>
            <Text style={styles.orderDate}>
              {new Date(item.created_at).toLocaleDateString()}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
          <View style={styles.orderDetails}>
            <View style={styles.routeContainer}>
              <View style={styles.dot} />
              <Text style={styles.routeText}>{item.pickup_address}</Text>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routeContainer}>
              <View style={[styles.dot, styles.dotEnd]} />
              <Text style={styles.routeText}>{item.dropoff_address}</Text>
            </View>
          </View>
          {item.delivery_instructions && (
            <View style={styles.instructionsBox}>
              <Text style={styles.instructionsLabel}>📝 Note:</Text>
              <Text style={styles.instructionsText}>{item.delivery_instructions}</Text>
            </View>
          )}
          <View style={styles.orderInfo}>
            {item.price !== null && (
              <Text style={styles.price}>
                {role === 'driver' ? `Payout: $${item.price.toFixed(2)}` : `$${item.price.toFixed(2)}`}
              </Text>
            )}
            <Text style={styles.paymentMethod}>
              {item.payment_method === 'card' ? '💳 Card' : '💵 Cash'}
            </Text>
            {role === 'eater' && item.platform_fee > 0 && (
              <Text style={styles.platformFee}>+${item.platform_fee.toFixed(2)} fee (15%)</Text>
            )}
            {role === 'eater' && item.processing_fee != null && item.processing_fee > 0 && (
              <Text style={styles.platformFee}>+${item.processing_fee.toFixed(2)} card fee</Text>
            )}
            {role === 'driver' && item.payment_method === 'cash' && item.price !== null && (
              <Text style={styles.platformFee}>Collect cash from customer</Text>
            )}
          </View>
        </TouchableOpacity>
        {item.status === 'delivered' && item.photo_url && (
          <TouchableOpacity
            style={styles.photoBox}
            onPress={() => setFullScreenPhoto(item.photo_url)}
          >
            <Text style={styles.photoLabel}>📸 Delivery Photo (tap to expand)</Text>
            <Image
              source={{ uri: item.photo_url }}
              style={styles.deliveryPhoto}
              resizeMode="cover"
            />
          </TouchableOpacity>
        )}
        {role === 'eater' && ['accepted', 'picked_up'].includes(item.status) && (
          <TouchableOpacity
            style={styles.messageButtonFull}
            onPress={() => navigation.navigate('Chat', {
              orderId: item.id,
              otherName: 'Driver',
            })}
          >
            <Text style={styles.messageButtonText}>💬 Message Driver</Text>
          </TouchableOpacity>
        )}
        {role === 'eater' && item.status === 'pending' && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              Alert.alert('Cancel Order', 'Are you sure you want to cancel this order?', [
                { text: 'Keep Order', style: 'cancel' },
                {
                  text: 'Cancel Order',
                  style: 'destructive',
                  onPress: () => handleAction(item.id, 'cancelled'),
                },
              ]);
            }}
          >
            <Text style={styles.cancelButtonText}>Cancel Order</Text>
          </TouchableOpacity>
        )}
        {getAction(item)}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // Driver view: sections with current delivery highlighted
  if (role === 'driver') {
    const activeOrders = orders.filter(o => ['accepted', 'picked_up', 'in_progress'].includes(o.status));
    const deliveredOrders = orders
      .filter(o => o.status === 'delivered')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Most recent active order is "Current Delivery"
    const currentDelivery = activeOrders.length > 0 ? [activeOrders[0]] : [];
    const otherActive = activeOrders.length > 1 ? activeOrders.slice(1) : [];

    const sections = [];
    if (currentDelivery.length > 0) {
      sections.push({ title: 'Current Delivery', data: currentDelivery });
    }
    if (pendingOrders.length > 0) {
      sections.push({ title: `Offers (${pendingOrders.length})`, data: pendingOrders });
    }
    if (otherActive.length > 0) {
      sections.push({ title: `Active (${otherActive.length})`, data: otherActive });
    }
    if (deliveredOrders.length > 0) {
      sections.push({ title: `Delivered (${deliveredOrders.length})`, data: deliveredOrders });
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Orders</Text>
        <SectionList
          ref={sectionListRef}
          sections={sections}
          renderItem={renderOrder}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>No orders available</Text>
              <Text style={styles.emptySubtext}>
                Go online to see incoming delivery requests
              </Text>
            </View>
          }
        />

        <Modal
          visible={!!fullScreenPhoto}
          transparent
          animationType="fade"
          onRequestClose={() => setFullScreenPhoto(null)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setFullScreenPhoto(null)}
          >
            <Image
              source={{ uri: fullScreenPhoto || '' }}
              style={styles.fullScreenPhoto}
              resizeMode="contain"
            />
          </Pressable>
        </Modal>
      </View>
    );
  }

  // Eater view: three sections
  const activeOrders = orders
    .filter(o => ['accepted', 'picked_up', 'in_progress'].includes(o.status))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const deliveredOrders = orders
    .filter(o => o.status === 'delivered')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const pendingOrdersEater = orders.filter(o => o.status === 'pending');

  const eaterSections = [];
  if (activeOrders.length > 0) {
    eaterSections.push({ title: `Active (${activeOrders.length})`, data: activeOrders });
  }
  if (pendingOrdersEater.length > 0) {
    eaterSections.push({ title: `Pending (${pendingOrdersEater.length})`, data: pendingOrdersEater });
  }
  if (deliveredOrders.length > 0) {
    eaterSections.push({ title: `Delivered (${deliveredOrders.length})`, data: deliveredOrders });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Orders</Text>
      {renderTrackingCard()}
      <SectionList
        sections={eaterSections}
        renderItem={renderOrder}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No orders yet</Text>
            <Text style={styles.emptySubtext}>
              Your delivery orders will appear here
            </Text>
          </View>
        }
      />

      {/* Full screen photo modal */}
      <Modal
        visible={!!fullScreenPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setFullScreenPhoto(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setFullScreenPhoto(null)}
        >
          <Image
            source={{ uri: fullScreenPhoto || '' }}
            style={styles.fullScreenPhoto}
            resizeMode="contain"
          />
        </Pressable>
      </Modal>

      {ratingOrderId && (
        <RatingModal
          orderId={ratingOrderId}
          visible={!!ratingOrderId}
          onDone={() => {
            ratedOrderIds.current.add(ratingOrderId);
            setRatingOrderId(null);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  listContent: {
    padding: theme.spacing.lg,
    paddingTop: 0,
  },
  orderCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  orderDate: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orderDetails: {
    marginBottom: theme.spacing.md,
  },
  routeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  dotEnd: {
    backgroundColor: theme.colors.accent,
  },
  routeLine: {
    width: 1,
    height: 20,
    backgroundColor: theme.colors.border,
    marginLeft: 3.5,
    marginVertical: 2,
  },
  routeText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    flex: 1,
  },
  instructionsBox: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  instructionsLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  instructionsText: {
    color: theme.colors.text,
    fontSize: 13,
  },
  photoBox: {
    marginBottom: theme.spacing.md,
  },
  photoLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  deliveryPhoto: {
    width: '100%',
    height: 150,
    borderRadius: theme.borderRadius.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenPhoto: {
    width: '100%',
    height: '80%',
  },
  orderInfo: {
    marginBottom: theme.spacing.sm,
  },
  price: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  paymentMethod: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  platformFee: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  actionColumn: {
    gap: theme.spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.md,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonSuccess: {
    backgroundColor: theme.colors.success,
  },
  actionButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  navigateButton: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  navigateButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  messageButton: {
    backgroundColor: theme.colors.primary + '20',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  messageButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  messageButtonFull: {
    backgroundColor: theme.colors.primary + '20',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    marginBottom: theme.spacing.sm,
  },
  cancelButton: {
    backgroundColor: theme.colors.error + '15',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.error,
    marginBottom: theme.spacing.sm,
  },
  cancelButtonText: {
    color: theme.colors.error,
    fontSize: 14,
    fontWeight: '600',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: theme.spacing.xl,
    paddingTop: theme.spacing.xl * 2,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  emptyText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtext: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginTop: theme.spacing.xs,
  },
  trackingCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  trackingTitle: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: theme.spacing.sm,
  },
  trackingAddress: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginBottom: theme.spacing.md,
  },
  trackingSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  trackingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  stepDotCompleted: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.success,
  },
  stepDotCurrent: {
    borderColor: theme.colors.primary,
    borderWidth: 3,
  },
  stepCheck: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: theme.colors.border,
    marginHorizontal: 4,
  },
  stepLineCompleted: {
    backgroundColor: theme.colors.success,
  },
  trackingLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    textAlign: 'center',
    flex: 1,
  },
  trackingMessageButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  trackingMessageButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
