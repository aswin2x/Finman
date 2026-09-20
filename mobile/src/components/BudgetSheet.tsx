/** Create or edit a budget for a category and period. */
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AmountField, OptionField, SwitchField, TextField } from './fields';
import { Button } from './primitives';
import { Sheet } from './Sheet';
import { toISODate } from '../lib/format';
import { useCategories, useCreateBudget, useDeleteBudget, useUpdateBudget } from '../lib/queries';
import { useToast } from '../lib/toast';
import type { BudgetProgress } from '../lib/types';

const schema = z.object({
  name: z.string().trim().min(1, 'Give the budget a name').max(80),
  limit_amount: z
    .string()
    .min(1, 'Enter a limit')
    .refine((value) => Number(value) > 0, 'The limit must be more than zero'),
  category_id: z.string().nullable(),
  alert_threshold_pct: z.string(),
  scope: z.string(),
  rollover: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

function monthBounds(anchor = new Date()): { start: string; end: string } {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

export function BudgetSheet({
  visible,
  onClose,
  editing,
  month,
}: {
  visible: boolean;
  onClose: () => void;
  editing?: BudgetProgress | null;
  month?: Date;
}) {
  const toast = useToast();
  const { data: categories = [] } = useCategories('expense');
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const remove = useDeleteBudget();

  const defaults = useMemo<FormValues>(
    () => ({
      name: editing?.budget.name ?? '',
      limit_amount: editing ? String(editing.budget.limit_amount) : '',
      category_id: editing?.budget.category_id ?? null,
      alert_threshold_pct: String(editing?.budget.alert_threshold_pct ?? 80),
      scope: editing?.budget.scope ?? 'shared',
      rollover: editing?.budget.rollover ?? false,
    }),
    [editing],
  );

  const { control, handleSubmit, reset, setValue, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (visible) reset(defaults);
  }, [visible, defaults, reset]);

  // Naming the budget after the chosen category saves a step in the common case.
  const categoryId = watch('category_id');
  useEffect(() => {
    if (!editing && categoryId) {
      const match = categories.find((category) => category.id === categoryId);
      if (match) setValue('name', match.name);
    }
  }, [categoryId, categories, editing, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    const bounds = monthBounds(month);
    const payload = {
      name: values.name.trim(),
      limit_amount: Number(values.limit_amount),
      period_type: 'monthly' as const,
      period_start: bounds.start,
      period_end: bounds.end,
      rollover: values.rollover,
      alert_threshold_pct: Number(values.alert_threshold_pct),
      scope: values.scope,
      category_id: values.category_id,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.budget.id, ...payload });
        toast.show('Budget updated');
      } else {
        await create.mutateAsync(payload);
        toast.show('Budget created');
      }
      onClose();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not save the budget', { tone: 'error' });
    }
  });

  const onDelete = async () => {
    if (!editing) return;
    try {
      await remove.mutateAsync(editing.budget.id);
      toast.show('Budget removed');
      onClose();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not remove', { tone: 'error' });
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit budget' : 'New budget'}
      subtitle="Limits apply to the selected month."
      tall
      footer={
        <>
          <Button
            label={editing ? 'Save changes' : 'Create budget'}
            onPress={onSubmit}
            loading={create.isPending || update.isPending}
            full
          />
          {editing ? (
            <Button label="Remove budget" variant="danger" size="sm" onPress={onDelete} loading={remove.isPending} full />
          ) : (
            <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} full />
          )}
        </>
      }
    >
      <AmountField control={control} name="limit_amount" label="Monthly limit" autoFocus={!editing} />

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
        hint="Leave empty for an overall budget covering all spending."
      />

      <TextField control={control} name="name" label="Budget name" placeholder="Groceries" />

      <OptionField
        control={control}
        name="alert_threshold_pct"
        label="Warn me at"
        options={[
          { value: '60', label: '60%' },
          { value: '70', label: '70%' },
          { value: '80', label: '80%' },
          { value: '90', label: '90%' },
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
        name="rollover"
        label="Carry unspent amount forward"
        hint="Anything left over is added to next month when you roll budgets forward."
      />
    </Sheet>
  );
}
