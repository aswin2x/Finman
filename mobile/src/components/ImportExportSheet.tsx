/**
 * CSV and Excel import / export.
 *
 * Import is two-step: a preview reports how many rows will land and which
 * will be skipped, and only then does anything get written. Every import is
 * tagged with a batch id so it can be undone in one action.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Divider } from './primitives';
import { Sheet } from './Sheet';
import { http } from '../lib/api';
import { formatCurrency } from '../lib/format';
import { useImportCommit, useImportPreview, useUndoImport } from '../lib/queries';
import { useToast } from '../lib/toast';
import type { ImportPreview } from '../lib/types';
import { palette, radius, spacing, typography } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ImportExportSheet({ visible, onClose }: Props) {
  const toast = useToast();
  const preview = useImportPreview();
  const commit = useImportCommit();
  const undo = useUndoImport();

  const [picked, setPicked] = useState<{ uri: string; name: string; mime: string } | null>(null);
  const [result, setResult] = useState<ImportPreview | null>(null);
  const [exporting, setExporting] = useState(false);

  const reset = () => {
    setPicked(null);
    setResult(null);
  };

  const buildForm = (file: { uri: string; name: string; mime: string }): FormData => {
    const form = new FormData();
    // React Native's FormData takes this shape for file parts.
    form.append('file', { uri: file.uri, name: file.name, type: file.mime } as unknown as Blob);
    return form;
  };

  const pickFile = async () => {
    try {
      const picker = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });
      if (picker.canceled || !picker.assets?.[0]) return;

      const asset = picker.assets[0];
      const file = {
        uri: asset.uri,
        name: asset.name ?? 'import.csv',
        mime: asset.mimeType ?? (asset.name?.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv'),
      };
      setPicked(file);
      setResult(null);

      const response = await preview.mutateAsync(buildForm(file));
      setResult(response);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not read that file', { tone: 'error' });
    }
  };

  const runImport = async () => {
    if (!picked) return;
    try {
      const response = await commit.mutateAsync(buildForm(picked));
      toast.show(`Imported ${response.imported} entries`, {
        actionLabel: 'Undo',
        onAction: async () => {
          await undo.mutateAsync(response.batch_id);
          toast.show('Import removed', { tone: 'info' });
        },
      });
      reset();
      onClose();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Import failed', { tone: 'error' });
    }
  };

  const download = async (format: 'csv' | 'xlsx') => {
    setExporting(true);
    try {
      const target = `${FileSystem.cacheDirectory}finman-export-${Date.now()}.${format}`;
      const download = FileSystem.createDownloadResumable(
        http.url(`/transactions/export/file?format=${format}`),
        target,
        { headers: { Authorization: `Bearer ${http.token() ?? ''}` } },
      );
      const outcome = await download.downloadAsync();
      if (!outcome?.uri) throw new Error('The export did not complete');

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(outcome.uri, {
          mimeType:
            format === 'csv'
              ? 'text/csv'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Export transactions',
        });
      } else {
        toast.show(`Saved to ${outcome.uri}`, { tone: 'info' });
      }
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Export failed', { tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const downloadTemplate = async () => {
    setExporting(true);
    try {
      const target = `${FileSystem.cacheDirectory}finman-import-template.csv`;
      const download = FileSystem.createDownloadResumable(
        http.url('/transactions/export/template'),
        target,
      );
      const outcome = await download.downloadAsync();
      if (outcome?.uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(outcome.uri, { mimeType: 'text/csv', dialogTitle: 'Import template' });
      }
    } catch (error) {
      toast.show(error instanceof Error ? error.message : 'Could not fetch the template', { tone: 'error' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Import and export"
      subtitle="Move records in and out as CSV or Excel."
      tall
      footer={
        result && result.valid_count > 0 ? (
          <>
            <Button
              label={`Import ${result.valid_count} entries`}
              onPress={runImport}
              loading={commit.isPending}
              full
            />
            <Button label="Choose another file" variant="ghost" size="sm" onPress={pickFile} full />
          </>
        ) : undefined
      }
    >
      <View style={{ gap: spacing.sm }}>
        <Text style={[typography.label, { color: palette.inkTertiary }]}>IMPORT</Text>
        <Button
          label={picked ? `Selected: ${picked.name}` : 'Choose a CSV or Excel file'}
          variant="secondary"
          onPress={pickFile}
          loading={preview.isPending}
          full
        />
        <Text style={[typography.caption, { color: palette.inkTertiary }]}>
          Columns: date, type, title, amount, category, payment_method, scope, notes. Unknown categories are
          created automatically.
        </Text>
        <Button label="Download the template" variant="ghost" size="sm" onPress={downloadTemplate} full />
      </View>

      {result ? (
        <View style={styles.previewBox}>
          <View style={styles.previewRow}>
            <Text style={[typography.body, { color: palette.ink }]}>Rows read</Text>
            <Text style={[typography.bodyMedium, { color: palette.ink }]}>{result.total_rows}</Text>
          </View>
          <View style={styles.previewRow}>
            <Text style={[typography.body, { color: palette.ink }]}>Ready to import</Text>
            <Text style={[typography.bodyMedium, { color: palette.ink }]}>{result.valid_count}</Text>
          </View>
          <View style={styles.previewRow}>
            <Text style={[typography.body, { color: result.error_count ? palette.inkSecondary : palette.inkTertiary }]}>
              Will be skipped
            </Text>
            <Text
              style={[
                typography.bodyMedium,
                { color: result.error_count ? palette.inkSecondary : palette.inkTertiary },
              ]}
            >
              {result.error_count}
            </Text>
          </View>

          {result.sample.length > 0 ? (
            <>
              <Divider style={{ marginVertical: spacing.sm }} />
              <Text style={[typography.label, { color: palette.inkTertiary }]}>FIRST FEW ROWS</Text>
              <ScrollView style={{ maxHeight: 140 }} nestedScrollEnabled>
                {result.sample.slice(0, 6).map((row) => (
                  <View key={row.row} style={styles.sampleRow}>
                    <Text style={[typography.caption, { color: palette.inkSecondary, flex: 1 }]} numberOfLines={1}>
                      {row.occurred_on} · {row.title}
                    </Text>
                    <Text style={[typography.caption, { color: palette.ink }]}>
                      {formatCurrency(row.amount)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}

          {result.errors.length > 0 ? (
            <>
              <Divider style={{ marginVertical: spacing.sm }} />
              <Text style={[typography.label, { color: palette.inkSecondary }]}>SKIPPED ROWS</Text>
              <ScrollView style={{ maxHeight: 120 }} nestedScrollEnabled>
                {result.errors.slice(0, 6).map((row) => (
                  <Text key={row.row} style={[typography.caption, { color: palette.inkTertiary, marginTop: 4 }]}>
                    Row {row.row}: {row.error}
                  </Text>
                ))}
              </ScrollView>
            </>
          ) : null}
        </View>
      ) : null}

      <Divider />

      <View style={{ gap: spacing.sm }}>
        <Text style={[typography.label, { color: palette.inkTertiary }]}>EXPORT</Text>
        <Button label="Export as CSV" variant="secondary" onPress={() => download('csv')} loading={exporting} full />
        <Button label="Export as Excel" variant="secondary" onPress={() => download('xlsx')} loading={exporting} full />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  previewBox: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    gap: spacing.xs,
  },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sampleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginTop: 6 },
});
