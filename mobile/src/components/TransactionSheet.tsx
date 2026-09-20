/**
 * Quick entry and editing for an expense or income.
 *
 * The amount takes focus on open so a purchase can be recorded in a couple of
 * taps. Saving waits for the server to confirm before the sheet closes, so the
 * dashboard never animates to a figure the backend has not accepted.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AmountField, DateField, OptionField, TextField } from './fields';
import { Button } from './primitives';
import { Sheet } from './Sheet';
import { toISODate } from '../lib/format';
import {
  useCategories,
  useCreateTransaction,
  useHousehold,
  useUpdateTransaction,
  type TransactionInput,
} from '../lib/queries';
import { useToast } from '../lib/toast';
import type { Transaction, TxnType } from '../lib/types';
import { palette, spacing, typography } from '../theme';

const schema = z.object({
  amount: z
    .string()
    .min(1, 'Enter an amount')
    .refine((value) => Number(value) > 0, 'Amount must be more than zero')
    .refine((value) => Number(value) < 100000000, 'That amount looks too large'),
  title: z.string().trim().min(1, 'Give it a name').max(120, 'Keep the name under 120 characters'),
  occurred_on: z.string().min(1, 'Pick a date'),
  category_id: z.string().nullable(),
  payment_method: z.string(),
  scope: z.string(),
  user_id: z.string(),
  notes: z.string().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

const PAYMENT_METHODS = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'other', label: 'Other' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  type: TxnType;
  /** When present the sheet edits that record instead of creating one. */
  editing?: Transaction | null;
  defaultUserId?: string;
}

export function TransactionSheet({ visible, onClose, type, editing, defaultUserId }: Props) {
  const toast = useToast();
  const { data: categories = [] } = useCategories(type);
  const { data: household = [] } = useHousehold();
  const create = useCreateTransaction();
  const update = useUpdateTransaction();

  const defaults = useMemo<FormValues>(
    () => ({
      amount: editing ? String(editing.amount) : '',
      title: editing?.title ?? '',
      occurred_on: editing?.occurred_on ?? toISODate(new Date()),
      category_id: editing?.category_id ?? null,
      payment_method: editing?.payment_method ?? (type === 'income' ? 'bank' : 'upi'),
      scope: editing?.scope ?? 'shared',
      user_id: editing?.user_id ?? defaultUserId ?? '',
      notes: editing?.notes ?? '',
    }),
    [editing, type, defaultUserId],
  );

  const { control, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (visible) reset(defaults);
  }, [visible, defaults, reset]);

  const categoryOptions = categories.map((category) => ({
    value: category.id,
    label: category.name,
      }));

  const memberOptions = household.map((member) => ({
    value: member.id,
    label: member.display_name,
      }));

  const onSubmit = handleSubmit(async (values) => {
    const payload: TransactionInput = {
      type,
      amount: Number(values.amount),
      title: values.title.trim(),
      notes: values.notes?.trim() ? values.notes.trim() : null,
      occurred_on: values.occurred_on,
      payment_method: values.payment_method,
      scope: values.scope,
      category_id: values.category_id,
      user_id: values.user_id || undefined,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        toast.show('Changes saved');
      } else {
        await create.mutateAsync(payload);
        toast.show(type === 'income' ? 'Income recorded' : 'Expense recorded');
      }
      onClose();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not save', { tone: 'error' });
    }
  });

  const busy = create.isPending || update.isPending;
  const verb = editing ? 'Save changes' : type === 'income' ? 'Add income' : 'Add expense';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={editing ? `Edit ${type}` : type === 'income' ? 'Add income' : 'Add expense'}
      subtitle={editing ? 'Every field stays editable after saving.' : undefined}
      tall
      footer={
        <>
          <Button label={verb} onPress={onSubmit} loading={busy} full />
          <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} full />
        </>
      }
    >
      <AmountField control={control} name="amount" autoFocus={!editing} />

      <TextField
        control={control}
        name="title"
        label="What was it for"
        placeholder={type === 'income' ? 'Salary' : 'Groceries'}
        returnKeyType="next"
      />

      <OptionField
        control={control}
        name="category_id"
        label="Category"
        options={categoryOptions}
        scroll
        allowClear
        hint="Tap again to clear. Uncategorised entries still count towards totals."
      />

      <DateField control={control} name="occurred_on" />

      <OptionField control={control} name="payment_method" label="Paid by" options={PAYMENT_METHODS} />

      {memberOptions.length > 0 ? (
        <OptionField control={control} name="user_id" label="Recorded for" options={memberOptions} />
      ) : null}

      <OptionField
        control={control}
        name="scope"
        label="Visibility"
        options={[
          { value: 'shared', label: 'Shared' },
          { value: 'personal', label: 'Personal' },
        ]}
        hint="Shared entries appear for both of you. Personal entries stay private."
      />

      <TextField
        control={control}
        name="notes"
        label="Note"
        placeholder="Optional"
        multiline
        numberOfLines={3}
        style={{ minHeight: 76, textAlignVertical: 'top' }}
      />

      {formState.isSubmitted && !formState.isValid ? (
        <View style={{ paddingTop: spacing.xs }}>
          <Text style={[typography.caption, { color: palette.ink }]}>
            Please correct the highlighted fields.
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}
