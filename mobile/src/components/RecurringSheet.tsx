/** Create or edit a recurring income or expense. */
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AmountField, DateField, OptionField, SwitchField, TextField } from './fields';
import { Button } from './primitives';
import { Sheet } from './Sheet';
import { toISODate } from '../lib/format';
import { useCategories, useCreateRecurring, useUpdateRecurring } from '../lib/queries';
import { useToast } from '../lib/toast';
import type { RecurringRule } from '../lib/types';

const schema = z.object({
  title: z.string().trim().min(1, 'Give it a name').max(120),
  type: z.enum(['expense', 'income']),
  amount: z
    .string()
    .min(1, 'Enter an amount')
    .refine((value) => Number(value) > 0, 'The amount must be more than zero'),
  frequency: z.string(),
  day_of_month: z.string(),
  start_date: z.string().min(1, 'Pick a start date'),
  payment_method: z.string(),
  scope: z.string(),
  category_id: z.string().nullable(),
  auto_post: z.boolean(),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export function RecurringSheet({
  visible,
  onClose,
  editing,
}: {
  visible: boolean;
  onClose: () => void;
  editing?: RecurringRule | null;
}) {
  const toast = useToast();
  const create = useCreateRecurring();
  const update = useUpdateRecurring();

  const defaults = useMemo<FormValues>(
    () => ({
      title: editing?.title ?? '',
      type: (editing?.type ?? 'expense') as 'expense' | 'income',
      amount: editing ? String(editing.amount) : '',
      frequency: editing?.frequency ?? 'monthly',
      day_of_month: String(editing?.day_of_month ?? 1),
      start_date: editing?.start_date ?? toISODate(new Date()),
      payment_method: editing?.payment_method ?? 'bank',
      scope: editing?.scope ?? 'shared',
      category_id: editing?.category_id ?? null,
      auto_post: editing?.auto_post ?? false,
      is_active: editing?.is_active ?? true,
    }),
    [editing],
  );

  const { control, handleSubmit, reset, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (visible) reset(defaults);
  }, [visible, defaults, reset]);

  const type = watch('type');
  const { data: categories = [] } = useCategories(type);

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      title: values.title.trim(),
      type: values.type,
      amount: Number(values.amount),
      frequency: values.frequency,
      day_of_month: Math.min(31, Math.max(1, Number(values.day_of_month || 1))),
      start_date: values.start_date,
      payment_method: values.payment_method,
      scope: values.scope,
      category_id: values.category_id,
      auto_post: values.auto_post,
      is_active: values.is_active,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        toast.show('Recurring entry updated');
      } else {
        await create.mutateAsync(payload);
        toast.show('Recurring entry added');
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
      title={editing ? 'Edit recurring entry' : 'New recurring entry'}
      subtitle="Used for upcoming payments and the forecast baseline."
      tall
      footer={
        <>
          <Button
            label={editing ? 'Save changes' : 'Add entry'}
            onPress={onSubmit}
            loading={create.isPending || update.isPending}
            full
          />
          <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} full />
        </>
      }
    >
      <AmountField control={control} name="amount" autoFocus={!editing} />

      <TextField control={control} name="title" label="Name" placeholder="House Rent" />

      <OptionField
        control={control}
        name="type"
        label="Type"
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
      />

      <OptionField
        control={control}
        name="category_id"
        label="Category"
        options={categories.map((category) => ({
          value: category.id,
          label: category.name,
                  }))}
        scroll
        allowClear
      />

      <OptionField
        control={control}
        name="frequency"
        label="Repeats"
        options={[
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
          { value: 'yearly', label: 'Yearly' },
        ]}
      />

      <TextField
        control={control}
        name="day_of_month"
        label="Day of the month"
        placeholder="5"
        keyboardType="number-pad"
        hint="Months shorter than this day fall back to the last day."
      />

      <DateField control={control} name="start_date" label="Starts" />

      <OptionField
        control={control}
        name="payment_method"
        label="Paid by"
        options={[
          { value: 'bank', label: 'Bank' },
          { value: 'upi', label: 'UPI' },
          { value: 'card', label: 'Card' },
          { value: 'cash', label: 'Cash' },
        ]}
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

      <SwitchField
        control={control}
        name="auto_post"
        label="Create the entry automatically"
        hint="When off, it appears under upcoming payments and you confirm it yourself."
      />

      <SwitchField control={control} name="is_active" label="Active" />
    </Sheet>
  );
}
