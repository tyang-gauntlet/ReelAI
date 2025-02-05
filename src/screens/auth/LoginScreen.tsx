import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { AuthInput } from '../../components/auth/AuthInput';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../../config/firebase';
import { theme } from '../../styles/theme';

type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  Home: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const { login, error } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      setLoginLoading(true);
      await login(email, password);
      // Navigation will be handled by the auth state change
    } catch (err) {
      Alert.alert('Error', error || 'Failed to login');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    try {
      setDemoLoading(true);
      await login(DEMO_EMAIL, DEMO_PASSWORD);
    } catch (err) {
      Alert.alert('Error', error || 'Failed to login with demo account');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome Back!</Text>

      <AuthInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
      />

      <AuthInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
      />

      <TouchableOpacity
        style={styles.loginButton}
        onPress={handleLogin}
        disabled={loginLoading || demoLoading}
      >
        <Text style={styles.buttonText}>
          {loginLoading ? 'Logging in...' : 'Login'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.demoButton}
        onPress={handleDemoLogin}
        disabled={loginLoading || demoLoading}
      >
        <Text style={styles.demoButtonText}>
          {demoLoading ? 'Logging in...' : 'Use Demo Account'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.signupLink}
        onPress={() => navigation.navigate('Signup')}
      >
        <Text style={styles.signupText}>
          Don't have an account? Sign up
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
    color: theme.colors.text.primary,
  },
  loginButton: {
    backgroundColor: theme.colors.primary,
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  demoButton: {
    backgroundColor: theme.colors.accent,
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
  },
  buttonText: {
    color: theme.colors.text.inverse,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  demoButtonText: {
    color: theme.colors.text.inverse,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  signupLink: {
    marginTop: 20,
  },
  signupText: {
    color: theme.colors.primary,
    textAlign: 'center',
    fontSize: 14,
  },
}); 