import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronRight, Calendar, TrendingUp, TrendingDown, Minus, Lock, Crown, Download } from 'lucide-react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as XLSX from 'xlsx';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import { API_URL } from '../config/api';
import { theme, shadows } from '../theme/colors';
import { loadCachedMe } from '../utils/profileCache';
import { useAlert } from '../context/AlertContext';

type Period = 'day' | 'week' | 'month' | 'quarter' | 'half' | 'year';

type Overview = {
  period: string;
  range: { start: string; end: string };
  prevRange: { start: string; end: string };
  totals: { income: number; expense: number; savings: number };
  prevTotals: { income: number; expense: number; savings: number };
  expenseByCategory: { name: string; value: number; color: string; icon_url?: string }[];
  incomeByCategory: { name: string; value: number; color: string; icon_url?: string }[];
  filter?: { category_id: string; name: string } | null;
};

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ReportsScreen({ navigation }: any) {
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(() => toYMD(new Date()));
  const [showPicker, setShowPicker] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [isFree, setIsFree] = useState(false);
  const [reportCategories, setReportCategories] = useState<{ id: string; name: string; type: string }[]>([]);
  const [categoryFilterId, setCategoryFilterId] = useState<string | null>(null);

  const exportToExcel = async () => {
    if (!overview) return;
    try {
      setExporting(true);
      console.log('Starting Excel Export Process...');
      
      const token = await AsyncStorage.getItem('khata_session');
      let ledger: {
        expenses: {
          row: number;
          date: string;
          category: string;
          amount: number;
          note: string;
          party: string;
          party_phone?: string;
        }[];
        income: {
          row: number;
          date: string;
          category: string;
          amount: number;
          note: string;
          party: string;
          party_phone?: string;
        }[];
      } | null = null;
      if (token) {
        try {
          const ledRes = await axios.get(`${API_URL}/analytics/ledger-lines`, {
            params: { all: '1' },
            headers: { Authorization: `Bearer ${token}` },
          });
          ledger = ledRes.data;
        } catch (e) {
          console.log('Ledger lines fetch failed', e);
        }
      }

      // 1. Prepare Data for Excel
      console.log('Preparing data sheets...');
      const allExpenseCount = ledger?.expenses?.length ?? 0;
      const summaryData = [
        { Metric: 'Report period (screen)', Value: overview.period.toUpperCase() },
        { Metric: 'Period date range', Value: `${overview.range.start} to ${overview.range.end}` },
        ...(overview.filter ? [{ Metric: 'Category filter (report view)', Value: overview.filter.name }] : []),
        { Metric: 'Total Income (period)', Value: `₹ ${overview.totals.income}` },
        { Metric: 'Total Expense (period)', Value: `₹ ${overview.totals.expense}` },
        { Metric: 'Net Savings (period)', Value: `₹ ${overview.totals.savings}` },
        { Metric: 'Expense rows (all time, date-wise sheet)', Value: String(allExpenseCount) },
      ];

      const expenseData = overview.expenseByCategory.map((c) => ({
        Category: c.name,
        Amount: c.value,
        Percentage: `${Math.round((c.value / (overview.totals.expense || 1)) * 100)}%`,
        IconURL: c.icon_url || '',
      }));

      const incomeData = overview.incomeByCategory.map((c) => ({
        Category: c.name,
        Amount: c.value,
        Percentage: `${Math.round((c.value / (overview.totals.income || 1)) * 100)}%`,
        IconURL: c.icon_url || '',
      }));

      const expensesSorted = [...(ledger?.expenses ?? [])].sort((a, b) => {
        const c = a.date.localeCompare(b.date);
        return c !== 0 ? c : (a.row ?? 0) - (b.row ?? 0);
      });

      const expenseLines = expensesSorted.map((e, i) => ({
        '#': i + 1,
        Date: e.date,
        Category: e.category,
        'Amount (₹)': e.amount,
        Note: e.note,
        Party: e.party,
        'Party phone': e.party_phone || '',
      }));

      const incomeSorted = [...(ledger?.income ?? [])].sort((a, b) => {
        const c = a.date.localeCompare(b.date);
        return c !== 0 ? c : (a.row ?? 0) - (b.row ?? 0);
      });

      const incomeLines = incomeSorted.map((e, i) => ({
        '#': i + 1,
        Date: e.date,
        Category: e.category,
        'Amount (₹)': e.amount,
        Note: e.note,
        Party: e.party,
        'Party phone': e.party_phone || '',
      }));

      // 2. Create Workbook — first tab = all expenses date-wise (oldest → newest)
      const wb = XLSX.utils.book_new();

      const wsExpLines = XLSX.utils.json_to_sheet(
        expenseLines.length
          ? expenseLines
          : [{ '#': '—', Date: '—', Category: '—', 'Amount (₹)': 0, Note: '', Party: '', 'Party phone': '' }]
      );
      XLSX.utils.book_append_sheet(wb, wsExpLines, 'Expenses_datewise');

      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

      const wsExpenses = XLSX.utils.json_to_sheet(expenseData);
      XLSX.utils.book_append_sheet(wb, wsExpenses, 'Period_exp_by_cat');

      const wsIncome = XLSX.utils.json_to_sheet(incomeData);
      XLSX.utils.book_append_sheet(wb, wsIncome, 'Period_inc_by_cat');

      if (incomeLines.length > 0) {
        const wsIncLines = XLSX.utils.json_to_sheet(incomeLines);
        XLSX.utils.book_append_sheet(wb, wsIncLines, 'Income_datewise');
      }

      // 3. Write and Save File
      console.log('Generating file buffer...');
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileName = `DailyKhata_Full_export_${overview.period}_${overview.range.start}.xlsx`.replace(/[:\s]/g, '_');
      // Use app-scoped storage (no legacy storage permissions needed on Android 10+)
      const baseDir = Platform.OS === 'android' ? RNFS.CachesDirectoryPath : RNFS.DocumentDirectoryPath;
      const filePath = `${baseDir}/${fileName}`;

      console.log('Writing file to:', filePath);
      await RNFS.writeFile(filePath, wbout, 'base64');

      // 4. Share File
      console.log('Opening share dialog...');
      const shareOptions = {
        url: `file://${filePath}`,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: fileName,
        title: 'Download Report',
        failOnCancel: false,
      };

      const shareRes = await Share.open(shareOptions);
      console.log('Share Result:', shareRes);

      showAlert({
        title: 'Success',
        message: 'Report exported successfully!',
        type: 'success'
      });
    } catch (error: any) {
      console.log('Full Excel Export Error Object:', error);
      console.log('Excel Export Error Message:', error.message);
      
      if (error.message && (error.message.includes('User did not share') || error.message.includes('cancelled'))) {
        console.log('User cancelled sharing');
      } else {
        showAlert({
          title: 'Export Failed',
          message: `Details: ${error.message || 'Unknown error'}. Please check app permissions.`,
          type: 'error'
        });
      }
    } finally {
      setExporting(false);
    }
  };

  const load = useCallback(async () => {
    const me = await loadCachedMe();
    if (me?.subscription?.tier === 'free') {
      setIsFree(true);
      setLoading(false);
      return;
    }
    setIsFree(false);

    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('khata_session');
      if (!token) return;
      const my = anchor.slice(0, 7);
      const [catRes, res] = await Promise.all([
        axios.get(`${API_URL}/categories?month_year=${my}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/analytics/overview`, {
          params: {
            period,
            date: anchor,
            ...(categoryFilterId ? { category_id: categoryFilterId } : {}),
          },
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setReportCategories(catRes.data?.categories || []);
      if (res.data) {
        setOverview(res.data);
      }
    } catch (e) {
      console.log('Reports load error', e);
    } finally {
      setLoading(false);
    }
  }, [period, anchor, categoryFilterId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onDateChange = (_: DateTimePickerEvent, selectedDate?: Date) => {
    setShowPicker(false);
    if (selectedDate) {
      setAnchor(toYMD(selectedDate));
    }
  };

  const getComparison = (curr: number, prev: number) => {
    if (prev === 0) return { diff: curr, pct: curr > 0 ? 100 : 0, up: curr > 0 };
    const diff = curr - prev;
    const pct = Math.abs(Math.round((diff / prev) * 100));
    return { diff, pct, up: diff > 0 };
  };

  const expComp = useMemo(() => {
    if (!overview) return null;
    return getComparison(overview.totals.expense, overview.prevTotals.expense);
  }, [overview]);

  const incComp = useMemo(() => {
    if (!overview) return null;
    return getComparison(overview.totals.income, overview.prevTotals.income);
  }, [overview]);

  const rangeLabel = useMemo(() => {
    if (!overview) return '—';
    const s = new Date(overview.range.start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const e = new Date(overview.range.end).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    if (period === 'day') return s;
    if (period === 'month') return new Date(overview.range.start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (period === 'year') return new Date(overview.range.start).getFullYear().toString();
    return `${s} - ${e}`;
  }, [overview, period]);

  if (loading && !isFree) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={theme.black} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headRow}>
            <Text style={styles.headTitle}>Reports</Text>
            {overview && !isFree && (
              <TouchableOpacity 
                style={styles.downloadBtn} 
                onPress={exportToExcel} 
                disabled={exporting}
              >
                {exporting ? (
                  <ActivityIndicator size="small" color={theme.black} />
                ) : (
                  <Download size={22} color={theme.black} />
                )}
              </TouchableOpacity>
            )}
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodTabsScroll}>
            <View style={styles.periodTabs}>
              {(['day', 'week', 'month', 'quarter', 'half', 'year'] as Period[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.tab, period === p && styles.tabOn]}
                  onPress={() => setPeriod(p)}
                >
                  <Text style={[styles.tabTxt, period === p && styles.tabTxtOn]}>
                    {p === 'half' ? '6 MONTHS' : p === 'quarter' ? '3 MONTHS' : p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity style={[styles.dateSelector, shadows.card]} onPress={() => setShowPicker(true)}>
            <Calendar size={18} color={theme.black} />
            <Text style={styles.dateLabel}>{rangeLabel}</Text>
            <ChevronRight size={18} color={theme.black} />
          </TouchableOpacity>

          {!isFree && reportCategories.length > 0 && (
            <View style={styles.catFilterWrap}>
              <Text style={styles.catFilterLbl}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catFilterScroll}>
                <TouchableOpacity
                  style={[styles.catChip, !categoryFilterId && styles.catChipOn]}
                  onPress={() => setCategoryFilterId(null)}
                >
                  <Text style={[styles.catChipTxt, !categoryFilterId && styles.catChipTxtOn]}>All</Text>
                </TouchableOpacity>
                {[...reportCategories]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.catChip, categoryFilterId === c.id && styles.catChipOn]}
                      onPress={() => setCategoryFilterId(c.id)}
                    >
                      <Text style={[styles.catChipTxt, categoryFilterId === c.id && styles.catChipTxtOn]} numberOfLines={1}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
              {overview?.filter ? (
                <Text style={styles.catFilterHint}>Showing: {overview.filter.name}</Text>
              ) : null}
            </View>
          )}
        </View>

        {isFree ? (
          <View style={[styles.lockedCard, shadows.cardLift]}>
            <View style={styles.lockedIconBg}>
              <Lock size={40} color={theme.black} />
            </View>
            <Text style={styles.lockedTitle}>Premium Reports</Text>
            <Text style={styles.lockedMsg}>Detailed period-wise analytics and comparisons are for Premium members.</Text>
            <TouchableOpacity style={styles.upgradeBtn} onPress={() => navigation.navigate('UpgradePlan')}>
              <Crown size={20} color={theme.black} />
              <Text style={styles.upgradeBtnTxt}>Upgrade Now</Text>
            </TouchableOpacity>
          </View>
        ) : overview ? (
          <>
            {/* Summary Cards */}
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, shadows.card]}>
                <Text style={styles.statLbl}>EXPENSES</Text>
                <Text style={styles.statValOut}>₹ {overview.totals.expense.toLocaleString()}</Text>
                {expComp && (
                  <View style={styles.compRow}>
                    {expComp.diff === 0 ? <Minus size={14} color={theme.textMuted} /> : expComp.up ? <TrendingUp size={14} color="#ef4444" /> : <TrendingDown size={14} color="#22c55e" />}
                    <Text style={[styles.compTxt, { color: expComp.diff === 0 ? theme.textMuted : expComp.up ? '#ef4444' : '#22c55e' }]}>
                      {expComp.pct}% {expComp.up ? 'more' : 'less'}
                    </Text>
                  </View>
                )}
              </View>
              <View style={[styles.statCard, shadows.card]}>
                <Text style={styles.statLbl}>INCOME</Text>
                <Text style={styles.statValIn}>₹ {overview.totals.income.toLocaleString()}</Text>
                {incComp && (
                  <View style={styles.compRow}>
                    {incComp.diff === 0 ? <Minus size={14} color={theme.textMuted} /> : incComp.up ? <TrendingUp size={14} color="#22c55e" /> : <TrendingDown size={14} color="#ef4444" />}
                    <Text style={[styles.compTxt, { color: incComp.diff === 0 ? theme.textMuted : incComp.up ? '#22c55e' : '#ef4444' }]}>
                      {incComp.pct}% {incComp.up ? 'more' : 'less'}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Savings Section */}
            <View style={[styles.savingsCard, shadows.card]}>
              <View style={styles.savingsInfo}>
                <Text style={styles.savingsLbl}>Net Savings</Text>
                <Text style={[styles.savingsVal, overview.totals.savings < 0 && { color: '#ef4444' }]}>
                  ₹ {overview.totals.savings.toLocaleString()}
                </Text>
              </View>
              <View style={styles.savingsProgressBase}>
                <View 
                  style={[
                    styles.savingsProgressBar, 
                    { width: `${Math.max(5, Math.min(100, (overview.totals.income > 0 ? (overview.totals.savings / overview.totals.income) * 100 : 0)))}%` }
                  ]} 
                />
              </View>
            </View>

            {/* Category Breakdown */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top Categories</Text>
              {overview.expenseByCategory.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTxt}>No expenses in this period.</Text>
                </View>
              ) : (
                overview.expenseByCategory.slice(0, 5).map((cat, i) => (
                  <View key={cat.name} style={styles.catRow}>
                    <View style={[styles.catIcon, { backgroundColor: cat.color + '22' }]}>
                      <Text style={{ color: cat.color, fontWeight: '900' }}>{i + 1}</Text>
                    </View>
                    <View style={styles.catInfo}>
                      <Text style={styles.catName}>{cat.name}</Text>
                      <View style={styles.catBarBase}>
                        <View 
                          style={[
                            styles.catBarFill, 
                            { 
                              width: `${(cat.value / overview.totals.expense) * 100}%`,
                              backgroundColor: cat.color 
                            }
                          ]} 
                        />
                      </View>
                    </View>
                    <Text style={styles.catAmt}>₹ {cat.value.toLocaleString()}</Text>
                  </View>
                ))
              )}
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Reports data unavailable</Text>
            <Text style={styles.emptyStateMsg}>
              Try again. If problem persists, check internet and log-in session (`khata_session`).
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load} activeOpacity={0.9}>
              <Text style={styles.retryBtnTxt}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {showPicker && (
          <DateTimePicker
            value={new Date(anchor)}
            mode="date"
            display="default"
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.yellow },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: 100 },
  header: { padding: 20, backgroundColor: theme.yellow },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headTitle: { fontSize: 24, fontWeight: '900', color: theme.black },
  downloadBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' },
  periodTabsScroll: { marginBottom: 16 },
  periodTabs: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 12, padding: 4 },
  tab: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabOn: { backgroundColor: theme.black },
  tabTxt: { fontSize: 12, fontWeight: '800', color: theme.black },
  tabTxtOn: { color: theme.white },
  dateSelector: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.white, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  dateLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.black },
  catFilterWrap: { marginTop: 14 },
  catFilterLbl: { fontSize: 12, fontWeight: '800', color: theme.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  catFilterScroll: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: 'transparent',
    maxWidth: 160,
    marginRight: 8,
  },
  catChipOn: { backgroundColor: theme.black, borderColor: theme.black },
  catChipTxt: { fontSize: 13, fontWeight: '800', color: theme.black },
  catChipTxtOn: { color: theme.white },
  catFilterHint: { marginTop: 8, fontSize: 12, fontWeight: '600', color: theme.textMuted },
  
  statsGrid: { flexDirection: 'row', gap: 12, padding: 16 },
  statCard: { flex: 1, backgroundColor: theme.white, padding: 16, borderRadius: 20 },
  statLbl: { fontSize: 11, fontWeight: '800', color: theme.textMuted, marginBottom: 8 },
  statValOut: { fontSize: 18, fontWeight: '900', color: '#ef4444' },
  statValIn: { fontSize: 18, fontWeight: '900', color: '#22c55e' },
  compRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  compTxt: { fontSize: 12, fontWeight: '700' },

  savingsCard: { margin: 16, marginTop: 0, backgroundColor: theme.white, padding: 20, borderRadius: 20 },
  savingsInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
  savingsLbl: { fontSize: 14, fontWeight: '700', color: theme.textMuted },
  savingsVal: { fontSize: 22, fontWeight: '900', color: theme.black },
  savingsProgressBase: { height: 8, backgroundColor: theme.grayBg, borderRadius: 4, overflow: 'hidden' },
  savingsProgressBar: { height: '100%', backgroundColor: theme.black, borderRadius: 4 },

  section: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: theme.black, marginBottom: 16 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  catIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  catInfo: { flex: 1, gap: 6 },
  catName: { fontSize: 15, fontWeight: '700', color: theme.text },
  catBarBase: { height: 6, backgroundColor: theme.grayBg, borderRadius: 3, overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: 3 },
  catAmt: { fontSize: 15, fontWeight: '800', color: theme.black },
  
  emptyBox: { padding: 40, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 20, borderStyle: 'dashed', borderWidth: 1, borderColor: theme.border },
  emptyTxt: { color: theme.textMuted, fontWeight: '600' },

  emptyState: {
    marginTop: 30,
    marginHorizontal: 16,
    backgroundColor: theme.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
  },
  emptyStateTitle: { fontSize: 16, fontWeight: '900', color: theme.black, marginBottom: 8 },
  emptyStateMsg: { fontSize: 12, fontWeight: '600', color: theme.textMuted, textAlign: 'center', lineHeight: 18, marginBottom: 14 },
  retryBtn: {
    backgroundColor: theme.yellow,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.black,
  },
  retryBtnTxt: { fontSize: 15, fontWeight: '900', color: theme.black },

  lockedCard: { margin: 20, padding: 32, backgroundColor: theme.white, borderRadius: 24, alignItems: 'center' },
  lockedIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.offWhite, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  lockedTitle: { fontSize: 22, fontWeight: '900', color: theme.black, marginBottom: 12 },
  lockedMsg: { fontSize: 14, fontWeight: '600', color: theme.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.yellow, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16, borderWidth: 2, borderColor: theme.black },
  upgradeBtnTxt: { fontSize: 16, fontWeight: '900', color: theme.black },
});
