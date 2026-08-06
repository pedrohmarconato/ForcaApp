// src/components/ui/NumericField.tsx
// Campo numérico que guarda o TEXTO digitado, não o número.
//
// Um campo controlado por `value={String(numero)}` reconstrói o texto a partir
// do número a cada tecla, e aí o separador decimal nunca sobrevive: o aluno
// digita "0,75" e o campo recebe "0" -> "0" (a vírgula some) -> "07" -> "075".
// O rascunho gravava 75 minutos para uma prancha de 45 segundos, sem aviso
// nenhum — e o piso de 0,25 min que a própria tela anuncia ficava impossível
// de digitar. Aqui o estado da verdade é o texto; o número é derivado dele.
//
// A ressincronização só acontece quando o valor chega DE FORA (troca de
// exercício, rascunho relido do storage), nunca em resposta ao que foi digitado
// — do contrário o texto incompleto ("0,") seria reescrito no meio da digitação.

import React, { useEffect, useRef, useState } from 'react';
import type { StyleProp, TextInputProps, ViewStyle } from 'react-native';

import TextField from './TextField';

type NumericFieldProps = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  label: string;
  value: number | null;
  onChangeNumber: (value: number | null) => void;
  /** Aceita apenas inteiros: o separador decimal é descartado na digitação. */
  integer?: boolean;
  /**
   * Texto a exibir quando o valor chega DE FORA (nunca durante a digitação).
   * O campo "Outro descanso" usa isto para esvaziar quando um preset é
   * escolhido, sem precisar zerar o texto no meio de quem está digitando.
   */
  formatExternal?: (value: number | null) => string;
  error?: string | null;
  containerStyle?: StyleProp<ViewStyle>;
};

const SEPARADORES = [',', '.'];

/**
 * Mantém dígitos e NO MÁXIMO um separador decimal. Qualquer outro caractere é
 * descartado em vez de zerar o campo, para o texto nunca dar um salto sob os
 * dedos de quem digita.
 */
export const sanitizeNumericText = (raw: string, integer = false): string => {
  let out = '';
  let jaTemSeparador = false;
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      out += ch;
      continue;
    }
    if (!integer && SEPARADORES.includes(ch) && !jaTemSeparador) {
      jaTemSeparador = true;
      out += ch;
    }
  }
  return out;
};

/**
 * Número correspondente ao texto, ou null quando ainda não há número algum.
 * Texto incompleto ("0,") vale pelo prefixo já digitado — o aluno está no meio
 * da palavra, não errado.
 */
export const numericTextToNumber = (text: string): number | null => {
  const normalizado = text.replace(',', '.');
  if (!normalizado || normalizado === '.') return null;
  const parsed = Number(normalizado);
  return Number.isFinite(parsed) ? parsed : null;
};

const textoDoValor = (value: number | null): string => (value == null ? '' : String(value));

const NumericField = ({
  label,
  value,
  onChangeNumber,
  integer = false,
  formatExternal,
  error,
  containerStyle,
  ...inputProps
}: NumericFieldProps) => {
  const exibir = formatExternal ?? textoDoValor;
  const [text, setText] = useState(() => exibir(value));
  // Último número que ESTE campo emitiu. Serve para distinguir "o valor mudou
  // porque eu digitei" de "o valor mudou lá fora".
  const emitido = useRef<number | null>(value);

  useEffect(() => {
    if (value !== emitido.current) {
      emitido.current = value;
      setText(exibir(value));
    }
    // `exibir` é recriado a cada render quando vem inline; só o valor deve
    // disparar a ressincronização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChangeText = (raw: string) => {
    const limpo = sanitizeNumericText(raw, integer);
    setText(limpo);
    const numero = numericTextToNumber(limpo);
    emitido.current = numero;
    onChangeNumber(numero);
  };

  return (
    <TextField
      {...inputProps}
      label={label}
      error={error}
      containerStyle={containerStyle}
      value={text}
      onChangeText={handleChangeText}
    />
  );
};

export default NumericField;
