import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G, Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ChevronLeft, ChevronRight, Lock, Crown } from 'lucide-react-native';
import { API_URL } from '../config/api';
import { theme } from '../theme/colors';
import { loadCachedMe } from '../utils/profileCache';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

const DONUT_COLORS = ['#8BC34A', '#26A69A', '#F48FB1', '#64B5F6', '#FFD740', '#CE93D8', '#FFAB91'];

type Period = 'day' | 'week' | 'month';

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseYMD(s: string): Date {
  const [y, m, da] = s.split('-').map(Number);
  return new Date(y, m - 1, da);
}

type Overview = {
  period: string;
  range: { start: string; end: string };
  totals: { income: number; expense: number; savings: number };
  dailyBuckets: { date: string; income: number; expense: number; savings: number }[];
  expenseByCategory: { name: string; value: number; color: string }[];
  incomeByCategory: { name: string; value: number; color: string }[];
};

export default function ChartScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(() => toYMD(new Date()));
  const [donutMode, setDonutMode] = useState<'expense' | 'income'>('expense');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [isFree, setIsFree] = useState(false);

  const fetchOverview = useCallback(async () => {
    // Always check subscription from cache
    const me = await loadCachedMe();
    const isFreeUser = me?.subscription?.tier === 'free';
    setIsFree(isFreeUser);

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('khata_session');
      if (!token) return;
      
      // Even if free, we fetch data to show the blurry background
      const res = await axios.get(`${API_URL}/analytics/overview`, {
        params: { period, date: anchor },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data) setOverview(res.data);
    } catch (e) {
      console.log('overview error', e);
    } finally {
      setLoading(false);
    }
  }, [period, anchor]);

  useFocusEffect(
    useCallback(() => {
      fetchOverview();
    }, [fetchOverview])
  );

  const shiftAnchor = (delta: number) => {
    if (isFree) return;
    const d = parseYMD(anchor);
    if (period === 'day') d.setDate(d.getDate() + delta);
    else if (period === 'week') d.setDate(d.getDate() + 7 * delta);
    else d.setMonth(d.getMonth() + delta);
    setAnchor(toYMD(d));
  };

  const setPeriodFilter = (p: Period) => {
    if (isFree) return;
    setPeriod(p);
  };

  const rangeLabel = useMemo(() => {
    if (!overview) return '';
    const a = overview.range.start;
    const b = overview.range.end;
    if (a === b) return a;
    return `${a} → ${b}`;
  }, [overview]);

  const split = useMemo(() => {
    if (!overview) return [];
    const raw = donutMode === 'expense' ? overview.expenseByCategory : overview.incomeByCategory;
    return [...raw].sort((x, y) => y.value - x.value);
  }, [overview, donutMode]);

  const totalSplit = split.reduce((s, c) => s + c.value, 0) || 1;
  const size = 130;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  let donutOffset = 0;

  const chartW = Math.min(width - 32, 360);
  const chartH = 130;
  const buckets = overview?.dailyBuckets || [];
  const n = Math.max(buckets.length, 1);
  const slotW = chartW / n;
  const maxBar = Math.max(1, ...buckets.map((b) => Math.max(b.income, b.expense)));

  const donutToggle = (mode: 'expense' | 'income') => {
    if (isFree) return;
    setDonutMode(mode);
  };

  if (loading && !overview && !isFree) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={theme.black} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.headerYellow}>
            <Text style={styles.headerTitle}>Analytics</Text>

            <View style={styles.periodRow}>
              {(['day', 'week', 'month'] as Period[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.periodChip, period === p && styles.periodChipOn]}
                  onPress={() => setPeriodFilter(p)}
                  activeOpacity={isFree ? 1 : 0.85}
                >
                  <Text style={[styles.periodChipTxt, period === p && styles.periodChipTxtOn]}>
                    {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.navRow}>
              <TouchableOpacity style={styles.navArrow} onPress={() => shiftAnchor(-1)} hitSlop={8} activeOpacity={isFree ? 1 : 0.7}>
                <ChevronLeft size={26} color={theme.black} />
              </TouchableOpacity>
              <Text style={styles.rangeText} numberOfLines={2}>
                {rangeLabel}
              </Text>
              <TouchableOpacity style={styles.navArrow} onPress={() => shiftAnchor(1)} hitSlop={8} activeOpacity={isFree ? 1 : 0.7}>
                <ChevronRight size={26} color={theme.black} />
              </TouchableOpacity>
            </View>
          </View>

          {overview && (
            <View style={[styles.body, isFree && { opacity: 0.5, filter: [{ blur: 5 }] } as any]}>
              <View style={styles.totalsRow}>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLbl}>Income</Text>
                  <Text style={styles.totalIn}>₹ {overview.totals.income.toLocaleString()}</Text>
                </View>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLbl}>Expense</Text>
                  <Text style={styles.totalEx}>₹ {overview.totals.expense.toLocaleString()}</Text>
                </View>
                <View style={styles.totalBox}>
                  <Text style={styles.totalLbl}>Saving</Text>
                  <Text
                    style={[
                      styles.totalSv,
                      overview.totals.savings < 0 ? styles.totalSvNeg : undefined,
                    ]}
                  >
                    ₹ {overview.totals.savings.toLocaleString()}
                  </Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>
                {period === 'day' ? 'Today' : period === 'week' ? 'Daily (this week)' : 'Daily (this month)'}
              </Text>
              <Text style={styles.sectionHint}>Green = income · Red = expense</Text>
              <View style={styles.barWrap}>
                <Svg width={chartW} height={chartH + 18}>
                  {buckets.map((b, i) => {
                    const x = i * slotW;
                    const w = Math.max(4, slotW / 2 - 3);
                    const hi = (b.income / maxBar) * chartH;
                    const he = (b.expense / maxBar) * chartH;
                    return (
                      <G key={b.date}>
                        <Rect
                          x={x + 2}
                          y={chartH - hi}
                          width={w}
                          height={Math.max(0, hi)}
                          fill="#2e7d32"
                          rx={3}
                        />
                        <Rect
                          x={x + slotW / 2 + 1}
                          y={chartH - he}
                          width={w}
                          height={Math.max(0, he)}
                          fill="#c62828"
                          rx={3}
                        />
                        <Rect x={x} y={chartH} width={slotW} height={16} fill="transparent" />
                      </G>
                    );
                  })}
                </Svg>
                <View style={[styles.barLabels, { width: chartW }]}>
                  {buckets.map((b) => (
                    <Text key={b.date} style={[styles.barLbl, { width: slotW }]} numberOfLines={1}>
                      {period === 'month' ? b.date.slice(8) : b.date.slice(5)}
                    </Text>
                  ))}
                </View>
              </View>

              <View style={styles.donutToggle}>
                <TouchableOpacity
                  style={[styles.donutTab, donutMode === 'expense' && styles.donutTabOn]}
                  onPress={() => donutToggle('expense')}
                  activeOpacity={isFree ? 1 : 0.7}
                >
                  <Text style={[styles.donutTabTxt, donutMode === 'expense' && styles.donutTabTxtOn]}>Expense · categories</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.donutTab, donutMode === 'income' && styles.donutTabOn]}
                  onPress={() => donutToggle('income')}
                  activeOpacity={isFree ? 1 : 0.7}
                >
                  <Text style={[styles.donutTabTxt, donutMode === 'income' && styles.donutTabTxtOn]}>Income · categories</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.chartRow, { width: size, height: size, alignSelf: 'center' }]}>
                <Svg width={size} height={size}>
                  <G rotation="-90" origin={`${c}, ${c}`}>
                    {split.length === 0 ? (
                      <Circle cx={c} cy={c} r={r} stroke={theme.grayBg} strokeWidth={stroke} fill="none" />
                    ) : (
                      split.map((cat, i) => {
                        const frac = cat.value / totalSplit;
                        const dash = frac * circumference;
                        const color = cat.color?.startsWith('#') ? cat.color : DONUT_COLORS[i % DONUT_COLORS.length];
                        const el = (
                          <Circle
                            key={cat.name + i}
                            cx={c}
                            cy={c}
                            r={r}
                            stroke={color}
                            strokeWidth={stroke}
                            fill="none"
                            strokeDasharray={`${dash} ${circumference}`}
                            strokeDashoffset={-donutOffset}
                          />
                        );
                        donutOffset += dash;
                        return el;
                      })
                    )}
                  </G>
                </Svg>
                <View style={styles.chartCenterFill}>
                  <Text style={styles.chartCenterAmt}>
                    ₹ {(donutMode === 'expense' ? overview.totals.expense : overview.totals.income).toLocaleString()}
                  </Text>
                  <Text style={styles.chartCenterLbl}>{donutMode}</Text>
                </View>
              </View>

              <Text style={styles.listTitle}>Breakdown</Text>
              {split.length === 0 ? (
                <Text style={styles.empty}>No data in this range.</Text>
              ) : (
                split.slice(0, 10).map((cat, i) => {
                  const pct = Math.round((cat.value / totalSplit) * 1000) / 10;
                  const color = cat.color?.startsWith('#') ? cat.color : DONUT_COLORS[i % DONUT_COLORS.length];
                  return (
                    <View key={cat.name + i} style={styles.catRow}>
                      <View style={[styles.catDot, { backgroundColor: color }]} />
                      <View style={styles.catInfo}>
                        <Text style={styles.catName} numberOfLines={1}>
                          {cat.name}
                        </Text>
                        <View style={styles.barBg}>
                          <View
                            style={[styles.barFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: theme.yellow }]}
                          />
                        </View>
                      </View>
                      <Text style={styles.catPct}>{pct}%</Text>
                      <Text style={styles.catVal}>₹ {cat.value.toLocaleString()}</Text>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {isFree && (
            <View style={styles.lockedContainer}>
              <View style={styles.lockedBlur}>
                <View style={styles.lockedIconBg}>
                  <Lock size={48} color={theme.black} />
                </View>
                <Text style={styles.lockedTitle}>Premium Feature</Text>
                <Text style={styles.lockedMsg}>
                  Analytics and Charts are only available for Premium members.
                </Text>
                <Text style={styles.lockedSub}>
                  Subscribe to a plan to unlock full financial insights and reports.
                </Text>
                <TouchableOpacity
                  style={styles.upgradeBtn}
                  onPress={() => navigation.navigate('UpgradePlan')}
                  activeOpacity={0.9}
                >
                  <Crown size={20} color={theme.black} />
                  <Text style={styles.upgradeBtnTxt}>Upgrade Now</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.yellow },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 12, paddingBottom: 100 },
  card: { borderRadius: 20, overflow: 'hidden', backgroundColor: theme.white, minHeight: 500 },
  headerYellow: { backgroundColor: theme.yellow, padding: 14 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: theme.black, textAlign: 'center', marginBottom: 12 },
  periodRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.45)',
    marginHorizontal: 4,
  },
  periodChipOn: { backgroundColor: theme.black },
  periodChipTxt: { fontWeight: '800', fontSize: 13, color: theme.text },
  periodChipTxtOn: { color: theme.white },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navArrow: { padding: 4 },
  rangeText: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '800', color: theme.black, paddingHorizontal: 8 },
  body: { padding: 16 },
  totalsRow: { flexDirection: 'row', marginBottom: 18 },
  totalBox: { flex: 1, alignItems: 'center' },
  totalLbl: { fontSize: 11, fontWeight: '800', color: theme.textMuted, marginBottom: 6, textTransform: 'uppercase' },
  totalIn: { fontSize: 15, fontWeight: '900', color: '#2e7d32' },
  totalEx: { fontSize: 15, fontWeight: '900', color: '#c62828' },
  totalSv: { fontSize: 15, fontWeight: '900', color: theme.black },
  totalSvNeg: { color: '#c62828' },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: theme.text, marginBottom: 4 },
  sectionHint: { fontSize: 11, color: theme.textMuted, marginBottom: 8, fontWeight: '600' },
  barWrap: { alignSelf: 'center', marginBottom: 8 },
  barLabels: { flexDirection: 'row', marginTop: 4 },
  barLbl: { fontSize: 9, fontWeight: '700', color: theme.textMuted, textAlign: 'center' },
  donutToggle: { flexDirection: 'row', marginTop: 16, marginBottom: 8, backgroundColor: theme.offWhite, borderRadius: 12, padding: 4 },
  donutTab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  donutTabOn: { backgroundColor: theme.black },
  donutTabTxt: { fontSize: 12, fontWeight: '800', color: theme.text, textAlign: 'center' },
  donutTabTxtOn: { color: theme.white },
  chartRow: { alignItems: 'center', justifyContent: 'center', marginVertical: 12, position: 'relative' },
  chartCenterFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartCenterAmt: { fontSize: 17, fontWeight: '900', color: theme.text },
  chartCenterLbl: { fontSize: 10, color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  listTitle: { fontSize: 15, fontWeight: '900', marginTop: 8, marginBottom: 10, color: theme.text },
  empty: { color: theme.textMuted, fontWeight: '600', textAlign: 'center' },
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  catDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  catInfo: { flex: 1, marginRight: 8 },
  catName: { fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 6 },
  barBg: { height: 4, backgroundColor: theme.grayBg, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  catPct: { fontSize: 12, fontWeight: '700', color: theme.textMuted, width: 38, textAlign: 'right' },
  catVal: { fontSize: 14, fontWeight: '800', color: theme.text, width: 68, textAlign: 'right' },
  lockedContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 10,
  },
  lockedBlur: {
    alignItems: 'center',
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: 24,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: theme.black,
    shadowColor: theme.black,
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.2,
    shadowRadius: 25,
    elevation: 10,
  },
  lockedIconBg: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: theme.offWhite,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: theme.black,
  },
  lockedTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: theme.black,
    marginBottom: 12,
  },
  lockedMsg: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  lockedSub: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.yellow,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.black,
  },
  upgradeBtnTxt: {
    fontSize: 17,
    fontWeight: '900',
    color: theme.black,
  },
});
