import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { theme } from '../constants/theme';

interface OinkerLogoProps {
  size?: 'small' | 'medium' | 'large';
}

export default function OinkerLogo({ size = 'medium' }: OinkerLogoProps) {
  const fontSize = size === 'small' ? 32 : size === 'medium' ? 48 : 64;
  const imageSize = size === 'small' ? 60 : size === 'medium' ? 80 : 100;

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/oinker-logo.jpg')}
        style={[styles.image, { width: imageSize, height: imageSize }]}
        resizeMode="contain"
      />
      <Text style={[styles.name, { fontSize }]}>Oinker</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  image: {
    marginBottom: 12,
    borderRadius: 12,
  },
  name: {
    color: theme.colors.text,
    fontWeight: '900',
    letterSpacing: -1,
  },
});
