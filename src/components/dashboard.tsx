import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

const c = theme.colors;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function initials(name?: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CU';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function formatDateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

type Tone = { fg: string; bg: string; icon: IconName };

export function statusTone(status?: string): Tone {
  switch (String(status || '').toLowerCase()) {
    case 'approved':
      return { fg: c.emerald, bg: '#e3f5ee', icon: 'checkmark-circle-outline' };
    case 'verified':
      return { fg: c.navySoft, bg: '#e4eefc', icon: 'shield-checkmark-outline' };
    case 'departed':
    case 'active':
    case 'in transit':
    case 'boarding':
      return { fg: c.navySoft, bg: '#e4eefc', icon: 'navigate-outline' };
    case 'scheduled':
      return { fg: c.amber, bg: '#fdf1df', icon: 'calendar-outline' };
    case 'arrived':
      return { fg: c.emerald, bg: '#e3f5ee', icon: 'flag-outline' };
    case 'returned':
    case 'completed':
      return { fg: '#4b5d74', bg: '#edf1f6', icon: 'return-down-back-outline' };
    case 'rejected':
      return { fg: c.danger, bg: '#fbe9e7', icon: 'close-circle-outline' };
    case 'pending':
    default:
      return { fg: c.amber, bg: '#fdf1df', icon: 'hourglass-outline' };
  }
}

/* -------------------------------------------------------------------------- */
/* Screen shell                                                               */
/* -------------------------------------------------------------------------- */

export function DashboardScreen({
  header,
  children,
  refreshing,
  onRefresh
}: {
  header: ReactNode;
  children: ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.navy} colors={[c.navy]} />}
      >
        {header}
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </View>
  );
}

export function DashboardHeader({
  eyebrow,
  name,
  preview,
  onSignOut,
  highlight
}: {
  eyebrow: string;
  name: string;
  preview?: boolean;
  onSignOut: () => void;
  highlight: { icon: IconName; label: string; value: string; caption?: string };
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
      <View style={styles.headerRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow} numberOfLines={1}>{eyebrow}</Text>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
        </View>
        <Pressable
          onPress={onSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          hitSlop={8}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons name="log-out-outline" size={20} color={c.white} />
        </Pressable>
      </View>

      {preview && (
        <View style={styles.previewChip}>
          <Ionicons name="flask-outline" size={13} color={c.navy} />
          <Text style={styles.previewChipText}>Preview session</Text>
        </View>
      )}

      <View style={styles.highlight}>
        <View style={styles.highlightIcon}>
          <Ionicons name={highlight.icon} size={20} color={c.gold} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.highlightLabel} numberOfLines={1}>{highlight.label}</Text>
          <Text style={styles.highlightValue} numberOfLines={1}>{highlight.value}</Text>
          {highlight.caption ? <Text style={styles.highlightCaption} numberOfLines={2}>{highlight.caption}</Text> : null}
        </View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-screen shell                                                           */
/* -------------------------------------------------------------------------- */

export function SubScreen({
  title,
  subtitle,
  children,
  refreshing,
  onRefresh
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={c.navy} colors={[c.navy]} /> : undefined
        }
      >
        <View style={[styles.header, styles.subHeader, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={22} color={c.white} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.subTitle} numberOfLines={1}>{title}</Text>
              {subtitle ? <Text style={styles.subSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
            </View>
          </View>
        </View>
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* -------------------------------------------------------------------------- */
/* Building blocks                                                            */
/* -------------------------------------------------------------------------- */

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function StatRow({ items }: { items: Array<{ icon: IconName; label: string; value: number | string; color?: string }> }) {
  return (
    <View style={styles.statRow}>
      {items.map((item) => (
        <View key={item.label} style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: `${item.color || c.navy}14` }]}>
            <Ionicons name={item.icon} size={18} color={item.color || c.navy} />
          </View>
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{item.value}</Text>
          <Text style={styles.statLabel} numberOfLines={2}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function ActionTile({
  icon,
  label,
  onPress,
  primary
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.tile, primary && styles.tilePrimary, pressed && styles.pressed]}
    >
      <View style={[styles.tileIcon, primary && styles.tileIconPrimary]}>
        <Ionicons name={icon} size={22} color={c.navy} />
      </View>
      <Text style={styles.tileLabel} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

export function ActionRow({ children }: { children: ReactNode }) {
  return <View style={styles.actionRow}>{children}</View>;
}

export function ActionListItem({
  icon,
  title,
  caption,
  onPress
}: {
  icon: IconName;
  title: string;
  caption: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.listAction, pressed && styles.pressed]}>
      <View style={[styles.tileIcon, styles.tileIconPrimary]}>
        <Ionicons name={icon} size={22} color={c.navy} />
      </View>
      <View style={styles.headerText}>
        <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.cardMeta} numberOfLines={2}>{caption}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={c.muted} />
    </Pressable>
  );
}

export function StatusBadge({ status }: { status?: string }) {
  const tone = statusTone(status);
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <View style={[styles.badgeDot, { backgroundColor: tone.fg }]} />
      <Text style={[styles.badgeText, { color: tone.fg }]} numberOfLines={1}>{status || 'Pending'}</Text>
    </View>
  );
}

export function ListCard({
  icon,
  iconColor,
  iconBg,
  title,
  subtitle,
  status,
  note,
  footer
}: {
  icon: IconName;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle?: string;
  status?: string;
  note?: string;
  footer?: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={[styles.cardIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.cardMeta} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {status !== undefined && <StatusBadge status={status} />}
      </View>
      {note ? <Text style={styles.cardNote} numberOfLines={2}>{note}</Text> : null}
      {footer}
    </View>
  );
}

export function CardButton({
  label,
  icon,
  onPress,
  variant = 'neutral',
  disabled
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  variant?: 'neutral' | 'success' | 'danger';
  disabled?: boolean;
}) {
  const palette = {
    neutral: { bg: c.blueSoft, fg: c.navy },
    success: { bg: '#e3f5ee', fg: c.emerald },
    danger: { bg: '#fbe9e7', fg: c.danger }
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.cardButton, { backgroundColor: palette.bg }, (pressed || disabled) && styles.pressed]}
    >
      {icon ? <Ionicons name={icon} size={16} color={palette.fg} /> : null}
      <Text style={[styles.cardButtonText, { color: palette.fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function CardFooter({ children }: { children: ReactNode }) {
  return <View style={styles.cardFooter}>{children}</View>;
}

export function EmptyState({ icon, title, message }: { icon: IconName; title: string; message: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={24} color={c.navySoft} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

export function StatusBreakdown({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).filter(([, value]) => value > 0);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total === 0) return null;
  return (
    <View style={styles.card}>
      <View style={styles.breakdownBar}>
        {entries.map(([status, value]) => (
          <View key={status} style={{ flex: value, backgroundColor: statusTone(status).fg }} />
        ))}
      </View>
      <View style={styles.legend}>
        {entries.map(([status, value]) => (
          <View key={status} style={styles.legendItem}>
            <View style={[styles.badgeDot, { backgroundColor: statusTone(status).fg }]} />
            <Text style={styles.legendText} numberOfLines={1}>{status}</Text>
            <Text style={styles.legendValue}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function Card({ children, centered }: { children: ReactNode; centered?: boolean }) {
  return <View style={[styles.card, centered && styles.cardCentered]}>{children}</View>;
}

export function InfoNote({ icon = 'information-circle-outline', children }: { icon?: IconName; children: ReactNode }) {
  return (
    <View style={styles.infoNote}>
      <Ionicons name={icon} size={18} color={c.navySoft} />
      <Text style={styles.infoNoteText}>{children}</Text>
    </View>
  );
}

export function FormField({ label, hint, ...inputProps }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor="#8a97a8"
        {...inputProps}
        style={[styles.input, inputProps.multiline && styles.inputMultiline]}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function ChipGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  loading,
  disabled,
  variant = 'gold'
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'gold' | 'navy' | 'ghost';
}) {
  const fg = variant === 'navy' ? c.white : c.navy;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.primaryButton,
        variant === 'navy' && styles.primaryButtonNavy,
        variant === 'ghost' && styles.primaryButtonGhost,
        (pressed || disabled) && styles.pressed
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.primaryButtonText, { color: fg }]} numberOfLines={1}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function LoadingBlock() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={c.navy} />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const cardShadow = {
  shadowColor: '#0b2a5b',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.slate },
  body: { paddingHorizontal: 16, paddingTop: 20, gap: 24 },
  pressed: { opacity: 0.7 },

  // Header
  header: {
    backgroundColor: c.navy,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: theme.radius.xl,
    borderBottomRightRadius: theme.radius.xl
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: c.navy, fontSize: 16, fontWeight: '800' },
  eyebrow: { color: '#a9c3e6', fontSize: 12, fontWeight: '600' },
  name: { color: c.white, fontSize: 19, fontWeight: '700', marginTop: 2 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: c.gold,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 14
  },
  previewChipText: { color: c.navy, fontSize: 11, fontWeight: '700' },
  highlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    padding: 14,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  highlightIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(227,172,58,0.16)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  highlightLabel: { color: '#a9c3e6', fontSize: 12, fontWeight: '600' },
  highlightValue: { color: c.white, fontSize: 17, fontWeight: '700', marginTop: 2 },
  highlightCaption: { color: '#c9d9ee', fontSize: 12, lineHeight: 17, marginTop: 4 },

  // Sections
  section: { gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { flexShrink: 1, color: c.text, fontSize: 17, fontWeight: '700' },
  sectionSubtitle: { flexShrink: 0, color: c.muted, fontSize: 12, fontWeight: '600' },

  // Stats
  statRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: c.white,
    borderRadius: theme.radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: c.border,
    ...cardShadow
  },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { color: c.navy, fontSize: 24, fontWeight: '800', marginTop: 10 },
  statLabel: { color: c.muted, fontSize: 12, lineHeight: 16, marginTop: 2 },

  // Actions
  actionRow: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    ...cardShadow
  },
  tilePrimary: { backgroundColor: '#fdf4e1', borderColor: '#f1d79e' },
  tileIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.blueSoft, alignItems: 'center', justifyContent: 'center' },
  tileIconPrimary: { backgroundColor: c.gold },
  tileLabel: { color: c.navy, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  listAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: theme.radius.md,
    backgroundColor: c.white,
    borderWidth: 1,
    borderColor: c.border,
    ...cardShadow
  },

  // Cards
  card: {
    backgroundColor: c.white,
    borderRadius: theme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
    ...cardShadow
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: c.text, fontSize: 15, fontWeight: '700' },
  cardMeta: { color: c.muted, fontSize: 12, marginTop: 2 },
  cardNote: { color: '#3d4f66', fontSize: 13, lineHeight: 19, marginTop: 10 },
  cardFooter: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cardButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10
  },
  cardButtonText: { fontSize: 13, fontWeight: '700' },

  // Badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
    maxWidth: 110,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#c9d6e8',
    backgroundColor: c.white
  },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.blueSoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: c.text, fontSize: 15, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  emptyMessage: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 4, textAlign: 'center' },

  // Sub-screen
  subHeader: { paddingBottom: 18 },
  subTitle: { color: c.white, fontSize: 19, fontWeight: '700' },
  subSubtitle: { color: '#a9c3e6', fontSize: 12, lineHeight: 17, marginTop: 2 },
  cardCentered: { alignItems: 'center' },
  loading: { paddingVertical: 48, alignItems: 'center' },

  // Info note
  infoNote: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#e8f0fb',
    borderWidth: 1,
    borderColor: '#d3e1f4'
  },
  infoNoteText: { flex: 1, color: '#33507a', fontSize: 13, lineHeight: 19 },

  // Forms
  field: { gap: 6 },
  fieldLabel: { color: c.text, fontSize: 13, fontWeight: '700' },
  fieldHint: { color: c.muted, fontSize: 12 },
  input: {
    backgroundColor: '#f8fbff',
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: c.text
  },
  inputMultiline: { minHeight: 110, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.white
  },
  chipSelected: { backgroundColor: c.navy, borderColor: c.navy },
  chipText: { color: c.navy, fontSize: 13, fontWeight: '600' },
  chipTextSelected: { color: c.white },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: c.gold
  },
  primaryButtonNavy: { backgroundColor: c.navy },
  primaryButtonGhost: { backgroundColor: c.blueSoft },
  primaryButtonText: { fontSize: 15, fontWeight: '700' },

  // Breakdown
  breakdownBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { color: c.muted, fontSize: 12, fontWeight: '600' },
  legendValue: { color: c.text, fontSize: 12, fontWeight: '800' }
});
