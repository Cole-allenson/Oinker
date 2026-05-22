import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../constants/theme';
import { api } from '../lib/api';
import { RootStackParamList } from '../navigation/types';
import { useUser } from '../context/UserContext';

interface Conversation {
  orderId: string;
  otherName: string;
  lastMessage: string;
  lastMessageTime: string;
  status: string;
}

export default function InboxScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { role } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    try {
      const orders = await api.getOrders();
      // Filter to active orders (accepted, picked_up, in_progress)
      const activeOrders = orders.filter((o: any) =>
        ['accepted', 'picked_up', 'in_progress'].includes(o.status)
      );

      // Fetch messages for all active orders in parallel
      const results = await Promise.all(
        activeOrders.map(async (order: any) => {
          try {
            const messages = await api.getMessages(order.id);
            if (messages.length > 0) {
              const lastMsg = messages[messages.length - 1];
              return {
                orderId: order.id,
                otherName: role === 'driver' ? 'Eater' : 'Driver',
                lastMessage: lastMsg.content,
                lastMessageTime: lastMsg.created_at,
                status: order.status,
              } as Conversation;
            }
          } catch {}
          return null;
        })
      );
      const convos = results.filter((c): c is Conversation => c !== null);

      // Sort by most recent message
      convos.sort((a, b) =>
        new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
      );

      setConversations(convos);
    } catch (err) {
      console.log('[Inbox] Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [fetchConversations])
  );

  const renderConversation = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={styles.conversationCard}
      onPress={() => navigation.navigate('Chat', {
        orderId: item.orderId,
        otherName: item.otherName,
      })}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {role === 'driver' ? '🍽️' : '🚗'}
        </Text>
      </View>
      <View style={styles.conversationInfo}>
        <View style={styles.conversationHeader}>
          <Text style={styles.otherName}>{item.otherName}</Text>
          <Text style={styles.time}>
            {new Date(item.lastMessageTime).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {item.lastMessage}
        </Text>
        <Text style={styles.orderStatus}>
          Order #{item.orderId.slice(0, 8)} • {item.status}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Messages</Text>
      <FlatList
        data={conversations}
        renderItem={renderConversation}
        keyExtractor={(item) => item.orderId}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>No active conversations</Text>
            <Text style={styles.emptySubtext}>
              Messages will appear here when you have active orders
            </Text>
          </View>
        }
      />
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
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  listContent: {
    padding: theme.spacing.md,
  },
  conversationCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  avatarText: {
    fontSize: 24,
  },
  conversationInfo: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  otherName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  time: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  lastMessage: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginBottom: 2,
  },
  orderStatus: {
    color: theme.colors.textMuted,
    fontSize: 12,
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
    textAlign: 'center',
  },
});
