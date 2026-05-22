import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { theme } from '../constants/theme';
import { api } from '../lib/api';

interface Props {
  orderId: string;
  visible: boolean;
  onDone: () => void;
}

export default function RatingModal({ orderId, visible, onDone }: Props) {
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (selected === 0) return;
    setLoading(true);
    try {
      await api.rateOrder(orderId, selected);
    } catch (err) {
      // ignore — backend UNIQUE constraint means a second submit is a no-op
    } finally {
      setLoading(false);
      onDone();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Rate Your Driver</Text>
          <Text style={styles.subtitle}>How was your delivery experience?</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => setSelected(star)}>
                <Text style={[styles.star, selected >= star && styles.starFilled]}>
                  ★
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.submitButton, selected === 0 && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={selected === 0 || loading}
          >
            {loading
              ? <ActivityIndicator color={theme.colors.text} />
              : <Text style={styles.submitText}>Submit Rating</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipButton} onPress={onDone}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  stars: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
  star: {
    fontSize: 44,
    color: theme.colors.border,
  },
  starFilled: {
    color: theme.colors.warning,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.xl,
    width: '100%',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  submitDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    paddingVertical: theme.spacing.sm,
  },
  skipText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
});
