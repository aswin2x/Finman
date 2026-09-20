import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '../../src/components/Icon';
import { useAuth } from '../../src/lib/auth';
import { fonts, palette } from '../../src/theme';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home' },
  { name: 'expenses', title: 'Expenses', icon: 'list' },
  { name: 'budget', title: 'Budget', icon: 'target' },
  { name: 'debts', title: 'Debts', icon: 'card' },
  { name: 'plan', title: 'Plan', icon: 'trend' },
];

export default function TabsLayout() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.ink} />
      </View>
    );
  }
  if (status === 'signed-out') return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: palette.ink,
        tabBarInactiveTintColor: palette.inkQuaternary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: { paddingTop: 6 },
        sceneStyle: { backgroundColor: palette.page },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused }) => (
              <Icon
                name={tab.icon}
                size={20}
                color={focused ? palette.ink : palette.inkQuaternary}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.page },
  tabBar: {
    backgroundColor: palette.page,
    borderTopColor: palette.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: Platform.OS === 'ios' ? 84 : 64,
    paddingBottom: Platform.OS === 'ios' ? 26 : 8,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabLabel: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0, marginTop: 3 },
});
