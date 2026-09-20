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

import { formatDate, parseISODate, toISODate } from '../lib/format';
import { haptics } from '../lib/motion';
import { palette, radius, spacing, typography } from '../theme';

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
      {label ? <Text style={[typography.micro, { color: palette.textTertiary }]}>{label.toUpperCase()}</Text> : null}
      {children}
      {error ? (
        <Text style={[typography.caption, { color: palette.negative }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={[typography.caption, { color: palette.textTertiary }]}>{hint}</Text>
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
            placeholderTextColor={palette.textTertiary}
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
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell label={label} error={fieldState.error?.message}>
          <View style={styles.amountWrap}>
            <Text style={styles.amountSymbol}>{'₹'}</Text>
            <TextInput
              value={field.value === null || field.value === undefined ? '' : String(field.value)}
              onChangeText={(text) => field.onChange(text.replace(/[^0-9.]/g, ''))}
              onBlur={field.onBlur}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="0"
              placeholderTextColor={palette.textTertiary}
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
  color?: string;
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
          const tint = option.color ?? palette.ember;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                haptics.select();
                field.onChange(allowClear && active ? null : option.value);
              }}
              style={[
                styles.option,
                active && { backgroundColor: `${tint}22`, borderColor: `${tint}66` },
              ]}
            >
              {option.color ? <View style={[styles.optionDot, { backgroundColor: option.color }]} /> : null}
              <Text style={[typography.caption, { color: active ? tint : palette.textSecondary }]} numberOfLines={1}>
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
        const current = field.value ? parseISODate(String(field.value)) : new Date();
        const shift = (days: number) => {
          const next = new Date(current);
          next.setDate(next.getDate() + days);
          haptics.select();
          field.onChange(toISODate(next));
        };
        const quick = [
          { label: 'Today', offset: 0 },
          { label: 'Yesterday', offset: -1 },
        ];
        const todayISO = toISODate(new Date());
        const yesterdayISO = toISODate(new Date(Date.now() - 86400000));

        return (
          <FieldShell label={label} hint={hint} error={fieldState.error?.message}>
            <View style={styles.dateRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous day"
                onPress={() => shift(-1)}
                style={styles.dateStep}
              >
                <Text style={[typography.subheading, { color: palette.textSecondary }]}>-</Text>
              </Pressable>
              <View style={styles.dateValue}>
                <Text style={[typography.bodyStrong, { color: palette.textPrimary }]}>
                  {formatDate(String(field.value ?? todayISO))}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next day"
                onPress={() => shift(1)}
                style={styles.dateStep}
              >
                <Text style={[typography.subheading, { color: palette.textSecondary }]}>+</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs }}>
              {quick.map((item) => {
                const iso = item.offset === 0 ? todayISO : yesterdayISO;
                const active = field.value === iso;
                return (
                  <Pressable
                    key={item.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      haptics.select();
                      field.onChange(iso);
                    }}
                    style={[styles.option, active && { backgroundColor: palette.emberSoft, borderColor: palette.emberGlow }]}
                  >
                    <Text style={[typography.caption, { color: active ? palette.ember : palette.textSecondary }]}>
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
            <Text style={[typography.body, { color: palette.textPrimary }]}>{label}</Text>
            {hint ? (
              <Text style={[typography.caption, { color: palette.textTertiary, marginTop: 2 }]}>{hint}</Text>
            ) : null}
          </View>
          <Switch
            value={Boolean(field.value)}
            onValueChange={(value) => {
              haptics.select();
              field.onChange(value);
            }}
            trackColor={{ false: palette.surfaceHigh, true: palette.emberGlow }}
            thumbColor={Platform.OS === 'android' ? (field.value ? palette.ember : palette.textTertiary) : undefined}
            accessibilityLabel={label}
          />
        </View>
      )}
    />
  );
}

/** A plain uncontrolled segmented control, for filters outside forms. */
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
                typography.caption,
                { color: active ? palette.textPrimary : palette.textTertiary },
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
    borderColor: palette.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
    color: palette.textPrimary,
    ...typography.body,
  },
  inputFocused: { borderColor: palette.emberGlow, backgroundColor: palette.surfaceRaised },
  inputError: { borderColor: palette.negative },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    paddingHorizontal: spacing.lg,
    minHeight: 76,
  },
  amountSymbol: { ...typography.title, color: palette.textTertiary, marginRight: spacing.xs },
  amountInput: { flex: 1, ...typography.display, fontSize: 36, lineHeight: 42, color: palette.textPrimary, paddingVertical: spacing.sm },
  optionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  optionDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    overflow: 'hidden',
  },
  dateStep: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  dateValue: { flex: 1, alignItems: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  segmented: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: radius.pill,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
  },
  segment: { flex: 1, paddingVertical: spacing.xs, alignItems: 'center', borderRadius: radius.pill },
  segmentActive: { backgroundColor: palette.surfaceHigh },
});
