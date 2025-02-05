import { NavigatorScreenParams } from '@react-navigation/native';
import { Video } from '../components/VideoFeed/VideoFeed';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type TabStackParamList = {
  Feed:
    | {
        initialVideo?: Video;
        showPlayer?: boolean;
      }
    | undefined;
  Profile: undefined;
  Settings: undefined;
};

export type MainStackParamList = {
  Feed: undefined;
  Profile: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Loading: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainStackParamList>;
};
