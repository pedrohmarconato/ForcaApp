// src/components/ui/Button.tsx
import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacityProps,
  ViewStyle,
  TextStyle,
} from 'react-native';
import theme from '../../theme';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
  ...props
}) => {
  // Definir estilos com base nas props
  const getContainerStyle = () => {
    let containerStyle: ViewStyle = {};

    // Variantes
    switch (variant) {
      case 'primary':
        containerStyle = {
          backgroundColor: theme.colors.primary,
          borderWidth: 0,
        };
        break;
      case 'secondary':
        containerStyle = {
          backgroundColor: theme.colors.background.card, 
          borderWidth: 1,
          borderColor: theme.colors.border.primary,
        };
        break;
      case 'outline':
        containerStyle = {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: theme.colors.primary,
        };
        break;
    }

    // Tamanhos
    switch (size) {
      case 'small':
        containerStyle = {
          ...containerStyle,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: theme.spacing.borderRadius.sm,
        };
        break;
      case 'medium':
        containerStyle = {
          ...containerStyle,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: theme.spacing.borderRadius.md,
        };
        break;
      case 'large':
        containerStyle = {
          ...containerStyle,
          paddingVertical: 16,
          paddingHorizontal: 24,
          borderRadius: theme.spacing.borderRadius.lg,
        };
        break;
    }

    // Estados
    if (disabled) {
      containerStyle.opacity = 0.5;
    }

    return containerStyle;
  };

  // Definir estilos de texto com base nas props
  const getTextStyle = () => {
    let textStyle: TextStyle = {
      fontSize: theme.typography.size.md,
      fontFamily: theme.typography.fontFamily.semibold,
      textAlign: 'center',
    };

    // Variantes
    switch (variant) {
      case 'primary':
        textStyle.color = theme.colors.black.primary;
        break;
      case 'secondary':
        textStyle.color = theme.colors.text.primary;
        break;
      case 'outline':
        textStyle.color = theme.colors.primary;
        break;
    }

    // Tamanhos
    switch (size) {
      case 'small':
        textStyle.fontSize = theme.typography.size.sm;
        break;
      case 'medium':
        textStyle.fontSize = theme.typography.size.md;
        break;
      case 'large':
        textStyle.fontSize = theme.typography.size.lg;
        break;
    }

    return textStyle;
  };

  return (
    <TouchableOpacity
      style={[styles.container, getContainerStyle(), style]}
      disabled={disabled || loading}
      activeOpacity={0.8}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? theme.colors.black.primary : theme.colors.text.primary}
        />
      ) : (
        <React.Fragment>
          {leftIcon && <View style={styles.leftIconContainer}>{leftIcon}</View>}
          <Text style={[getTextStyle(), textStyle]}>{title}</Text>
          {rightIcon && <View style={styles.rightIconContainer}>{rightIcon}</View>}
        </React.Fragment>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 120,
  },
  leftIconContainer: {
    marginRight: theme.spacing.spacing.sm,
  },
  rightIconContainer: {
    marginLeft: theme.spacing.spacing.sm,
  },
});

export default Button;