import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chip, TextInput } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';

import { Dialog, List } from '@components';
import type { ChapterReaderSettings } from '@hooks/persisted/useSettings';
import type { ThemeColors } from '@theme/types';
import type { Sensitivity } from '@services/listen/cleaner/patterns';
import {
  DEFAULT_SPEECH_RULE_SETTINGS,
  SECTION_BREAK_PAUSE_MS,
  type EmojiMode,
  type SectionBreakMode,
  type SpeechRule,
  type SpeechRuleSettings,
} from '@services/listen/speechRules';
import { DEFAULT_CLEANER_OPTIONS } from '@services/listen/textPipeline';
import { exportRules, parseRules } from '@services/listen/ruleImport';
import { showToast } from '@utils/showToast';

import ReaderSheetPreferenceItem from './ReaderSheetPreferenceItem';
import { PauseSlider } from './ListenSettingsSection';

type ReaderTts = NonNullable<ChapterReaderSettings['tts']>;

type Props = {
  /** Which sub-tab to render: cleanup/speaking options, or custom rules. */
  part: 'text' | 'rules' | 'cleanup';
  tts: ChapterReaderSettings['tts'];
  setTts: (tts: ReaderTts) => void;
  theme: ThemeColors;
};

const LEVELS: (Sensitivity | 'off')[] = ['off', 'low', 'normal', 'high'];
const EMPTY_RULE: SpeechRule = { id: '', find: '', replace: '' };

const SECTION_OPTIONS: [SectionBreakMode, string][] = [
  ['pause', 'Pause'],
  ['say', 'Say "Section break"'],
  ['skip', 'Skip'],
];
const EMOJI_OPTIONS: [EmojiMode, string][] = [
  ['remove', 'Remove'],
  ['keep', 'Read them'],
  ['replace', 'Say a word'],
];

const ChoiceRow = <T extends string>({
  label,
  options,
  selected,
  onSelect,
  theme,
}: {
  label: string;
  options: [T, string][];
  selected: T;
  onSelect: (value: T) => void;
  theme: ThemeColors;
}) => (
  <View style={styles.chipSection}>
    <Text style={[styles.chipLabel, { color: theme.onSurfaceVariant }]}>
      {label}
    </Text>
    <View style={styles.chipRow}>
      {options.map(([value, text]) => (
        <Chip
          key={value}
          selected={value === selected}
          mode={value === selected ? 'flat' : 'outlined'}
          style={styles.chip}
          onPress={() => onSelect(value)}
        >
          {text}
        </Chip>
      ))}
    </View>
  </View>
);

const describeRule = (rule: SpeechRule) =>
  rule.replace
    ? `Replace "${rule.find}" with "${rule.replace}"`
    : `Remove "${rule.find}"`;

const RuleEditor = ({
  rule,
  onSave,
  onDelete,
  onDismiss,
  theme,
}: {
  rule: SpeechRule | null;
  onSave: (rule: SpeechRule) => void;
  onDelete: (id: string) => void;
  onDismiss: () => void;
  theme: ThemeColors;
}) => {
  const [draft, setDraft] = useState<SpeechRule>(rule ?? EMPTY_RULE);
  const [lastRule, setLastRule] = useState(rule);
  if (rule !== lastRule) {
    setLastRule(rule);
    setDraft(rule ?? EMPTY_RULE);
  }
  const toggle = (key: 'regex' | 'matchCase' | 'wholeWord' | 'onPage') =>
    setDraft(d => ({ ...d, [key]: !d[key] }));

  return (
    <Dialog.Root visible={rule !== null} onDismiss={onDismiss}>
      <Dialog.Title>{rule?.id ? 'Edit rule' : 'New rule'}</Dialog.Title>
      <Dialog.Content>
        <TextInput
          label="Find"
          mode="outlined"
          value={draft.find}
          onChangeText={find => setDraft(d => ({ ...d, find }))}
        />
        <TextInput
          label="Replace with (empty = remove)"
          mode="outlined"
          value={draft.replace}
          onChangeText={replace => setDraft(d => ({ ...d, replace }))}
          style={styles.input}
        />
        <ReaderSheetPreferenceItem
          label="Also change the page text"
          description="Off: only what is read aloud changes."
          value={!!draft.onPage}
          onPress={() => toggle('onPage')}
          theme={theme}
        />
        <ReaderSheetPreferenceItem
          label="Rule on"
          value={draft.enabled !== false}
          onPress={() =>
            setDraft(d => ({ ...d, enabled: d.enabled === false }))
          }
          theme={theme}
        />
        <ReaderSheetPreferenceItem
          label="Whole word"
          value={!!draft.wholeWord}
          onPress={() => toggle('wholeWord')}
          theme={theme}
        />
        <ReaderSheetPreferenceItem
          label="Match case"
          value={!!draft.matchCase}
          onPress={() => toggle('matchCase')}
          theme={theme}
        />
        <ReaderSheetPreferenceItem
          label="Regular expression"
          value={!!draft.regex}
          onPress={() => toggle('regex')}
          theme={theme}
        />
      </Dialog.Content>
      <Dialog.Actions>
        {rule?.id ? (
          <Dialog.Action tone="danger" onPress={() => onDelete(rule.id)}>
            Delete
          </Dialog.Action>
        ) : null}
        <Dialog.Action onPress={onDismiss}>Cancel</Dialog.Action>
        <Dialog.Action
          disabled={!draft.find}
          onPress={() =>
            onSave({ ...draft, id: draft.id || `r${Date.now().toString(36)}` })
          }
        >
          Save
        </Dialog.Action>
      </Dialog.Actions>
    </Dialog.Root>
  );
};

/** Watermark cleaning plus T2S-style speaking rules. */
const SpeechRulesSection: React.FC<Props> = ({ part, tts, setTts, theme }) => {
  const current = useMemo<ReaderTts>(() => tts ?? {}, [tts]);
  const cleaner = { ...DEFAULT_CLEANER_OPTIONS, ...current.cleaner };
  const speech: SpeechRuleSettings = useMemo(
    () => ({ ...DEFAULT_SPEECH_RULE_SETTINGS, ...current.speech }),
    [current.speech],
  );
  const [editing, setEditing] = useState<SpeechRule | null>(null);

  const setSpeech = useCallback(
    (patch: Partial<SpeechRuleSettings>) =>
      setTts({ ...current, speech: { ...speech, ...patch } }),
    [current, setTts, speech],
  );

  const saveRule = (rule: SpeechRule) => {
    const exists = speech.rules.some(r => r.id === rule.id);
    setSpeech({
      rules: exists
        ? speech.rules.map(r => (r.id === rule.id ? rule : r))
        : [...speech.rules, rule],
    });
    setEditing(null);
  };

  const importRules = async () => {
    const parsed = parseRules(await Clipboard.getStringAsync());
    if (!parsed.length) {
      showToast('Copy rules first (one per line, or an exported list).');
      return;
    }
    setSpeech({ rules: [...speech.rules, ...parsed] });
    showToast(`Added ${parsed.length} rule(s)`);
  };

  const exportAll = async () => {
    await Clipboard.setStringAsync(exportRules(speech.rules));
    showToast('Rules copied to the clipboard');
  };

  const cleanupPart = (
    <>
      <List.SubHeader theme={theme}>Text cleanup</List.SubHeader>
      <View style={styles.chipSection}>
        <Text style={[styles.chipLabel, { color: theme.onSurfaceVariant }]}>
          Remove site watermarks and spam
        </Text>
        <View style={styles.chipRow}>
          {LEVELS.map(level => (
            <Chip
              key={level}
              selected={cleaner.sensitivity === level}
              mode={cleaner.sensitivity === level ? 'flat' : 'outlined'}
              style={styles.chip}
              onPress={() =>
                setTts({
                  ...current,
                  cleaner: { ...cleaner, sensitivity: level },
                })
              }
            >
              {level[0].toUpperCase() + level.slice(1)}
            </Chip>
          ))}
        </View>
      </View>
      <ReaderSheetPreferenceItem
        label="Fix chapter titles"
        description='"Chapter 95: Chapter 94: Eighth Realm" becomes "Chapter 94: Eighth Realm".'
        value={cleaner.fixTitles}
        onPress={() =>
          setTts({
            ...current,
            cleaner: { ...cleaner, fixTitles: !cleaner.fixTitles },
          })
        }
        theme={theme}
      />
    </>
  );

  const textPart = (
    <>
      {cleanupPart}
      <List.SubHeader theme={theme}>Speaking text process</List.SubHeader>
      <ReaderSheetPreferenceItem
        label="Do not read aloud web links"
        value={speech.skipLinks}
        onPress={() => setSpeech({ skipLinks: !speech.skipLinks })}
        theme={theme}
      />
      <ReaderSheetPreferenceItem
        label="Do not read aloud punctuation names"
        description='Avoid reading "tilde", "asterisk", "ellipsis" and similar.'
        value={speech.skipPunctuationNames}
        onPress={() =>
          setSpeech({ skipPunctuationNames: !speech.skipPunctuationNames })
        }
        theme={theme}
      />
      <ReaderSheetPreferenceItem
        label="Do not read aloud references"
        description='Skip "[1]"-style reference marks.'
        value={speech.skipReferences}
        onPress={() => setSpeech({ skipReferences: !speech.skipReferences })}
        theme={theme}
      />
      <ReaderSheetPreferenceItem
        label="Do not read aloud quotation marks"
        description='Stops the voice saying "quote". Apostrophes in words stay.'
        value={speech.skipQuoteMarks}
        onPress={() => setSpeech({ skipQuoteMarks: !speech.skipQuoteMarks })}
        theme={theme}
      />

      <List.SubHeader theme={theme}>Section breaks</List.SubHeader>
      <ChoiceRow
        label='Lines like "_____", "=====", "* * *", "◇◇◇" or ".."'
        options={SECTION_OPTIONS}
        selected={speech.sectionBreak}
        onSelect={sectionBreak => setSpeech({ sectionBreak })}
        theme={theme}
      />
      {speech.sectionBreak === 'pause' ? (
        <PauseSlider
          label="Section break pause"
          value={speech.sectionBreakPauseMs ?? SECTION_BREAK_PAUSE_MS}
          onChange={sectionBreakPauseMs => setSpeech({ sectionBreakPauseMs })}
          theme={theme}
        />
      ) : null}

      <List.SubHeader theme={theme}>Emoji</List.SubHeader>
      <ChoiceRow
        label="When the text contains emoji"
        options={EMOJI_OPTIONS}
        selected={speech.emojiMode}
        onSelect={emojiMode => setSpeech({ emojiMode })}
        theme={theme}
      />
      {speech.emojiMode === 'replace' ? (
        <View style={styles.chipSection}>
          <TextInput
            mode="outlined"
            label="Say this instead of each emoji"
            defaultValue={speech.emojiReplacement}
            onEndEditing={e =>
              setSpeech({ emojiReplacement: e.nativeEvent.text })
            }
          />
        </View>
      ) : null}
    </>
  );

  const rulesPart = (
    <>
      <List.SubHeader theme={theme}>Custom rules</List.SubHeader>
      {speech.rules.map(rule => (
        <List.Item
          key={rule.id}
          title={describeRule(rule)}
          description={
            rule.enabled === false
              ? 'Off'
              : rule.onPage
              ? 'Read aloud and page text'
              : 'Read aloud only'
          }
          onPress={() => setEditing(rule)}
          right="pencil"
          theme={theme}
        />
      ))}
      <List.Item
        title="Add rule"
        onPress={() => setEditing({ ...EMPTY_RULE })}
        right="plus"
        theme={theme}
      />
      <List.Item
        title="Import rules from clipboard"
        description='One per line, e.g. Remove "…" or Replace "…" to "…"'
        onPress={importRules}
        right="content-paste"
        theme={theme}
      />
      <List.Item
        title="Copy rules to clipboard"
        onPress={exportAll}
        right="content-copy"
        theme={theme}
      />

      <RuleEditor
        rule={editing}
        onSave={saveRule}
        onDelete={id => {
          setSpeech({ rules: speech.rules.filter(r => r.id !== id) });
          setEditing(null);
        }}
        onDismiss={() => setEditing(null)}
        theme={theme}
      />
    </>
  );

  if (part === 'rules') return rulesPart;
  if (part === 'cleanup') return cleanupPart;
  return textPart;
};

export default React.memo(SpeechRulesSection);

const styles = StyleSheet.create({
  input: { marginTop: 8 },
  chipSection: { paddingHorizontal: 16, paddingVertical: 8 },
  chipLabel: { fontSize: 13, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { marginEnd: 8, marginBottom: 8 },
});
