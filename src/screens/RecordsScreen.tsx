import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronDown, X, FileText, Calendar as CalendarIcon, AlertTriangle, Circle, Plus, MessageCircle } from 'lucide-react-native';
import ImageViewer from 'react-native-image-zoom-viewer';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { MainTabParamList, RootStackParamList } from '../../App';
import { API_URL } from '../config/api';
import { theme, shadows } from '../theme/colors';
import { CategoryIconCircle } from '../utils/categoryIcon';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Records'>,
  NativeStackScreenProps<RootStackParamList>
>;

function normalizePhoneForWhatsApp(raw: string): string | null {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10) return `91${d}`;
  if (d.length >= 11 && d.startsWith('91')) return d;
  if (d.length >= 10) return d;
  return null;
}

export default function RecordsScreen(_props: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [listFilter, setListFilter] = useState<'month' | 'all' | 'hisab' | 'todo'>('month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');

  const [todos, setTodos] = useState<
    {
      id: string;
      title: string;
      created_at?: string | null;
      todo_date?: string | null;
      status?: 'pending' | 'ongoing' | 'done' | null;
    }[]
  >([]);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [todoBusy, setTodoBusy] = useState(false);

  const fetchTodos = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('khata_session');
      if (!token) return;
      const { data } = await axios.get(`${API_URL}/todos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTodos(data?.todos || []);
    } catch (e) {
      console.log('Todos fetch error', e);
      Alert.alert('Todos fetch failed', String((e as any)?.message || e));
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('khata_session');
      if (!token) throw new Error('Unauthenticated');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      const my = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
      
      const [_sumRes, txRes, catRes] = await Promise.all([
        axios.get(`${API_URL}/transactions/summary`, config),
        axios.get(`${API_URL}/transactions?limit=5000&page=1`, config),
        axios.get(`${API_URL}/categories?month_year=${my}`, config),
      ]);
      
      if (txRes.data?.transactions) {
        // Attach budget info to transactions
        const cats = catRes.data?.categories || [];
        const txs = txRes.data.transactions.map((tx: any) => {
          const cat = cats.find((c: any) => c.id === tx.category_id);
          return { ...tx, categories: { ...tx.categories, monthly_budget: cat?.monthly_budget } };
        });
        setTransactions(txs);
      }
    } catch (e) {
      console.log('Records fetch error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      if (listFilter === 'todo') fetchTodos();
    }, [fetchData, fetchTodos, listFilter])
  );

  const now = selectedDate;
  const yNow = now.getFullYear();
  const mNow = now.getMonth();
  const dateLabel = now.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit' });
  const todoDateYMD = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

  const onDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
    }
  };

  const isLoanTransaction = (tx: any) => {
    return tx.party_id || (tx.categories?.name && /udhar|उधार|loan|borrow|hisab|khata/i.test(tx.categories.name));
  };

  const visibleTransactions = useMemo(() => {
    if (listFilter === 'hisab') {
      return transactions.filter((tx) => isLoanTransaction(tx));
    }
    
    const filtered = listFilter === 'all' 
      ? transactions 
      : transactions.filter((tx) => {
          const d = new Date(tx.transaction_date);
          return d.getMonth() === mNow && d.getFullYear() === yNow;
        });

    return filtered.filter((tx) => !isLoanTransaction(tx));
  }, [transactions, listFilter, yNow, mNow]);

  const stats = useMemo(() => {
    if (listFilter === 'todo') return { inc: 0, exp: 0, sav: 0 };
    const data = listFilter === 'hisab' ? transactions.filter(isLoanTransaction) : visibleTransactions;
    let inc = 0;
    let exp = 0;
    data.forEach((tx) => {
      const a = Number(tx.amount);
      if (tx.type === 'income') inc += a;
      else exp += a;
    });
    return { inc, exp, sav: inc - exp };
  }, [visibleTransactions, transactions, listFilter]);

  /** Parties who borrowed from you (net Given − Taken > 0) with a saved phone — for WhatsApp. */
  const udharDebtors = useMemo(() => {
    const map = new Map<string, { name: string; phone: string }>();
    const bal = new Map<string, number>();
    for (const tx of transactions) {
      if (!isLoanTransaction(tx)) continue;
      const pid = tx.party_id;
      if (!pid || !tx.parties) continue;
      const p = tx.parties;
      if (!map.has(pid)) {
        map.set(pid, { name: p.name || '—', phone: String(p.phone || '').trim() });
      }
      const amt = Number(tx.amount);
      if (tx.type === 'expense') bal.set(pid, (bal.get(pid) || 0) + amt);
      else if (tx.type === 'income') bal.set(pid, (bal.get(pid) || 0) - amt);
    }
    const out: { partyId: string; name: string; phone: string; balance: number }[] = [];
    for (const [pid, row] of map) {
      const b = bal.get(pid) || 0;
      if (b > 0.005 && normalizePhoneForWhatsApp(row.phone)) {
        out.push({ partyId: pid, name: row.name, phone: row.phone, balance: b });
      }
    }
    return out.sort((a, b) => b.balance - a.balance);
  }, [transactions]);

  const sendHisabWhatsApp = async (name: string, phone: string, balance: number) => {
    const n = normalizePhoneForWhatsApp(phone);
    if (!n) {
      Alert.alert('Number missing', 'Please save a valid mobile number in the party profile.');
      return;
    }
    const msg = `Hello ${name},\n\nDaily Khata balance: you owe ₹${Math.round(balance).toLocaleString('en-IN')} (I gave − you returned).\nPlease confirm.\n\n— Daily Khata`;
    const url = `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) await Linking.openURL(url);
      else Alert.alert('WhatsApp', 'Could not open WhatsApp.');
    } catch {
      Alert.alert('WhatsApp', 'Could not open the link.');
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={theme.black} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              if (listFilter === 'todo') {
                fetchTodos().finally(() => setRefreshing(false));
              } else {
                fetchData();
              }
            }}
            tintColor={theme.black}
          />
        }
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetYellow}>
            <Text style={styles.mmTitle}>Money Manager</Text>
            
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="spinner"
                onChange={onDateChange}
              />
            )}

            <View style={styles.dateRow}>
              <TouchableOpacity
                style={styles.datePill}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <CalendarIcon size={18} color={theme.black} style={{ marginRight: 4 }} />
                <Text style={styles.datePillText}>{dateLabel}</Text>
                <ChevronDown size={18} color={theme.black} />
              </TouchableOpacity>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
                <TouchableOpacity
                  style={[styles.filterChip, listFilter === 'month' && styles.filterChipOn]}
                  onPress={() => setListFilter('month')}
                >
                  <Text style={[styles.filterChipTxt, listFilter === 'month' && styles.filterChipTxtOn]}>This month</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, listFilter === 'all' && styles.filterChipOn]}
                  onPress={() => setListFilter('all')}
                >
                  <Text style={[styles.filterChipTxt, listFilter === 'all' && styles.filterChipTxtOn]}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, listFilter === 'hisab' && styles.filterChipOn]}
                  onPress={() => setListFilter('hisab')}
                >
                  <Text style={[styles.filterChipTxt, listFilter === 'hisab' && styles.filterChipTxtOn]}>Party Ledger</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, listFilter === 'todo' && styles.filterChipOn]}
                  onPress={() => {
                    setListFilter('todo');
                    fetchTodos();
                  }}
                >
                  <Text style={[styles.filterChipTxt, listFilter === 'todo' && styles.filterChipTxtOn]}>To Do</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {listFilter !== 'todo' ? (
              <View style={styles.summaryRow}>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>Income</Text>
                  <Text style={[styles.summaryVal, { color: '#059669' }]}>₹ {stats.inc.toLocaleString()}</Text>
                </View>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>Expenses</Text>
                  <Text style={[styles.summaryVal, { color: theme.black }]}>-₹ {stats.exp.toLocaleString()}</Text>
                </View>
                <View style={styles.summaryCol}>
                  <Text style={styles.summaryLabel}>Savings</Text>
                  <Text style={[styles.summaryVal, { color: stats.sav >= 0 ? '#2563EB' : '#DC2626' }]}>
                    ₹ {stats.sav.toLocaleString()}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.sheetWhite}>
            {listFilter === 'hisab' ? (
              <View style={styles.waCard}>
                <Text style={styles.waTitle}>WhatsApp — Balance</Text>
                <Text style={styles.waHint}>
                  Parties with a positive balance (they owe you) — send them a message. Make sure to save a phone number when creating/editing a party.
                </Text>
                {udharDebtors.length === 0 ? (
                  <Text style={styles.waEmpty}>
                    No matches: either balance is zero or no number saved.
                  </Text>
                ) : (
                  udharDebtors.map((d) => (
                    <View key={d.partyId} style={styles.waRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.waName} numberOfLines={1}>
                          {d.name}
                        </Text>
                        <Text style={styles.waBal}>Balance: ₹ {d.balance.toLocaleString('en-IN')}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.waBtn}
                        activeOpacity={0.85}
                        onPress={() => sendHisabWhatsApp(d.name, d.phone, d.balance)}
                      >
                        <MessageCircle size={18} color="#fff" />
                        <Text style={styles.waBtnTxt}>WhatsApp</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            ) : null}
            {listFilter === 'todo' ? (
              <View style={styles.todoWrap}>
                <Text style={styles.todoHint}>Pending / Ongoing — Done dabate hi item hata diya jayega.</Text>
                <View style={styles.todoAddRow}>
                  <TextInput
                    style={styles.todoInput}
                    placeholder="Naya kaam likho..."
                    placeholderTextColor={theme.textMuted}
                    value={newTodoTitle}
                    onChangeText={setNewTodoTitle}
                    editable={!todoBusy}
                    onSubmitEditing={async () => {
                      const t = newTodoTitle.trim();
                      if (!t || todoBusy) return;
                      try {
                        setTodoBusy(true);
                        // Optimistic clear: user ko immediately input blank dikhna chahiye
                        setNewTodoTitle('');
                        const token = await AsyncStorage.getItem('khata_session');
                        if (!token) return;
                        await axios.post(
                          `${API_URL}/todos`,
                          { title: t, todo_date: todoDateYMD },
                          { headers: { Authorization: `Bearer ${token}` } }
                        );
                        await fetchTodos();
                      } catch (e) {
                        console.log(e);
                        Alert.alert('Todo add failed', String((e as any)?.response?.data?.error || (e as any)?.message || e));
                      } finally {
                        setTodoBusy(false);
                      }
                    }}
                  />
                  <TouchableOpacity
                    style={[styles.todoAddBtn, todoBusy && { opacity: 0.6 }]}
                    disabled={todoBusy || !newTodoTitle.trim()}
                    onPress={async () => {
                      const t = newTodoTitle.trim();
                      if (!t || todoBusy) return;
                      try {
                        setTodoBusy(true);
                        setNewTodoTitle('');
                        const token = await AsyncStorage.getItem('khata_session');
                        if (!token) return;
                        await axios.post(
                          `${API_URL}/todos`,
                          { title: t, todo_date: todoDateYMD },
                          { headers: { Authorization: `Bearer ${token}` } }
                        );
                        await fetchTodos();
                      } catch (e) {
                        console.log(e);
                        Alert.alert('Todo add failed', String((e as any)?.response?.data?.error || (e as any)?.message || e));
                      } finally {
                        setTodoBusy(false);
                      }
                    }}
                  >
                    {todoBusy ? (
                      <ActivityIndicator size="small" color={theme.black} />
                    ) : (
                      <Plus size={22} color={theme.black} />
                    )}
                  </TouchableOpacity>
                </View>
                {todos.length === 0 ? (
                  <Text style={styles.empty}>No to-dos yet. Add one above.</Text>
                ) : (
                  todos.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.todoRow}
                      activeOpacity={0.75}
                    >
                      <Circle size={22} color={theme.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.todoTitle}>{item.title}</Text>
                          <Text style={styles.todoDate}>
                            {item.todo_date
                              ? String(item.todo_date)
                              : item.created_at
                                ? String(item.created_at).slice(0, 10)
                                : ''}
                          </Text>
                          <View style={styles.todoStatusWrap}>
                            <TouchableOpacity
                              style={[
                                styles.todoStatusBtn,
                                (item.status ?? 'pending') === 'pending' && styles.todoStatusBtnOnPending,
                              ]}
                              onPress={async () => {
                                try {
                                  setTodoBusy(true);
                                  const token = await AsyncStorage.getItem('khata_session');
                                  if (!token) return;
                                  await axios.patch(
                                    `${API_URL}/todos/${item.id}/status`,
                                    { status: 'pending' },
                                    { headers: { Authorization: `Bearer ${token}` } },
                                  );
                                  await fetchTodos();
                                } catch (e) {
                                  Alert.alert(
                                    'Status update failed',
                                    String((e as any)?.response?.data?.error || (e as any)?.message || e),
                                  );
                                } finally {
                                  setTodoBusy(false);
                                }
                              }}
                            >
                              <Text style={styles.todoStatusBtnTxt}>Pending</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.todoStatusBtn,
                                (item.status ?? 'pending') === 'ongoing' && styles.todoStatusBtnOnOngoing,
                              ]}
                              onPress={async () => {
                                try {
                                  setTodoBusy(true);
                                  const token = await AsyncStorage.getItem('khata_session');
                                  if (!token) return;
                                  await axios.patch(
                                    `${API_URL}/todos/${item.id}/status`,
                                    { status: 'ongoing' },
                                    { headers: { Authorization: `Bearer ${token}` } },
                                  );
                                  await fetchTodos();
                                } catch (e) {
                                  Alert.alert(
                                    'Status update failed',
                                    String((e as any)?.response?.data?.error || (e as any)?.message || e),
                                  );
                                } finally {
                                  setTodoBusy(false);
                                }
                              }}
                            >
                              <Text style={styles.todoStatusBtnTxt}>Ongoing</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.todoStatusBtn, styles.todoStatusBtnOnDone]}
                              onPress={async () => {
                                try {
                                  setTodoBusy(true);
                                  const token = await AsyncStorage.getItem('khata_session');
                                  if (!token) return;
                                  await axios.delete(`${API_URL}/todos/${item.id}`, {
                                    headers: { Authorization: `Bearer ${token}` },
                                  });
                                  await fetchTodos();
                                } catch (e) {
                                  Alert.alert(
                                    'Could not remove',
                                    String((e as any)?.response?.data?.error || (e as any)?.message || e),
                                  );
                                } finally {
                                  setTodoBusy(false);
                                }
                              }}
                            >
                              <Text style={styles.todoStatusBtnTxt}>Done</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : visibleTransactions.length === 0 ? (
              <Text style={styles.empty}>No records in this view. Tap + to add.</Text>
            ) : (() => {
                const categorySpending: Record<string, number> = {};
                // Calculate spending for the SELECTED month across ALL transactions we have
                transactions.forEach((t: any) => {
                  const d = new Date(t.transaction_date);
                  const isSameMonth = d.getMonth() === mNow && d.getFullYear() === yNow;
                  if (isSameMonth && t.type === 'expense' && t.category_id) {
                    categorySpending[t.category_id] = (categorySpending[t.category_id] || 0) + Number(t.amount);
                  }
                });

                return visibleTransactions.map((tx: any, i: number) => {
                  const isInc = tx.type === 'income';
                  const cat = tx.categories;
                  const bg = cat?.color ? `${cat.color}33` : theme.grayBg;
                  
                  const monthlyBudget = cat?.monthly_budget ? Number(cat.monthly_budget) : null;
                  const totalSpent = tx.category_id ? categorySpending[tx.category_id] : 0;
                  const isOverBudget = !isInc && !!monthlyBudget && totalSpent > monthlyBudget;

                  const isHisab = listFilter === 'hisab';
                  const hisabType = tx.note?.toLowerCase().includes('given') || tx.type === 'expense' ? 'given' : 'taken';
                  
                  return (
                    <TouchableOpacity
                      key={tx.id || i}
                      style={[styles.txRow, isOverBudget ? { borderLeftWidth: 4, borderLeftColor: '#DC2626', paddingLeft: 8 } : null]}
                      activeOpacity={0.7}
                      onPress={() => _props.navigation.navigate('AddTransaction', {
                        type: tx.type as 'income' | 'expense',
                        transactionId: tx.id
                      })}
                    >
                      <CategoryIconCircle 
                        iconKey={cat?.icon} 
                        color={theme.text} 
                        bg={bg} 
                        size={20} 
                        iconUrl={cat?.icon_url} 
                        onPress={() => {
                          if (cat?.icon_url) {
                            setViewerUrl(cat.icon_url);
                            setViewerVisible(true);
                          }
                        }}
                      />
                      <View style={styles.txMid}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.txCat, isOverBudget ? { color: '#DC2626' } : null]} numberOfLines={1}>
                            {cat?.name || 'Uncategorized'}
                          </Text>
                          {isOverBudget && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 4 }}>
                              <AlertTriangle size={10} color="#DC2626" />
                              <Text style={{ fontSize: 9, fontWeight: '900', color: '#DC2626' }}>LIMIT EXCEEDED</Text>
                            </View>
                          )}
                          {isHisab && (
                            <View style={[styles.hisabBadge, hisabType === 'given' ? styles.hisabBadgeGiven : styles.hisabBadgeTaken]}>
                              <Text style={styles.hisabBadgeTxt}>{hisabType === 'given' ? 'GIVEN' : 'TAKEN'}</Text>
                            </View>
                          )}
                        </View>
                        
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {tx.receipt_url && (
                            <TouchableOpacity 
                              onPress={() => {
                                setViewerUrl(tx.receipt_url);
                                setViewerVisible(true);
                              }}
                              style={{ marginRight: 6 }}
                            >
                              <FileText size={14} color={theme.yellowDark} />
                            </TouchableOpacity>
                          )}
                          <Text style={styles.txNote} numberOfLines={1}>
                            {tx.parties ? `${tx.parties.name}${tx.note ? ' • ' + tx.note : ''}` : (tx.note || '')}
                          </Text>
                        </View>
                      </View>
                      <Text style={[
                        styles.txAmt, 
                        isHisab 
                          ? (hisabType === 'given' ? styles.txAmtOut : styles.txAmtIn)
                          : (isInc ? styles.txAmtIn : (isOverBudget ? { color: '#DC2626' } : styles.txAmtOut))
                      ]}>
                        {isHisab 
                          ? (hisabType === 'given' ? '-' : '+') 
                          : (isInc ? '' : '-')}₹ {Number(tx.amount).toLocaleString()}
                      </Text>
                    </TouchableOpacity>
                  );
                });
              })()}
          </View>
        </View>
      </ScrollView>

      <Modal visible={viewerVisible} transparent={true} onRequestClose={() => setViewerVisible(false)}>
        <ImageViewer
          imageUrls={[{ url: viewerUrl }]}
          onCancel={() => setViewerVisible(false)}
          enableSwipeDown={true}
          renderHeader={() => (
            <TouchableOpacity 
              style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 }} 
              onPress={() => setViewerVisible(false)}
            >
              <X size={30} color="#fff" />
            </TouchableOpacity>
          )}
        />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.yellow },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: 100 },
  sheet: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: theme.white,
    ...shadows.sheet,
  },
  sheetYellow: {
    backgroundColor: theme.yellow,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  mmTitle: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: theme.black, // Dark text for light background
    marginBottom: 12,
  },
  dateRow: { alignItems: 'flex-start', marginBottom: 16, width: '100%' },
  filterRow: { flexDirection: 'row', marginTop: 12 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.05)', // Muted background
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  filterChipOn: { backgroundColor: theme.black, borderColor: theme.black },
  filterChipTxt: { fontSize: 13, fontWeight: '800', color: theme.text },
  filterChipTxtOn: { color: theme.white }, 
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  datePillText: { fontSize: 16, fontWeight: '800', color: theme.black },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  summaryCol: { 
    flex: 1, 
    backgroundColor: 'rgba(255,255,255,0.6)', 
    padding: 10, 
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted, marginBottom: 4 }, 
  summaryVal: { fontSize: 14, fontWeight: '900', color: theme.black }, // Adjusted size for boxes
  sheetWhite: {
    backgroundColor: theme.white,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    minHeight: 120,
  },
  empty: {
    textAlign: 'center',
    color: theme.textMuted,
    paddingVertical: 32,
    fontWeight: '600',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  txMid: { flex: 1, marginLeft: 12 },
  txCat: { fontSize: 16, fontWeight: '800', color: theme.text },
  txNote: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
  txAmt: { fontSize: 16, fontWeight: '900' },
  txAmtIn: { color: '#2e7d32' },
  txAmtOut: { color: theme.black },
  hisabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hisabBadgeGiven: {
    backgroundColor: '#fee2e2',
  },
  hisabBadgeTaken: {
    backgroundColor: '#dcfce7',
  },
  hisabBadgeTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.black,
  },
  todoWrap: { gap: 12, paddingTop: 4 },
  todoHint: { fontSize: 12, fontWeight: '600', color: theme.textMuted, marginBottom: 4 },
  todoAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  todoInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: theme.text,
    backgroundColor: theme.offWhite,
  },
  todoAddBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: theme.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.black,
  },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  todoTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: theme.text },
  todoDate: { fontSize: 12, fontWeight: '700', color: theme.textMuted, marginTop: 4 },
  todoStatusWrap: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  todoStatusBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  todoStatusBtnTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.textMuted,
  },
  todoStatusBtnOnPending: { backgroundColor: 'rgba(59,130,246,0.15)', borderColor: '#3B82F6' },
  todoStatusBtnOnOngoing: { backgroundColor: 'rgba(245,158,11,0.18)', borderColor: '#F59E0B' },
  todoStatusBtnOnDone: { backgroundColor: 'rgba(16,185,129,0.18)', borderColor: '#10B981' },
  waCard: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: theme.offWhite,
    borderWidth: 1,
    borderColor: theme.border,
  },
  waTitle: { fontSize: 15, fontWeight: '900', color: theme.black, marginBottom: 6 },
  waHint: { fontSize: 12, fontWeight: '600', color: theme.textMuted, marginBottom: 10, lineHeight: 17 },
  waEmpty: { fontSize: 13, fontWeight: '600', color: theme.textMuted, fontStyle: 'italic' },
  waRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  waName: { fontSize: 15, fontWeight: '800', color: theme.text },
  waBal: { fontSize: 12, fontWeight: '700', color: theme.textMuted, marginTop: 2 },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#25D366',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  waBtnTxt: { fontSize: 13, fontWeight: '900', color: '#fff' },
});
