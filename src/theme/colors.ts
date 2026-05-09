/** Yellow + white reference theme (Money Manager style). */
export const theme = {
  // yellow: '#FFD740',
  // yellowDark: '#F5C400',
  // yellow: '#BAE6FD', // light ocean blue water color
  // yellowDark: '#7CD8F7', // darker ocean blue
  // yellow: '#F1F5F9', // Minimalist Slate
  // yellowDark: '#E2E8F0', // Soft Slate
  yellow: '#BAE6FD', // Light Ocean Blue (User requested)
  yellowDark: '#7CD8F7',
  white: '#FFFFFF',
  offWhite: '#F8FAFC', // Slate 50
  grayBg: '#F1F5F9', // Slate 100
  text: '#0F172A', // Slate 900
  textMuted: '#64748B', // Slate 500
  border: '#E2E8F0', // Slate 200
  black: '#000000',
} as const;

/** Soft card shadows (iOS + Android elevation). Tune after visual QA. */
export const shadows = {
  card: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  cardLift: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  sheet: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;
