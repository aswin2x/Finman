/** Form fields wired for react-hook-form, with inline validation messages. */
import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';

import { Icon } from './Icon';
import { formatDate, parseISODate, toISODate } from '../lib/format';
import { haptics } from '../lib/motion';
import { fonts, palette, radius, spacing, typography } from '../theme';

function FieldShell({
  label,
  error,
  hint,
  children,
}: {
  label?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? (
        <Text style={[typography.label, { color: palette.inkTertiary, textTransform: 'uppercase' }]}>
          {label}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text style={[typography.caption, { color: palette.ink }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={[typography.caption, { color: palette.inkQuaternary }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------------- text */

interface TextFieldProps<T extends FieldValues> extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  hint?: string;
  error?: string;
}

export function TextField<T extends FieldValues>({ control, name, label, hint, error, ...rest }: TextFieldProps<T>) {
  const [focused, setFocused] = useState(false);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} hint={hint} error={error ?? fieldState.error?.message}>
          <TextInput
            value={field.value === null || field.value === undefined ? '' : String(field.value)}
            onChangeText={field.onChange}
            onBlur={() => {
              setFocused(false);
              field.onBlur();
            }}
            onFocus={() => setFocused(true)}
            placeholderTextColor={palette.inkQuaternary}
            style={[
              styles.input,
              focused && styles.inputFocused,
              (fieldState.error || error) && styles.inputError,
            ]}
            accessibilityLabel={label}
            {...rest}
          />
        </FieldShell>
      )}
    />
  );
}

/** The large amount input that anchors every money form. */
export function AmountField<T extends FieldValues>({
  control,
  name,
  label = 'Amount',
  autoFocus = false,
}: {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} error={fieldState.error?.message}>
          <View style={[styles.amountWrap, focused && styles.inputFocused]}>
            <Text style={styles.amountSymbol}>{'₹'}</Text>
            <TextInput
              value={field.value === null || field.value === undefined ? '' : String(field.value)}
              onChangeText={(text) => field.onChange(text.replace(/[^0-9.]/g, ''))}
              onBlur={() => {
                setFocused(false);
                field.onBlur();
              }}
              onFocus={() => setFocused(true)}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="0"
              placeholderTextColor={palette.inkQuaternary}
              autoFocus={autoFocus}
              style={styles.amountInput}
              accessibilityLabel={label}
            />
          </View>
        </FieldShell>
      )}
    />
  );
}

/* ------------------------------------------------------------------ options */

export interface Option {
  value: string;
  label: string;
}

/** A horizontal option picker. Wraps for short lists, scrolls for long ones. */
export function OptionField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  hint,
  scroll = false,
  allowClear = false,
}: {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  options: Option[];
  hint?: string;
  scroll?: boolean;
  allowClear?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const chips = options.map((option) => {
          const active = field.value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                haptics.select();
                field.onChange(allowClear && active ? null : option.value);
              }}
              style={({ pressed }) => [
                styles.option,
                active && styles.optionActive,
                pressed && !active && { backgroundColor: palette.surfaceSunken },
              ]}
            >
              <Text
                style={[
                  typography.captionMedium,
                  { color: active ? palette.inkInverse : palette.inkSecondary },
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        });

        return (
          <FieldShell label={label} hint={hint} error={fieldState.error?.message}>
            {scroll ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.xs, paddingRight: spacing.md }}
              >
                {chips}
              </ScrollView>
            ) : (
              <View style={styles.optionWrap}>{chips}</View>
            )}
          </FieldShell>
        );
      }}
    />
  );
}

/* --------------------------------------------------------------------- date */

/** A date field with quick offsets, avoiding a heavy native picker dependency. */
export function DateField<T extends FieldValues>({
  control,
  name,
  label = 'Date',
  hint,
}: {
  control: Control<T>;
  name: Path<T>;
  label?: string;
  hint?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const todayISO = toISODate(new Date());
        const yesterdayISO = toISODate(new Date(Date.now() - 86400000));
        const current = field.value ? parseISODate(String(field.value)) : new Date();

        const shift = (days: number) => {
          const next = new Date(current);
          next.setDate(next.getDate() + days);
          haptics.select();
          field.onChange(toISODate(next));
        };

        return (
          <FieldShell label={label} hint={hint} error={fieldState.error?.message}>
            <View style={styles.dateRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous day"
                onPress={() => shift(-1)}
                style={({ pressed }) => [styles.dateStep, pressed && { backgroundColor: palette.surfaceSunken }]}
              >
                <Icon name="minus" size={16} color={palette.inkSecondary} />
              </Pressable>
              <View style={styles.dateValue}>
                <Text style={[typography.bodyMedium, { color: palette.ink }]}>
                  {formatDate(String(field.value ?? todayISO))}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next day"
                onPress={() => shift(1)}
                style={({ pressed }) => [styles.dateStep, pressed && { backgroundColor: palette.surfaceSunken }]}
              >
                <Icon name="plus" size={16} color={palette.inkSecondary} />
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs }}>
              {[
                { label: 'Today', iso: todayISO },
                { label: 'Yesterday', iso: yesterdayISO },
              ].map((item) => {
                const active = field.value === item.iso;
                return (
                  <Pressable
                    key={item.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      haptics.select();
                      field.onChange(item.iso);
                    }}
                    style={[styles.option, active && styles.optionActive]}
                  >
                    <Text
                      style={[
                        typography.captionMedium,
                        { color: active ? palette.inkInverse : palette.inkSecondary },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </FieldShell>
        );
      }}
    />
  );
}

/* -------------------------------------------------------------------- toggle */

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
}: {
  control: Control<T>;
  name: Path<T>;
  label: string;
  hint?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <View style={styles.switchRow}>
          <View style={{ flex: 1, marginRight: spacing.md }}>
            <Text style={[typography.body, { color: palette.ink }]}>{label}</Text>
            {hint ? (
              <Text style={[typography.caption, { color: palette.inkQuaternary, marginTop: 3 }]}>{hint}</Text>
            ) : null}
          </View>
          <Switch
            value={Boolean(field.value)}
            onValueChange={(value) => {
              haptics.select();
              field.onChange(value);
            }}
            trackColor={{ false: palette.surfaceSunken, true: palette.ink }}
            thumbColor={Platform.OS === 'android' ? palette.white : undefined}
            ios_backgroundColor={palette.surfaceSunken}
            accessibilityLabel={label}
          />
        </View>
      )}
    />
  );
}

/** An uncontrolled segmented control, for filters outside forms. */
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              haptics.select();
              onChange(option.value);
            }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text
              style={[
                typography.captionMedium,
                { color: active ? palette.ink : palette.inkTertiary },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
    color: palette.ink,
    ...typography.body,
  },
  inputFocused: { borderColor: palette.ink },
  inputError: { borderColor: palette.ink, borderWidth: 1.5 },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceSubtle,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingHorizontal: spacing.lg,
    minHeight: 78,
  },
  amountSymbol: { ...typography.figure, color: palette.inkQuaternary, marginRight: spacing.xs },
  amountInput: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1,
    color: palette.ink,
    paddingVertical: spacing.sm,
  },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderStrong,
  },
  optionActive: { backgroundColor: palette.ink, borderColor: palette.ink },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderStrong,
    overflow: 'hidden',
  },
  dateStep: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  dateValue: { flex: 1, alignItems: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  segmented: {
    flexDirection: 'row',
    backgroundColor: palette.surfaceSunken,
    borderRadius: radius.pill,
    padding: 3,
  },
  segment: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.pill },
  segmentActive: { backgroundColor: palette.surface },
});
