import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#1a1a2e',
  card: '#16213e',
  cardBorder: '#0f3460',
  accent: '#e94560',
  success: '#4ecca3',
  warning: '#ffc107',
  error: '#e94560',
  text: '#eee',
  textMuted: '#999',
  inputBg: '#0f3460',
  badge: '#533483',
  blocked: '#ff6b35',
};

export const shared = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  btnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBg,
    color: colors.text,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  badge: {
    backgroundColor: colors.badge,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    color: colors.textMuted,
    fontStyle: 'italic',
    fontSize: 13,
    marginTop: 6,
  },
  mono: {
    fontFamily: 'monospace' as const,
    fontSize: 11,
    color: colors.textMuted,
  },
});
