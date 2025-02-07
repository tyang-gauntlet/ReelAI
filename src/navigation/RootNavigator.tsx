import React, { useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { AuthNavigator } from './AuthNavigator';
import { useAuth } from '../hooks/useAuth';
import { View, ActivityIndicator, Platform, Pressable, Animated, PanResponder, Dimensions } from 'react-native';
import { HomeScreen } from '../screens/HomeScreen';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { HashtagScreen } from '../screens/main/HashtagScreen';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../styles/theme';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

export type RootStackParamList = {
  Auth: undefined;
  MainTabs: undefined;
  Hashtag: undefined;
  Tabs: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

type RouteConfig = {
  name: keyof MainTabParamList;
  icon: 'home' | 'person';
};

const SCREEN_WIDTH = Dimensions.get('window').width;
const DOT_SIZE = 12;
const EXPANDED_SIZE = 44;
const SPACING = 16;
const ACTIVE_SCALE = 1.4;

const CustomTabBar: React.FC<BottomTabBarProps> = ({ state, navigation }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;
  const activeIndexAnim = useRef(new Animated.Value(state.index)).current;
  const longPressTimeout = useRef<NodeJS.Timeout | null>(null);

  const routes: RouteConfig[] = [
    { name: 'Home', icon: 'home' },
    { name: 'Profile', icon: 'person' }
  ];

  const scaleAnims = useRef(routes.map(() => new Animated.Value(0))).current;

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (_, gestureState) => {
      longPressTimeout.current = setTimeout(() => {
        expandMenu();
      }, 150);
    },
    onPanResponderMove: (_, gestureState) => {
      if (isExpanded) {
        const itemWidth = EXPANDED_SIZE + SPACING;
        const totalWidth = itemWidth * routes.length;
        const startX = (SCREEN_WIDTH - totalWidth) / 2;
        const x = gestureState.moveX - startX;
        const index = Math.min(Math.max(Math.floor(x / itemWidth), 0), routes.length - 1);

        Animated.spring(activeIndexAnim, {
          toValue: index,
          useNativeDriver: true,
          tension: 300,
          friction: 20,
        }).start();
      }
    },
    onPanResponderRelease: (_, gestureState) => {
      if (longPressTimeout.current) {
        clearTimeout(longPressTimeout.current);
      }
      if (isExpanded) {
        const itemWidth = EXPANDED_SIZE + SPACING;
        const totalWidth = itemWidth * routes.length;
        const startX = (SCREEN_WIDTH - totalWidth) / 2;
        const x = gestureState.moveX - startX;
        const newIndex = Math.min(Math.max(Math.floor(x / itemWidth), 0), routes.length - 1);

        if (newIndex !== state.index) {
          navigation.navigate(routes[newIndex].name);
        }
        collapseMenu();
      }
    },
    onPanResponderTerminate: () => {
      if (longPressTimeout.current) {
        clearTimeout(longPressTimeout.current);
      }
      if (isExpanded) {
        collapseMenu();
      }
    },
  });

  const expandMenu = () => {
    setIsExpanded(true);
    Animated.parallel([
      Animated.spring(expandAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 300,
        friction: 20,
      }),
      ...scaleAnims.map((anim, i) =>
        Animated.spring(anim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 300,
          friction: 20,
          delay: i * 50,
        })
      ),
    ]).start();
  };

  const collapseMenu = () => {
    Animated.parallel([
      Animated.spring(expandAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 300,
        friction: 20,
      }),
      ...scaleAnims.map((anim, i) =>
        Animated.spring(anim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 300,
          friction: 20,
        })
      ),
    ]).start(() => setIsExpanded(false));
  };

  return (
    <View
      style={{
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 120 : 115,
        left: 0,
        right: 0,
        alignItems: 'center',
      }}
    >
      {isExpanded && (
        <Pressable
          style={{
            position: 'absolute',
            top: -1000,
            left: -1000,
            right: -1000,
            bottom: -1000,
            backgroundColor: 'transparent',
          }}
          onPress={collapseMenu}
        />
      )}

      <View {...panResponder.panHandlers}>
        {/* Collapsed dots */}
        <View style={{
          flexDirection: 'row',
          opacity: isExpanded ? 0 : 1,
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
          padding: 6,
          borderRadius: 10,
        }}>
          {routes.map((route, index) => (
            <Pressable
              key={route.name}
              onPress={expandMenu}
              delayLongPress={150}
              onLongPress={expandMenu}
              style={{
                width: DOT_SIZE + 8,
                height: DOT_SIZE + 8,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  borderRadius: DOT_SIZE / 2,
                  backgroundColor: state.index === index ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={route.icon}
                  size={DOT_SIZE - 2}
                  color={state.index === index ? '#fff' : 'rgba(255, 255, 255, 0.4)'}
                />
              </View>
            </Pressable>
          ))}
        </View>

        {/* Expanded dock */}
        {isExpanded && (
          <Animated.View
            style={{
              position: 'absolute',
              bottom: 35,
              left: 0,
              right: 0,
              alignItems: 'center',
            }}
          >
            <Animated.View
              style={{
                flexDirection: 'row',
                backgroundColor: 'rgba(28, 28, 30, 0.92)',
                borderRadius: 20,
                padding: 8,
                paddingHorizontal: 10,
                transform: [{
                  translateY: expandAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [15, 0],
                  })
                }],
                opacity: expandAnim,
                shadowColor: '#000',
                shadowOffset: {
                  width: 0,
                  height: 4,
                },
                shadowOpacity: 0.25,
                shadowRadius: 10,
                elevation: 8,
              }}
            >
              {routes.map((route, index) => {
                const isActive = state.index === index;
                const baseScale = scaleAnims[index].interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.7, 1],
                });

                const hoverScale = Animated.multiply(
                  activeIndexAnim.interpolate({
                    inputRange: [index - 1, index, index + 1],
                    outputRange: [1, ACTIVE_SCALE, 1],
                    extrapolate: 'clamp',
                  }),
                  expandAnim
                );

                const finalScale = Animated.multiply(baseScale, hoverScale);

                return (
                  <Animated.View
                    key={route.name}
                    style={{
                      marginHorizontal: SPACING / 2,
                      transform: [
                        { scale: finalScale }
                      ],
                    }}
                  >
                    <Pressable
                      onPress={() => {
                        if (state.index !== index) {
                          navigation.navigate(route.name);
                        }
                        collapseMenu();
                      }}
                      style={{
                        width: EXPANDED_SIZE,
                        height: EXPANDED_SIZE,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons
                        name={(route.icon + (isActive ? '' : '-outline')) as keyof typeof Ionicons.glyphMap}
                        size={28}
                        color="#fff"
                        style={{
                          opacity: isActive ? 1 : 0.8,
                        }}
                      />
                    </Pressable>
                  </Animated.View>
                );
              })}
            </Animated.View>
          </Animated.View>
        )}
      </View>
    </View>
  );
};

const MainTabs = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="Hashtag" component={HashtagScreen} />
    </Stack.Navigator>
  );
};

const TabNavigator = () => {
  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

export const RootNavigator = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="MainTabs" component={MainTabs} />
        ) : (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}; 