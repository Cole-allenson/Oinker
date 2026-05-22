import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { CardField, useConfirmSetupIntent } from '@stripe/stripe-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../constants/theme';
import { api } from '../lib/api';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SetupCard'>;

export default function SetupCardScreen({ navigation }: Props) {
  const { confirmSetupIntent } = useConfirmSetupIntent();
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    // Get SetupIntent client secret from backend
    const fetchSetupIntent = async () => {
      try {
        const data = await api.createSetupIntent();
        setClientSecret(data.client_secret);
      } catch (err: any) {
        console.log('[SetupCard] Error:', err);
        Alert.alert('Error', 'Failed to initialize card setup.');
      }
    };
    fetchSetupIntent();
  }, []);

  const handleSaveCard = async () => {
    if (!clientSecret) return;

    setLoading(true);
    try {
      const { error } = await confirmSetupIntent(clientSecret, {
        paymentMethodType: 'Card',
      });

      if (error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Card Saved!', 'Your card has been saved for future orders.', [
          { text: 'OK', onPress: () => navigation.navigate('MainTabs') },
        ]);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save card.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Save Your Card</Text>
        <Text style={styles.subtitle}>
          Add a card so you can pay for deliveries easily
        </Text>
      </View>

      <View style={styles.cardContainer}>
        <CardField
          postalCodeEnabled={false}
          placeholders={{
            number: '4242 4242 4242 4242',
          }}
          cardStyle={{
            backgroundColor: theme.colors.surface,
            textColor: theme.colors.text,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 8,
          }}
          style={styles.cardField}
          onCardChange={(card) => {
            setCardComplete(card.complete);
          }}
        />
      </View>

      <TouchableOpacity
        style={[styles.saveButton, (!cardComplete || loading) && styles.saveButtonDisabled]}
        onPress={handleSaveCard}
        disabled={!cardComplete || loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Save Card</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.skipButton}
        onPress={() =>
          Alert.alert(
            'Card Required',
            'A saved card is required to place orders. You can add one later from your profile.',
            [
              { text: 'Add Card', style: 'default' },
              { text: 'Skip Anyway', style: 'destructive', onPress: () => navigation.navigate('MainTabs') },
            ]
          )
        }
      >
        <Text style={styles.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
  },
  header: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 16,
    marginTop: theme.spacing.sm,
  },
  cardContainer: {
    marginBottom: theme.spacing.xl,
  },
  cardField: {
    width: '100%',
    height: 50,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  skipText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
});
