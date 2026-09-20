/** Create or edit a settlement, and record partial payments against one. */
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AmountField, DateField, OptionField, SwitchField, TextField } from './fields';
import { Button } from './primitives';
import { Sheet } from './Sheet';
import { formatCurrency, toISODate } from '../lib/format';
import {
  useCreateSettlement,
  useRecordSettlementPayment,
  useUpdateSettlement,
} from '../lib/queries';
import { useToast } from '../lib/toast';
import type { SettlementDetail } from '../lib/types';
import { palette, typography } from '../theme';

const schema = z.object({
  person_name: z.string().trim().min(1, 'Whose settlement is this?').max(80),
  direction: z.string(),
  total_amount: z
    .string()
    .min(1, 'Enter an amount')
    .refine((value) => Number(value) > 0, 'The amount must be more than zero'),
  expected_date: z.string(),
  notes: z.string().max(2000).optional(),
  is_verified: z.boolean(),
  scope: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function SettlementSheet({
  visible,
  onClose,
  editing,
}: {
  visible: boolean;
  onClose: () => void;
  editing?: SettlementDetail | null;
}) {
  const toast = useToast();
  const create = useCreateSettlement();
  const update = useUpdateSettlement();

  const defaults = useMemo<FormValues>(
    () => ({
      person_name: editing?.person_name ?? '',
      direction: editing?.direction ?? 'we_owe',
      total_amount: editing ? String(editing.total_amount) : '',
      expected_date: editing?.expected_date ?? '',
      notes: editing?.notes ?? '',
      is_verified: editing?.is_verified ?? false,
      scope: editing?.scope ?? 'shared',
    }),
    [editing],
  );

  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (visible) reset(defaults);
  }, [visible, defaults, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      person_name: values.person_name.trim(),
      direction: values.direction,
      total_amount: Number(values.total_amount),
      expected_date: values.expected_date || null,
      notes: values.notes?.trim() || null,
      is_verified: values.is_verified,
      scope: values.scope,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        toast.show('Settlement updated');
      } else {
        await create.mutateAsync(payload);
        toast.show('Settlement added');
      }
      onClose();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not save', { tone: 'error' });
    }
  });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit settlement' : 'New settlement'}
      subtitle="Money owed between you and someone outside the household."
      tall
      footer={
        <>
          <Button
            label={editing ? 'Save changes' : 'Add settlement'}
            onPress={onSubmit}
            loading={create.isPending || update.isPending}
            full
          />
          <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} full />
        </>
      }
    >
      <AmountField control={control} name="total_amount" label="Amount" autoFocus={!editing} />

      <TextField control={control} name="person_name" label="Person" placeholder="Stephen" />

      <OptionField
        control={control}
        name="direction"
        label="Direction"
        options={[
          { value: 'we_owe', label: 'We owe them' },
          { value: 'owed_to_us', label: 'They owe us' },
        ]}
      />

      <DateField control={control} name="expected_date" label="Expected settlement date" />

      <SwitchField
        control={control}
        name="is_verified"
        label="Confirmed with the other person"
        hint="Unconfirmed amounts are flagged in the list so they can be checked."
      />

      <OptionField
        control={control}
        name="scope"
        label="Visibility"
        options={[
          { value: 'shared', label: 'Shared' },
          { value: 'personal', label: 'Personal' },
        ]}
      />

      <TextField
        control={control}
        name="notes"
        label="Notes"
        placeholder="What was this for?"
        multiline
        numberOfLines={3}
        style={{ minHeight: 72, textAlignVertical: 'top' }}
      />
    </Sheet>
  );
}

/* ------------------------------------------------------------------ payment */

const paymentSchema = z.object({
  amount: z
    .string()
    .min(1, 'Enter an amount')
    .refine((value) => Number(value) > 0, 'The amount must be more than zero'),
  paid_on: z.string().min(1, 'Pick a date'),
  note: z.string().max(200).optional(),
  create_expense: z.boolean(),
});

type PaymentValues = z.infer<typeof paymentSchema>;

export function SettlementPaymentSheet({
  visible,
  onClose,
  settlement,
}: {
  visible: boolean;
  onClose: () => void;
  settlement: SettlementDetail | null;
}) {
  const toast = useToast();
  const record = useRecordSettlementPayment();

  const defaults = useMemo<PaymentValues>(
    () => ({
      amount: settlement ? String(settlement.remaining_amount) : '',
      paid_on: toISODate(new Date()),
      note: '',
      create_expense: true,
    }),
    [settlement],
  );

  const { control, handleSubmit, reset, watch } = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (visible) reset(defaults);
  }, [visible, defaults, reset]);

  const amount = Number(watch('amount') || 0);
  const outflow = settlement?.direction === 'we_owe';
  const remaining = settlement ? Math.max(0, settlement.remaining_amount - amount) : 0;
  const tooMuch = settlement ? amount > settlement.remaining_amount : false;

  const onSubmit = handleSubmit(async (values) => {
    if (!settlement) return;
    try {
      await record.mutateAsync({
        settlementId: settlement.id,
        amount: Number(values.amount),
        paid_on: values.paid_on,
        note: values.note?.trim() || null,
        create_expense: values.create_expense,
      });
      toast.show(remaining === 0 ? 'Settled in full' : 'Partial payment recorded');
      onClose();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not record the payment', { tone: 'error' });
    }
  });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={outflow ? 'Record a payment' : 'Record money received'}
      subtitle={
        settlement
          ? `${settlement.person_name} · ${formatCurrency(settlement.remaining_amount)} remaining`
          : undefined
      }
      footer={
        <>
          <Button
            label={outflow ? 'Record payment' : 'Record receipt'}
            onPress={onSubmit}
            loading={record.isPending}
            disabled={tooMuch}
            full
          />
          <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} full />
        </>
      }
    >
      <AmountField control={control} name="amount" label="Amount" autoFocus />

      {tooMuch ? (
        <Text style={[typography.caption, { color: palette.ink }]}>
          That is more than the {formatCurrency(settlement?.remaining_amount ?? 0)} outstanding.
        </Text>
      ) : amount > 0 && settlement ? (
        <View>
          <Text style={[typography.caption, { color: palette.inkTertiary }]}>Remaining after this</Text>
          <Text style={[typography.subheading, { color: palette.ink, marginTop: 2 }]}>
            {formatCurrency(remaining)}
          </Text>
        </View>
      ) : null}

      <DateField control={control} name="paid_on" label={outflow ? 'Paid on' : 'Received on'} />

      <SwitchField
        control={control}
        name="create_expense"
        label={outflow ? 'Also record as an expense' : 'Also record as income'}
        hint="Keeps your cash flow accurate."
      />

      <TextField control={control} name="note" label="Note" placeholder="Optional" />
    </Sheet>
  );
}
