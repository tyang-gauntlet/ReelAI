import { NavigatorScreenParams } from '@react-navigation/native';
import { Video } from '../components/VideoFeed/VideoFeed';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type TabStackParamList = {
  Home: undefined;
  Profile: undefined;
};

export type MainStackParamList = {
  Tabs: NavigatorScreenParams<TabStackParamList>;
  Hashtag: {
    tag: string;
  };
};

export type RootStackParamList = {
  Loading: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList>;
  MainTabs: NavigatorScreenParams<MainStackParamList>;
};
