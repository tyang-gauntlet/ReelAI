import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MainStackParamList } from '../types';
import { FeedScreen } from '../../screens/main/FeedScreen';
import { ProfileScreen } from '../../screens/main/ProfileScreen';
import { SettingsScreen } from '../../screens/main/SettingsScreen';
import { MaterialIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';

const Tab = createBottomTabNavigator<MainStackParamList>();

export const MainStack = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#000',
          borderTopWidth: 1,
          borderTopColor: '#272729',
          height: Platform.OS === 'ios' ? 85 : 60,
          paddingBottom: Platform.OS === 'ios' ? 30 : 5,
          paddingTop: 5,
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#666',
        tabBarShowLabel: true,
      }}
    >
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="home" size={28} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person" size={28} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="settings" size={28} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}; 