import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '../src/lib/auth';
import { palette } from '../src/theme';

/** Routes to the app or the sign-in screen once the stored session is checked. */
export default function Index() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.root}>
        <ActivityIndicator color={palette.ink} />
      </View>
    );
  }

  return <Redirect href={status === 'authenticated' ? '/(tabs)' : '/login'} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.page },
});
