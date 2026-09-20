/** Adds a what-if adjustment to the forecast. */
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AmountField, DateField, OptionField, TextField } from './fields';
import { Button } from './primitives';
import { Sheet } from './Sheet';
import { toISODate } from '../lib/format';
import type { ForecastAdjustment } from '../lib/types';

const schema = z.object({
  kind: z.enum(['income_delta', 'expense_delta', 'one_off', 'new_recurring']),
  label: z.string().trim().min(1, 'Name this change').max(80),
  amount: z
    .string()
    .min(1, 'Enter an amount')
    .refine((value) => Number(value) > 0, 'The amount must be more than zero'),
  starts_on: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function ForecastAdjustmentSheet({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (adjustment: ForecastAdjustment) => void;
}) {
  const { control, handleSubmit, reset, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: 'income_delta',
      label: '',
      amount: '',
      starts_on: toISODate(new Date()),
    },
  });

  useEffect(() => {
    if (visible) {
      reset({ kind: 'income_delta', label: '', amount: '', starts_on: toISODate(new Date()) });
    }
  }, [visible, reset]);

  const kind = watch('kind');

  const onSubmit = handleSubmit((values) => {
    onAdd({
      kind: values.kind,
      label: values.label.trim(),
      amount: Number(values.amount),
      starts_on: values.starts_on || null,
      // A one-off applies to a single month; everything else runs on.
      ends_on: values.kind === 'one_off' ? endOfMonth(values.starts_on) : null,
    });
    onClose();
  });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Add a what-if change"
      subtitle="The forecast updates immediately. Nothing is saved to your records."
      tall
      footer={
        <>
          <Button label="Apply to forecast" onPress={onSubmit} full />
          <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} full />
        </>
      }
    >
      <OptionField
        control={control}
        name="kind"
        label="Type of change"
        options={[
          { value: 'income_delta', label: 'Income increase' },
          { value: 'expense_delta', label: 'Expense increase' },
          { value: 'new_recurring', label: 'New recurring cost' },
          { value: 'one_off', label: 'One-off cost' },
        ]}
      />

      <AmountField
        control={control}
        name="amount"
        label={kind === 'one_off' ? 'One-off amount' : 'Amount per month'}
        autoFocus
      />

      <TextField
        control={control}
        name="label"
        label="What is it"
        placeholder={kind === 'income_delta' ? 'Salary raise' : 'Holiday'}
      />

      <DateField
        control={control}
        name="starts_on"
        label={kind === 'one_off' ? 'Month it happens' : 'Starts from'}
      />
    </Sheet>
  );
}

function endOfMonth(iso: string): string {
  const [year, month] = iso.split('-').map(Number);
  return toISODate(new Date(year, month, 0));
}
