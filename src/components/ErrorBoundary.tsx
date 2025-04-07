import React, { ErrorInfo } from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import theme from '../theme/theme';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to monitoring service
    console.error('Erro capturado:', error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.errorTitle}>Ops! Algo deu errado</Text>
          <Text style={styles.errorMessage}>
            {this.state.error?.message || 'Erro desconhecido'}
          </Text>
          <Button 
            title="Tentar Novamente" 
            onPress={this.resetError} 
            color={theme.colors.primary} 
          />
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: theme.colors.background.primary,
  },
  errorTitle: {
    fontSize: 22,
    color: theme.colors.text.primary,
    marginBottom: 16,
  },
  errorMessage: {
    color: theme.colors.text.secondary,
    marginBottom: 16,
    textAlign: 'center',
  },
});

export default ErrorBoundary;