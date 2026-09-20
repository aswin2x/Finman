/**
 * Create or edit a debt, and record payments against one.
 *
 * The outstanding balance is entered and maintained directly. It is never
 * inferred from EMI multiplied by remaining tenure, because those figures
 * drift apart as soon as interest or an extra payment is involved.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AmountField, DateField, OptionField, SwitchField, TextField } from './fields';
import { Button } from './primitives';
import { Sheet } from './Sheet';
import { formatCurrency, toISODate } from '../lib/format';
import { useCategories, useCreateLoan, useRecordLoanPayment, useUpdateLoan } from '../lib/queries';
import { useToast } from '../lib/toast';
import type { LoanDetail } from '../lib/types';
import { palette, spacing, typography } from '../theme';

const DEBT_TYPES = [
  { value: 'loan', label: 'Loan' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'bnpl', label: 'BNPL' },
  { value: 'personal_due', label: 'Personal due' },
];

const numeric = (message: string) =>
  z
    .string()
    .min(1, message)
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) >= 0, 'Enter a valid number');

const loanSchema = z.object({
  name: z.string().trim().min(1, 'Give the debt a name').max(120),
  lender: z.string().max(120).optional(),
  debt_type: z.string(),
  principal_amount: numeric('Enter the original amount'),
  outstanding_balance: numeric('Enter the current outstanding balance'),
  emi_amount: z.string(),
  interest_rate_annual: z.string(),
  tenure_months: z.string(),
  months_paid: z.string(),
  due_day: z.string(),
  next_due_date: z.string(),
  status: z.string(),
  scope: z.string(),
  notes: z.string().max(2000).optional(),
});

type LoanValues = z.infer<typeof loanSchema>;

export function LoanSheet({
  visible,
  onClose,
  editing,
}: {
  visible: boolean;
  onClose: () => void;
  editing?: LoanDetail | null;
}) {
  const toast = useToast();
  const { data: categories = [] } = useCategories('expense');
  const create = useCreateLoan();
  const update = useUpdateLoan();

  const defaults = useMemo<LoanValues>(
    () => ({
      name: editing?.name ?? '',
      lender: editing?.lender ?? '',
      debt_type: editing?.debt_type ?? 'loan',
      principal_amount: editing ? String(editing.principal_amount) : '',
      outstanding_balance: editing ? String(editing.outstanding_balance) : '',
      emi_amount: editing ? String(editing.emi_amount) : '',
      interest_rate_annual: editing?.interest_rate_annual ? String(editing.interest_rate_annual) : '',
      tenure_months: editing?.tenure_months ? String(editing.tenure_months) : '',
      months_paid: String(editing?.months_paid ?? 0),
      due_day: String(editing?.due_day ?? 5),
      next_due_date: editing?.next_due_date ?? toISODate(new Date()),
      status: editing?.status ?? 'active',
      scope: editing?.scope ?? 'shared',
      notes: editing?.notes ?? '',
    }),
    [editing],
  );

  const { control, handleSubmit, reset } = useForm<LoanValues>({
    resolver: zodResolver(loanSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (visible) reset(defaults);
  }, [visible, defaults, reset]);

  const emiCategory = categories.find((category) => /emi|loan/i.test(category.name));

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      name: values.name.trim(),
      lender: values.lender?.trim() || null,
      debt_type: values.debt_type,
      principal_amount: Number(values.principal_amount),
      outstanding_balance: Number(values.outstanding_balance),
      emi_amount: Number(values.emi_amount || 0),
      interest_rate_annual: values.interest_rate_annual ? Number(values.interest_rate_annual) : null,
      tenure_months: values.tenure_months ? Number(values.tenure_months) : null,
      months_paid: Number(values.months_paid || 0),
      due_day: Number(values.due_day || 5),
      next_due_date: values.next_due_date || null,
      status: values.status,
      scope: values.scope,
      notes: values.notes?.trim() || null,
      category_id: editing?.category_id ?? emiCategory?.id ?? null,
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload });
        toast.show('Debt updated');
      } else {
        await create.mutateAsync(payload);
        toast.show('Debt added');
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
      title={editing ? 'Edit debt' : 'Add a debt'}
      subtitle="The outstanding balance is what you owe today, not EMI times tenure."
      tall
      footer={
        <>
          <Button
            label={editing ? 'Save changes' : 'Add debt'}
            onPress={onSubmit}
            loading={create.isPending || update.isPending}
            full
          />
          <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} full />
        </>
      }
    >
      <AmountField control={control} name="outstanding_balance" label="Outstanding balance today" />

      <TextField control={control} name="name" label="Name" placeholder="Car EMI" />
      <TextField control={control} name="lender" label="Lender" placeholder="HDFC Bank" />

      <OptionField control={control} name="debt_type" label="Type" options={DEBT_TYPES} scroll />

      <TextField
        control={control}
        name="principal_amount"
        label="Original amount borrowed"
        placeholder="650000"
        keyboardType="decimal-pad"
      />
      <TextField
        control={control}
        name="emi_amount"
        label="Monthly EMI"
        placeholder="9155"
        keyboardType="decimal-pad"
        hint="Leave at zero for a revolving balance such as a credit card."
      />
      <TextField
        control={control}
        name="interest_rate_annual"
        label="Interest rate (% a year)"
        placeholder="9.1"
        keyboardType="decimal-pad"
        hint="Optional. Used to estimate how long the balance will take to clear."
      />

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <TextField control={control} name="tenure_months" label="Tenure (months)" placeholder="84" keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField control={control} name="months_paid" label="Months paid" placeholder="26" keyboardType="number-pad" />
        </View>
      </View>

      <TextField control={control} name="due_day" label="Due day of month" placeholder="7" keyboardType="number-pad" />
      <DateField control={control} name="next_due_date" label="Next due date" />

      <OptionField
        control={control}
        name="status"
        label="Status"
        options={[
          { value: 'active', label: 'Active' },
          { value: 'paused', label: 'Paused' },
          { value: 'closed', label: 'Closed' },
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

      <TextField
        control={control}
        name="notes"
        label="Notes"
        placeholder="Optional"
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
  payment_type: z.string(),
  note: z.string().max(200).optional(),
  create_expense: z.boolean(),
});

type PaymentValues = z.infer<typeof paymentSchema>;

export function LoanPaymentSheet({
  visible,
  onClose,
  loan,
}: {
  visible: boolean;
  onClose: () => void;
  loan: LoanDetail | null;
}) {
  const toast = useToast();
  const record = useRecordLoanPayment();

  const defaults = useMemo<PaymentValues>(
    () => ({
      amount: loan?.emi_amount ? String(loan.emi_amount) : '',
      paid_on: toISODate(new Date()),
      payment_type: 'emi',
      note: '',
      create_expense: true,
    }),
    [loan],
  );

  const { control, handleSubmit, reset, watch } = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (visible) reset(defaults);
  }, [visible, defaults, reset]);

  const amount = Number(watch('amount') || 0);
  const type = watch('payment_type');
  const projected =
    loan && type !== 'charge'
      ? Math.max(0, loan.outstanding_balance - amount)
      : loan
        ? loan.outstanding_balance + amount
        : 0;

  const onSubmit = handleSubmit(async (values) => {
    if (!loan) return;
    try {
      await record.mutateAsync({
        loanId: loan.id,
        amount: Number(values.amount),
        paid_on: values.paid_on,
        payment_type: values.payment_type,
        note: values.note?.trim() || null,
        create_expense: values.create_expense,
      });
      toast.show('Payment recorded');
      onClose();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not record the payment', { tone: 'error' });
    }
  });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Record a payment"
      subtitle={loan ? `${loan.name} · ${formatCurrency(loan.outstanding_balance)} outstanding` : undefined}
      tall
      footer={
        <>
          <Button label="Record payment" onPress={onSubmit} loading={record.isPending} full />
          <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} full />
        </>
      }
    >
      <AmountField control={control} name="amount" label="Amount paid" autoFocus />

      <OptionField
        control={control}
        name="payment_type"
        label="Type"
        options={[
          { value: 'emi', label: 'Scheduled EMI' },
          { value: 'extra', label: 'Extra payment' },
          { value: 'charge', label: 'New charge' },
        ]}
        hint="A new charge increases the balance instead of reducing it."
      />

      <DateField control={control} name="paid_on" label="Paid on" />

      {loan && amount > 0 ? (
        <View style={{ paddingVertical: spacing.xs }}>
          <Text style={[typography.caption, { color: palette.inkTertiary }]}>
            Outstanding after this payment
          </Text>
          <Text style={[typography.subheading, { color: palette.ink, marginTop: 2 }]}>
            {formatCurrency(projected)}
          </Text>
        </View>
      ) : null}

      <SwitchField
        control={control}
        name="create_expense"
        label="Also record this as an expense"
        hint="Keeps your cash flow and spending totals accurate."
      />

      <TextField control={control} name="note" label="Note" placeholder="Optional" />
    </Sheet>
  );
}
