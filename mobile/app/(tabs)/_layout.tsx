import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { useAuth } from '../../src/lib/auth';
import { palette, spacing, typography } from '../../src/theme';

/** Minimal glyphs drawn with views, so no icon font ships with the app. */
function TabGlyph({ name, focused }: { name: string; focused: boolean }) {
  const tint = focused ? palette.ember : palette.textTertiary;

  if (name === 'home') {
    return (
      <View style={styles.glyph}>
        <View style={[styles.homeRoof, { borderBottomColor: tint }]} />
        <View style={[styles.homeBody, { borderColor: tint }]} />
      </View>
    );
  }
  if (name === 'expenses') {
    return (
      <View style={styles.glyph}>
        {[10, 16, 13].map((height, index) => (
          <View
            key={index}
            style={{
              width: 4,
              height,
              borderRadius: 2,
              backgroundColor: tint,
              marginHorizontal: 1.5,
              opacity: index === 1 ? 1 : 0.65,
            }}
          />
        ))}
      </View>
    );
  }
  if (name === 'budget') {
    return (
      <View style={styles.glyph}>
        <View style={[styles.ring, { borderColor: tint }]} />
      </View>
    );
  }
  if (name === 'debts') {
    return (
      <View style={styles.glyph}>
        <View style={[styles.cardGlyph, { borderColor: tint }]}>
          <View style={[styles.cardStripe, { backgroundColor: tint }]} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.glyph}>
      <View style={[styles.trendLine, { backgroundColor: tint }]} />
      <View style={[styles.trendDot, { backgroundColor: tint }]} />
    </View>
  );
}

export default function TabsLayout() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.ember} />
      </View>
    );
  }
  if (status === 'signed-out') return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: palette.ember,
        tabBarInactiveTintColor: palette.textTertiary,
        tabBarLabelStyle: { ...typography.micro, textTransform: 'none', marginTop: 2 },
        tabBarItemStyle: { paddingVertical: spacing.xs },
        sceneStyle: { backgroundColor: palette.void },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabGlyph name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Expenses',
          tabBarIcon: ({ focused }) => <TabGlyph name="expenses" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          title: 'Budget',
          tabBarIcon: ({ focused }) => <TabGlyph name="budget" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="debts"
        options={{
          title: 'Debts',
          tabBarIcon: ({ focused }) => <TabGlyph name="debts" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ focused }) => <TabGlyph name="plan" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.void },
  tabBar: {
    backgroundColor: palette.base,
    borderTopColor: palette.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: Platform.OS === 'ios' ? 86 : 68,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 26 : 8,
  },
  glyph: { width: 22, height: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  homeRoof: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  homeBody: { position: 'absolute', bottom: 1, width: 13, height: 10, borderWidth: 1.6, borderRadius: 2 },
  ring: { width: 17, height: 17, borderRadius: 9, borderWidth: 2 },
  cardGlyph: { width: 19, height: 13, borderRadius: 3, borderWidth: 1.6, justifyContent: 'center' },
  cardStripe: { height: 1.8, width: '100%', opacity: 0.8 },
  trendLine: { width: 17, height: 1.8, borderRadius: 1, transform: [{ rotate: '-24deg' }] },
  trendDot: { position: 'absolute', right: 1, top: 3, width: 5, height: 5, borderRadius: 3 },
});
