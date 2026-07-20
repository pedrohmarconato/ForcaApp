// src/components/ui/TextField.tsx
// Campo de texto do sistema. Substitui o TextInput do react-native-paper.
//
// Direção 02: o rótulo fica ACIMA do campo (estático, discreto) em vez de
// flutuar sobre a borda. O foco é sinalizado por uma borda neon fina — é um
// dos poucos usos legítimos do acento.

import React, { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

import theme from '../../theme/theme';

type TextFieldProps = TextInputProps & {
  label: string;
  /** Mensagem de erro; quando presente, a borda passa a sinalizar o erro. */
  error?: string | null;
  /** Exibe o botão de mostrar/ocultar senha. */
  secureToggle?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

const TextField = forwardRef<TextInput, TextFieldProps>(
  ({ label, error, secureToggle = false, containerStyle, style, ...inputProps }, ref) => {
    const [focused, setFocused] = useState(false);
    const [revealed, setRevealed] = useState(false);

    const hasError = !!error;

    return (
      <View style={[styles.container, containerStyle]}>
        <Text style={styles.label}>{label}</Text>

        <View
          style={[
            styles.inputWrap,
            focused && styles.inputWrapFocused,
            hasError && styles.inputWrapError,
          ]}
        >
          <TextInput
            ref={ref}
            // O rótulo é o nome acessível do campo; o placeholder continua livre
            // para exemplos de preenchimento.
            accessibilityLabel={label}
            placeholderTextColor={theme.colors.text.quiet}
            selectionColor={theme.colors.accent.main}
            {...inputProps}
            secureTextEntry={secureToggle ? !revealed : inputProps.secureTextEntry}
            onFocus={(event) => {
              setFocused(true);
              inputProps.onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              inputProps.onBlur?.(event);
            }}
            style={[styles.input, style]}
          />

          {secureToggle ? (
            <Pressable
              onPress={() => setRevealed((current) => !current)}
              accessibilityRole="button"
              accessibilityLabel={revealed ? 'Ocultar senha' : 'Mostrar senha'}
              hitSlop={10}
              style={styles.adornment}
            >
              <Feather
                name={revealed ? 'eye-off' : 'eye'}
                size={18}
                color={theme.colors.text.quiet}
              />
            </Pressable>
          ) : null}
        </View>

        {hasError ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  },
);

TextField.displayName = 'TextField';

const styles = StyleSheet.create({
  container: { marginBottom: theme.spacing.lg },
  label: {
    marginBottom: theme.spacing.xs,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.medium,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.hitTarget.regular,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border.subtle,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface.card,
  },
  inputWrapFocused: { borderColor: theme.colors.border.focus },
  inputWrapError: { borderColor: theme.colors.status.danger },
  input: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.md,
  },
  adornment: { paddingLeft: theme.spacing.sm },
  error: {
    marginTop: theme.spacing.xs,
    color: theme.colors.status.danger,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.sm,
  },
});

export default TextField;
