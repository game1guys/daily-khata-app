import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Delete, Calendar, ChevronDown, UserPlus, Edit2, X, User, Image as ImageIcon, Upload, Crown } from 'lucide-react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { launchImageLibrary } from 'react-native-image-picker';
import ImageViewer from 'react-native-image-zoom-viewer';
import { RootStackParamList } from '../../App';
import { API_URL } from '../config/api';
import { theme } from '../theme/colors';
import { CategoryIconCircle } from '../utils/categoryIcon';
import * as ProfileCache from '../utils/profileCache';
import { useAlert } from '../context/AlertContext';

type Props = NativeStackScreenProps<RootStackParamList, 'AddTransaction'>;

type UdharDirection = 'given' | 'taken' | null;

function softCircleBg(hex?: string) {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return theme.grayBg;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.28)`;
}

function evalFormula(raw: string): number | null {
  const s = raw.replace(/\s/g, '');
  const m = s.match(/^(\d+(?:\.\d*)?)([+-])(\d+(?:\.\d*)?)$/);
  if (!m) {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  const a = parseFloat(m[1]);
  const b = parseFloat(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return m[2] === '+' ? a + b : a - b;
}

function isHisabKhataCategoryName(name: string) {
  return /udhar|उधार|loan|borrow|credit|debt|hisab|khata/i.test(name);
}

export default function AddTransactionScreen({ navigation, route }: Props) {
  const { showAlert } = useAlert();
  const initialType = route.params?.type ?? 'expense';
  const isEditMode = !!route.params?.transactionId;
  const [txType, setTxType] = useState<'expense' | 'income'>(initialType);

  const [categories, setCategories] = useState<any[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

  const [parties, setParties] = useState<any[]>([]);
  const [partyId, setPartyId] = useState<string | null>(null);
  const [partyDisplayName, setPartyDisplayName] = useState('');
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [partySearch, setPartySearch] = useState('');
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyEmail, setNewPartyEmail] = useState('');
  const [newPartyPhone, setNewPartyPhone] = useState('');
  const [newPartyFrequency, setNewPartyFrequency] = useState(0); // 0, 1, 2, 3
  const [newPartyStartDate, setNewPartyStartDate] = useState(new Date());
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [showPartyDatePicker, setShowPartyDatePicker] = useState(false);

  const [udharType, setUdharType] = useState<UdharDirection>(null);

  const [formula, setFormula] = useState('0');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customImage, setCustomImage] = useState<any>(null);
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  const [invoiceImage, setInvoiceImage] = useState<any>(null);
  const [showInvoiceViewer, setShowInvoiceViewer] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerVisible, setViewerVisible] = useState(false);

  const [userTier, setUserTier] = useState('free');

  useEffect(() => {
    (async () => {
      const cached = await AsyncStorage.getItem('khata_profile');
      if (cached) {
        const parsed = JSON.parse(cached);
        setUserTier(parsed.subscription?.tier || 'free');
      }
    })();
  }, []);

  const isPremium = userTier !== 'free';

  const pickInvoice = async () => {
    if (!isPremium) {
      showAlert({
        title: 'Premium Feature',
        message: 'Invoice upload is only available for premium users. Upgrade to unlock!',
        type: 'warning',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade Now', onPress: () => navigation.navigate('UpgradePlan') }
        ]
      });
      return;
    }

    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.7,
    });

    if (result.assets && result.assets.length > 0) {
      setInvoiceImage(result.assets[0]);
    }
  };

  const pickCustomCategoryImage = async () => {
    if (!isPremium) {
      showAlert({
        title: 'Premium Feature',
        message: 'Using custom images for categories is a premium feature. Upgrade to unlock!',
        type: 'warning',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade Now', onPress: () => navigation.navigate('UpgradePlan') }
        ]
      });
      return;
    }

    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.5,
    });

    if (result.assets && result.assets.length > 0) {
      setCustomImage(result.assets[0]);
    }
  };

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId]
  );

  const showHisabKhataSection = useMemo(() => {
    if (!selectedCategory) return !!partyId || !!partyDisplayName;
    return isHisabKhataCategoryName(selectedCategory.name) || !!partyId || !!partyDisplayName;
  }, [selectedCategory, partyId, partyDisplayName]);

  const [oldTxAmount, setOldTxAmount] = useState<number>(0);
  const [loadingTx, setLoadingTx] = useState(false);

  const fetchParties = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('khata_session');
      const res = await axios.get(`${API_URL}/parties`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setParties(res.data?.parties || []);
    } catch (e) {
      console.log('parties error', e);
    }
  }, []);

  const fetchCats = useCallback(async (keepSelectedId?: string | null) => {
    setLoadingCats(true);
    try {
      const token = await AsyncStorage.getItem('khata_session');
      // Format current date to YYYY-MM
      const my = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const res = await axios.get(`${API_URL}/categories?month_year=${my}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = (res.data?.categories || []).filter((c: any) => c.type === txType);
      
      // DEBUG: Log categories with icon_url
      console.log('Categories Loaded:', list.filter((c: any) => c.icon_url).map((c: any) => ({ name: c.name, url: c.icon_url })));
      
      setCategories(list);
      if (keepSelectedId !== undefined) {
        setCategoryId(keepSelectedId);
      } else {
        setCategoryId(null);
      }
    } catch (e) {
      console.log('categories error', e);
    } finally {
      setLoadingCats(false);
    }
  }, [txType, date]); // Re-fetch when date changes to get that month's budget

  useEffect(() => {
      fetchCats();
    }, [txType, date, fetchCats]); // Keep it simple to avoid infinite loop with categoryId

  useEffect(() => {
    fetchCats();
  }, [fetchCats]);

  useEffect(() => {
    fetchParties();
  }, [fetchParties]);

  const fetchTransactionForEdit = useCallback(async () => {
    if (!route.params?.transactionId) return;
    try {
      setLoadingTx(true);
      const token = await AsyncStorage.getItem('khata_session');
      const res = await axios.get(`${API_URL}/transactions/${route.params.transactionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const tx = res.data?.transaction;
      if (tx) {
        setTxType(tx.type);
        setFormula(String(tx.amount));
        setOldTxAmount(Number(tx.amount));
        setMemo(tx.note || '');
        await fetchCats(tx.category_id); // Ensure cats are loaded before setting ID
        setDate(new Date(tx.transaction_date));
        if (tx.parties) {
          setPartyId(tx.parties.id);
          setPartyDisplayName(tx.parties.name);
        }
        if (tx.receipt_url) {
          setInvoiceImage({ uri: tx.receipt_url, fileName: 'Current Invoice' });
        }
      }
    } catch (e) {
      console.log('fetch transaction error', e);
    } finally {
      setLoadingTx(false);
    }
  }, [route.params?.transactionId, fetchCats]);

  useEffect(() => {
    fetchTransactionForEdit();
  }, [fetchTransactionForEdit]);

  useEffect(() => {
    setUdharType(null);
  }, [categoryId]);

  const filteredParties = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter((p) => p.name?.toLowerCase().includes(q));
  }, [parties, partySearch]);

  const appendDigit = (d: string) => {
    setFormula((prev) => {
      if (prev === '0' && d !== '.') return d;
      if (d === '.' && prev.includes('.')) return prev;
      return prev + d;
    });
  };

  const backspace = () => {
    setFormula((prev) => {
      if (prev.length <= 1) return '0';
      return prev.slice(0, -1);
    });
  };

  const appendOp = (op: '+' | '-') => {
    setFormula((prev) => {
      if (/[+-]$/.test(prev)) return prev.slice(0, -1) + op;
      return `${prev}${op}`;
    });
  };

  const onEquals = () => {
    const v = evalFormula(formula);
    if (v != null) setFormula(String(Math.round(v * 100) / 100));
  };

  const resolvedAmount = (): number | null => {
    let s = formula.replace(/\s/g, '');
    s = s.replace(/[+-]$/, '');
    const v = evalFormula(s);
    if (v == null || !Number.isFinite(v)) return null;
    return Math.round(v * 100) / 100;
  };

  const submitCustom = async () => {
    const name = customName.trim();
    if (!name) return;
    try {
      setCreatingCustom(true);
      setSaving(true);
      const token = await AsyncStorage.getItem('khata_session');
      if (!token) throw new Error('No session');

      // --- FREE PLAN LIMIT CHECK ---
      try {
        const profileRes = await axios.get(`${API_URL}/profile/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const tier = profileRes.data?.subscription?.tier || 'free';
        
        if (tier === 'free' && !isEditMode) {
          // 1. Check monthly entry limit (100)
          const my = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const txRes = await axios.get(`${API_URL}/transactions?month_year=${my}&limit=101`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (txRes.data?.transactions?.length >= 100) {
            showAlert({ 
              title: 'Limit Reached', 
              message: 'Free plan is limited to 100 entries per month. Please upgrade for unlimited access.', 
              type: 'error' 
            });
            setSaving(false);
            return;
          }

          // 2. Check parties limit (3)
          if (partyDisplayName.trim()) {
            const partiesRes = await axios.get(`${API_URL}/parties`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const existingParties = partiesRes.data?.parties || [];
            if (existingParties.length >= 3 && !existingParties.find((p: any) => p.name === partyDisplayName.trim())) {
              showAlert({ 
                title: 'Limit Reached', 
                message: 'Free plan is limited to 3 parties. Please upgrade for unlimited Hisab Khata.', 
                type: 'error' 
              });
              setSaving(false);
              return;
            }
          }
        }
      } catch (limitErr) {
        console.log('Limit check failed (skipping):', limitErr);
      }
      // -----------------------------
      
      const formData = new FormData();
      formData.append('name', name);
      formData.append('type', txType);
      formData.append('icon', 'Tags');
      formData.append('color', '#FFD740');
      
      if (customImage) {
        formData.append('image', {
          uri: customImage.uri,
          name: customImage.fileName || 'custom_cat.jpg',
          type: customImage.type || 'image/jpeg',
        } as any);
      }

      const res = await axios.post(
        `${API_URL}/categories/custom`,
        formData,
        { 
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          } 
        }
      );
      const cat = res.data?.category;
      if (cat?.id) {
        await fetchCats(cat.id);
      }
      setCustomOpen(false);
      setCustomName('');
      setCustomImage(null);
      setCategoryModalOpen(false);
    } catch (e: any) {
      console.log('custom category error', e);
      showAlert({
        title: 'Error',
        message: e.response?.data?.error || 'Could not create category',
        type: 'error'
      });
    } finally {
      setCreatingCustom(false);
      setSaving(false);
    }
  };

  const selectParty = (p: { id: string; name: string }) => {
    setPartyId(p.id);
    setPartyDisplayName(p.name);
    setPartyModalOpen(false);
    setPartySearch('');
    setNewPartyName('');
  };

  const createPartyQuick = async () => {
    const name = (newPartyName.trim() || partySearch.trim());
    if (!name) return;
    try {
      setSaving(true);
      const token = await AsyncStorage.getItem('khata_session');
      const headers = { Authorization: `Bearer ${token}` };
      const payload = { 
        name, 
        email: newPartyEmail.trim() || undefined,
        phone: newPartyPhone.trim() || undefined,
        reminder_frequency: newPartyFrequency,
        reminder_start_date: newPartyFrequency > 0 ? newPartyStartDate.toISOString() : undefined
      };

      let res;
      if (editingPartyId) {
        res = await axios.put(`${API_URL}/parties/${editingPartyId}`, payload, { headers });
      } else {
        res = await axios.post(`${API_URL}/parties`, payload, { headers });
      }

      const p = res.data?.party;
      if (p?.id) {
        await fetchParties();
        selectParty(p);
        resetPartyForm();
      }
    } catch (e) {
      console.log('party save error', e);
    } finally {
      setSaving(false);
    }
  };

  const resetPartyForm = () => {
    setNewPartyName('');
    setNewPartyEmail('');
    setNewPartyPhone('');
    setNewPartyFrequency(0);
    setNewPartyStartDate(new Date());
    setEditingPartyId(null);
  };

  const startEditParty = (p: any) => {
    setEditingPartyId(p.id);
    setNewPartyName(p.name);
    setNewPartyEmail(p.email || '');
    setNewPartyPhone(p.phone || '');
    setNewPartyFrequency(p.reminder_frequency || 0);
    if (p.reminder_start_date) {
      setNewPartyStartDate(new Date(p.reminder_start_date));
    } else {
      setNewPartyStartDate(new Date());
    }
  };

  const clearParty = () => {
    setPartyId(null);
    setPartyDisplayName('');
    setUdharType(null);
  };

  const onDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    const amt = resolvedAmount();
    if (!amt || amt <= 0 || !categoryId) return;

    // Free Plan Restrictions
    const me = await ProfileCache.loadCachedMe();
    const isFree = me?.subscription?.tier === 'free';

    if (isFree) {
      // 1. Check Party Limit
      if (partyDisplayName.trim() && !partyId) {
        if (parties.length >= 3) {
          showAlert({
            title: 'Free Plan Limit',
            message: 'You can only have up to 3 parties in the Free plan. Please upgrade to Premium for unlimited parties.',
            type: 'warning'
          });
          return;
        }
      }
      
      // Monthly transaction limit (100/mo for free) is enforced on POST /transactions; pre-check when creating custom category above.
    }

    if (showHisabKhataSection && !partyId && !partyDisplayName.trim()) {
      showAlert({
        title: 'Party required',
        message: 'Choose or create a party before recording Hisab Khata.',
        type: 'warning'
      });
      return;
    }

    // Budget Warning Check
    const selectedCat = categories.find(c => c.id === categoryId);
    if (selectedCat && selectedCat.monthly_budget && txType === 'expense') {
      const budget = Number(selectedCat.monthly_budget);
      const currentSpent = Number(selectedCat.spent_amount || 0);
      
      // If we are editing, we subtract the old amount first to see the true "spent"
      const adjustedSpent = isEditMode ? (currentSpent - oldTxAmount) : currentSpent;
      const totalAfterThis = adjustedSpent + amt;

      if (totalAfterThis > budget) {
        showAlert({
          title: 'Budget Warning',
          message: `This will take your "${selectedCat.name}" expenses to ₹${totalAfterThis}, which is over your ₹${budget} budget. Do you want to continue?`,
          type: 'warning',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Yes, Save', onPress: () => performSave(amt) }
          ]
        });
        return;
      }
    }

    await performSave(amt);
  };

  const performSave = async (amt: number) => {
    try {
      setSaving(true);
      const token = await AsyncStorage.getItem('khata_session');
      
      const formData = new FormData();
      formData.append('amount', String(amt));
      formData.append('type', txType);
      formData.append('category_id', categoryId!);
      formData.append('note', memo.trim() || '');
      formData.append('transaction_date', date.toISOString());

      if (partyId) {
        formData.append('party_id', partyId);
      } else if (partyDisplayName.trim()) {
        formData.append('party_name', partyDisplayName.trim());
      }

      if (udharType) {
        formData.append('udhar_type', udharType);
      }

      if (invoiceImage) {
        if (invoiceImage.uri.startsWith('http')) {
          formData.append('receipt_url', invoiceImage.uri);
        } else {
          formData.append('invoice', {
            uri: invoiceImage.uri,
            name: invoiceImage.fileName || 'invoice.jpg',
            type: invoiceImage.type || 'image/jpeg',
          } as any);
        }
      }

      const headers = { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      };

      if (isEditMode) {
        await axios.put(`${API_URL}/transactions/${route.params?.transactionId}`, formData, { headers });
      } else {
        await axios.post(`${API_URL}/transactions`, formData, { headers });
      }

      navigation.goBack();
    } catch (e: any) {
      showAlert({
        title: 'Could not save',
        message: e.response?.data?.error || e.message || 'Try again.',
        type: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    showAlert({
      title: 'Delete Transaction',
      message: 'Are you sure you want to delete this record?',
      type: 'confirm',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              const token = await AsyncStorage.getItem('khata_session');
              await axios.delete(`${API_URL}/transactions/${route.params?.transactionId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              navigation.goBack();
            } catch (e: any) {
              showAlert({
                title: 'Could not delete',
                message: e.response?.data?.error || e.message || 'Try again.',
                type: 'error'
              });
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    });
  };

  const selectCategoryFromModal = (id: string) => {
    setCategoryId(id);
    const cat = categories.find(c => c.id === id);
    if (cat) {
      setBudgetInput(cat.monthly_budget ? String(cat.monthly_budget) : '');
    }
    setCategoryModalOpen(false);
  };

  const saveBudget = async () => {
    if (!categoryId) return;
    try {
      setSaving(true);
      const token = await AsyncStorage.getItem('khata_session');
      // Use the transaction date for budget context
      const my = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      const payloadById = {
        monthly_budget: budgetInput ? Number(budgetInput) : null,
        month_year: my,
      };

      const payloadWithCategoryId = {
        category_id: categoryId,
        monthly_budget: budgetInput ? Number(budgetInput) : null,
        month_year: my,
      };

      // Different backend deployments use different routes. Try all known ones before failing.
      const attempts: Array<() => Promise<any>> = [
        () => axios.put(`${API_URL}/categories/${categoryId}/budget`, payloadById, { headers: { Authorization: `Bearer ${token}` } }),
        () => axios.post(`${API_URL}/categories/${categoryId}/budget`, payloadById, { headers: { Authorization: `Bearer ${token}` } }),
        () => axios.post(`${API_URL}/categories/update-budget`, payloadWithCategoryId, { headers: { Authorization: `Bearer ${token}` } }),
        () => axios.put(`${API_URL}/categories/update-budget`, payloadWithCategoryId, { headers: { Authorization: `Bearer ${token}` } }),
        () => axios.post(`${API_URL}/categories/set-monthly-budget`, payloadWithCategoryId, { headers: { Authorization: `Bearer ${token}` } }),
        () => axios.post(`${API_URL}/categories/update`, payloadWithCategoryId, { headers: { Authorization: `Bearer ${token}` } }),
      ];

      let lastErr: any = null;
      for (const run of attempts) {
        try {
          await run();
          lastErr = null;
          break;
        } catch (e: any) {
          const status = e?.response?.status;
          // If it's a 404, keep trying other routes. Otherwise, surface immediately.
          if (status && status !== 404) throw e;
          lastErr = e;
        }
      }
      if (lastErr) throw lastErr;
      await fetchCats(categoryId);
      setEditingBudget(false);
      showAlert({ title: 'Success', message: 'Budget updated for this month!', type: 'success' });
    } catch (err: any) {
      console.log('Budget update error details:', err.response?.data || err.message);
      const hint =
        err?.response?.status === 404
          ? 'Budget API missing on server. Deploy latest backend category routes (budget endpoints), then retry.'
          : null;
      const msg = err.response?.data?.error || err.message || 'Could not update budget';
      showAlert({ title: 'Error', message: hint ? `${msg}\n\n${hint}` : msg, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const amt = resolvedAmount();
  const canSave = !!amt && amt > 0 && !!categoryId;

  const isToday = (d: Date) => {
    const today = new Date();
    return d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
  };

  const formatDate = (d: Date) => {
    if (isToday(d)) return 'Today';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  const screenTitle = isEditMode ? 'Edit' : 'New record';

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.sheet}>
        <View style={styles.yellowBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{screenTitle}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {isEditMode && (
              <TouchableOpacity onPress={handleDelete} hitSlop={12} style={{ marginRight: 16 }}>
                <Delete size={22} color={theme.black} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleSave}
              disabled={!canSave || saving}
              hitSlop={12}
              style={styles.saveHeaderBtn}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color={theme.black} />
              ) : (
                <Text style={[styles.saveHeaderTxt, !canSave && styles.saveHeaderTxtDisabled]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )}

        <ScrollView 
          style={{ flex: 1 }} 
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false} 
          keyboardShouldPersistTaps="handled"
        >
          {loadingTx ? (
            <View style={{ flex: 1, height: 400, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={theme.yellow} />
              <Text style={{ marginTop: 12, fontWeight: '700', color: theme.textMuted }}>Loading record...</Text>
            </View>
          ) : (
            <>
              <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segBtn, txType === 'expense' && styles.segBtnOn]}
              onPress={() => setTxType('expense')}
              activeOpacity={0.9}
            >
              <Text style={[styles.segTxt, txType === 'expense' && styles.segTxtOn]}>Expenses</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segBtn, txType === 'income' && styles.segBtnOn]}
              onPress={() => setTxType('income')}
              activeOpacity={0.9}
            >
              <Text style={[styles.segTxt, txType === 'income' && styles.segTxtOn]}>Income</Text>
            </TouchableOpacity>
          </View>

          {loadingCats ? (
            <View style={styles.loader}>
              <ActivityIndicator color={theme.black} />
            </View>
          ) : (
            <View style={styles.categoryBlock}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
                <Text style={styles.pickLabel}>Category</Text>
                {selectedCategory && (
                  <View style={{ alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setEditingBudget(!editingBudget)}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: theme.yellow }}>
                        {selectedCategory.monthly_budget ? `Budget: ₹${selectedCategory.monthly_budget}` : 'Set Budget'}
                      </Text>
                    </TouchableOpacity>
                    {selectedCategory.monthly_budget && (
                      <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textMuted, marginTop: 2 }}>
                        Monthly context: {date.toLocaleString('default', { month: 'short', year: 'numeric' })}
                      </Text>
                    )}
                  </View>
                )}
              </View>
              
              <TouchableOpacity
                style={styles.categoryChooseBtn}
                onPress={() => setCategoryModalOpen(true)}
                activeOpacity={0.88}
              >
                <View style={styles.categoryChooseLeft}>
                  {selectedCategory ? (
                    <CategoryIconCircle
                      iconKey={selectedCategory.icon}
                      color={selectedCategory.color}
                      bg={softCircleBg(selectedCategory.color)}
                      size={20}
                      iconUrl={selectedCategory.icon_url}
                      onPress={() => {
                        if (selectedCategory.icon_url) {
                          setViewerUrl(selectedCategory.icon_url);
                          setViewerVisible(true);
                        }
                      }}
                    />
                  ) : (
                    <View style={[styles.catSmallCircle, { backgroundColor: theme.grayBg }]} />
                  )}
                  <Text
                    style={[styles.categoryChooseTxt, !selectedCategory && styles.categoryChoosePlaceholder]}
                    numberOfLines={1}
                  >
                    {selectedCategory ? selectedCategory.name : 'Choose category'}
                  </Text>
                </View>
                <ChevronDown size={22} color={theme.textMuted} />
              </TouchableOpacity>

              {editingBudget && (
                <View style={{ marginTop: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TextInput
                    style={{ flex: 1, backgroundColor: theme.white, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: theme.border, fontWeight: '700' }}
                    placeholder="Monthly Budget (₹)"
                    keyboardType="numeric"
                    value={budgetInput}
                    onChangeText={setBudgetInput}
                  />
                  <TouchableOpacity 
                    onPress={saveBudget}
                    style={{ backgroundColor: theme.yellow, padding: 12, borderRadius: 10 }}
                  >
                    <Text style={{ fontWeight: '900', color: theme.black }}>Set</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <View style={styles.metaSection}>
            <Text style={styles.metaLabel}>Party (optional)</Text>
            <TouchableOpacity
              style={styles.partyRow}
              onPress={() => setPartyModalOpen(true)}
              activeOpacity={0.9}
            >
              <View style={styles.partyIconSlot}>
                <UserPlus size={20} color={theme.text} />
              </View>
              <Text style={[styles.partyRowText, !partyDisplayName && styles.partyPlaceholder]} numberOfLines={1}>
                {partyDisplayName || 'Tap to choose or add party'}
              </Text>
              <ChevronDown size={20} color={theme.textMuted} />
            </TouchableOpacity>
            {partyDisplayName ? (
              <TouchableOpacity onPress={clearParty} hitSlop={8}>
                <Text style={styles.clearParty}>Clear party</Text>
              </TouchableOpacity>
            ) : null}

            {showHisabKhataSection ? (
              <View style={styles.udharBlock}>
                <Text style={styles.metaLabel}>Hisab khata (optional)</Text>
                <Text style={styles.udharHint}>
                  Given = I lent · Taken = I borrowed. Saved to your party ledger after the main entry.
                </Text>
                <View style={styles.udharRow}>
                  <TouchableOpacity
                    style={[styles.udharChip, styles.udharChipLeft, udharType === 'given' && styles.udharChipOn]}
                    onPress={() => setUdharType(udharType === 'given' ? null : 'given')}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.udharChipTxt, udharType === 'given' && styles.udharChipTxtOn]}>Given</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.udharChip, udharType === 'taken' && styles.udharChipOn]}
                    onPress={() => setUdharType(udharType === 'taken' ? null : 'taken')}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.udharChipTxt, udharType === 'taken' && styles.udharChipTxtOn]}>Taken</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <View style={styles.invoiceSection}>
              <Text style={styles.metaLabel}>Invoice / Receipt (Optional)</Text>
              <TouchableOpacity 
                style={[styles.invoiceBtn, invoiceImage && styles.invoiceBtnSelected]} 
                onPress={() => {
                  if (invoiceImage) {
                    setShowInvoiceViewer(true);
                  } else {
                    pickInvoice();
                  }
                }}
                activeOpacity={0.8}
              >
                {invoiceImage ? (
                  <View style={styles.invoicePreview}>
                    <Image source={{ uri: invoiceImage.uri }} style={styles.invoiceImg} />
                    <View style={styles.invoiceInfo}>
                      <Text style={styles.invoiceName} numberOfLines={1}>{invoiceImage.fileName || 'Invoice Selected'}</Text>
                      <TouchableOpacity onPress={() => setInvoiceImage(null)} hitSlop={10} style={{ padding: 4 }}>
                        <X size={20} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    <Upload size={20} color={theme.textMuted} />
                    <Text style={styles.invoiceBtnTxt}>Upload Invoice</Text>
                    {!isPremium && <Crown size={14} color={theme.yellow} style={{ marginLeft: 6 }} />}
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
            </>
          )}
        </ScrollView>

        <View style={styles.keypadWrap}>
          <TextInput
            style={styles.memo}
            placeholder="Memo : Enter a memo..."
            placeholderTextColor={theme.textMuted}
            value={memo}
            onChangeText={setMemo}
          />
          <Text style={styles.formulaDisp} numberOfLines={1}>
            {formula}
          </Text>

          <View style={styles.keypad}>
            <View style={styles.keyCol}>
              {[
                ['7', '8', '9'],
                ['4', '5', '6'],
                ['1', '2', '3'],
                ['.', '0', 'del'],
              ].map((row, ri) => (
                <View key={ri} style={styles.keyRow}>
                  {row.map((k) => (
                    <TouchableOpacity
                      key={k}
                      style={styles.keyBtn}
                      onPress={() => (k === 'del' ? backspace() : appendDigit(k))}
                    >
                      {k === 'del' ? (
                        <Delete size={22} color={theme.text} />
                      ) : (
                        <Text style={styles.keyTxt}>{k}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </View>
            <View style={styles.keySide}>
              <TouchableOpacity style={styles.sideBtn} onPress={() => setShowDatePicker(true)}>
                <Calendar size={20} color={theme.text} />
                <Text style={styles.sideTxt}>{formatDate(date)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sideBtn} onPress={() => appendOp('+')}>
                <Text style={styles.sideMath}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sideBtn} onPress={() => appendOp('-')}>
                <Text style={styles.sideMath}>-</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sideBtn, styles.equalsBtn]} onPress={onEquals}>
                <Text style={styles.equalsTxt}>=</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBig, (!canSave || saving) && styles.saveBigDisabled]}
            onPress={handleSave}
            disabled={!canSave || saving}
            activeOpacity={0.9}
          >
            {saving ? (
              <ActivityIndicator color={theme.black} />
            ) : (
              <Text style={styles.saveBigTxt}>Save entry</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={customOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Custom category</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Name"
              value={customName}
              onChangeText={setCustomName}
              autoFocus
            />
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalBtnGhost} onPress={() => setCustomOpen(false)}>
                <Text style={styles.modalBtnGhostTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPad, creatingCustom && { opacity: 0.7 }]}
                onPress={submitCustom}
                disabled={creatingCustom}
                activeOpacity={0.9}
              >
                {creatingCustom ? (
                  <ActivityIndicator size="small" color={theme.black} />
                ) : (
                  <Text style={styles.modalBtnTxt}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
            
            {isPremium && (
              <TouchableOpacity style={styles.customImagePicker} onPress={pickCustomCategoryImage}>
                {customImage ? (
                  <Image source={{ uri: customImage.uri }} style={styles.customImagePreview} />
                ) : (
                  <>
                    <ImageIcon size={24} color={theme.textMuted} />
                    <Text style={styles.customImagePickerTxt}>Add Custom Image</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={categoryModalOpen} transparent animationType="fade">
        <View style={styles.catModalOverlay}>
          <Pressable style={styles.catModalBackdrop} onPress={() => setCategoryModalOpen(false)} />
          <View style={styles.catModalSheet}>
            <Text style={styles.catModalTitle}>Choose category</Text>
            <FlatList
              data={categories}
              keyExtractor={(item) => String(item.id)}
              style={styles.catModalList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const sel = categoryId === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.catModalRow, sel && styles.catModalRowOn]}
                    onPress={() => selectCategoryFromModal(item.id)}
                    activeOpacity={0.85}
                  >
                    <CategoryIconCircle
                      iconKey={item.icon}
                      color={item.color}
                      bg={sel ? theme.yellow : softCircleBg(item.color)}
                      size={22}
                      iconUrl={item.icon_url}
                    />
                    <Text style={[styles.catModalRowTxt, sel && styles.catModalRowTxtOn]} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              ListFooterComponent={
                <TouchableOpacity
                  style={styles.catModalCustom}
                  onPress={() => {
                    setCategoryModalOpen(false);
                    setCustomOpen(true);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={[styles.catModalIcon, { backgroundColor: theme.grayBg }]}>
                    <Text style={styles.catModalPlus}>+</Text>
                  </View>
                  <Text style={styles.catModalRowTxt}>Custom category</Text>
                </TouchableOpacity>
              }
            />
            <TouchableOpacity style={styles.catModalClose} onPress={() => setCategoryModalOpen(false)}>
              <Text style={styles.catModalCloseTxt}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={partyModalOpen} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.partyModalCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>{editingPartyId ? 'Edit Party' : 'Party'}</Text>
              <TouchableOpacity onPress={() => { setPartyModalOpen(false); resetPartyForm(); }} hitSlop={12}>
                <X size={24} color={theme.black} />
              </TouchableOpacity>
            </View>

            {!editingPartyId && (
              <TextInput
                style={styles.modalInput}
                placeholder="Search or type new name"
                value={partySearch}
                onChangeText={setPartySearch}
              />
            )}
            <TextInput
              style={[styles.modalInput, styles.mtSm]}
              placeholder="Party name"
              value={newPartyName}
              onChangeText={setNewPartyName}
            />
            <TextInput
              style={[styles.modalInput, styles.mtSm]}
              placeholder="Email (for reminders)"
              value={newPartyEmail}
              onChangeText={setNewPartyEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.modalInput, styles.mtSm]}
              placeholder="Mobile (WhatsApp hisaab)"
              value={newPartyPhone}
              onChangeText={setNewPartyPhone}
              keyboardType="phone-pad"
            />
            <View style={styles.frequencyRow}>
              <Text style={styles.frequencyLabel}>Daily Reminders:</Text>
              {[0, 1, 2, 3].map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.frequencyChip, newPartyFrequency === f && styles.frequencyChipOn]}
                  onPress={() => setNewPartyFrequency(f)}
                >
                  <Text style={[styles.frequencyChipTxt, newPartyFrequency === f && styles.frequencyChipTxtOn]}>
                    {f === 0 ? 'None' : `${f}x`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {newPartyFrequency > 0 && (
              <View style={styles.mtSm}>
                <Text style={styles.inputLabel}>Start sending from:</Text>
                <TouchableOpacity 
                  style={styles.partyDateBtn} 
                  onPress={() => setShowPartyDatePicker(true)}
                >
                  <Calendar size={16} color={theme.black} />
                  <Text style={styles.partyDateTxt}>
                    {newPartyStartDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {showPartyDatePicker && (
              <DateTimePicker
                value={newPartyStartDate}
                mode="date"
                display="default"
                onChange={(_e, d) => {
                  setShowPartyDatePicker(false);
                  if (d) setNewPartyStartDate(d);
                }}
                minimumDate={new Date()}
              />
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {editingPartyId && (
                <TouchableOpacity 
                  style={[styles.createPartyBtn, { backgroundColor: theme.grayBg, flex: 1 }]}
                  onPress={resetPartyForm}
                >
                  <Text style={[styles.createPartyBtnTxt, { color: theme.text }]}>Cancel Edit</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={[styles.createPartyBtn, { flex: 2 }]}
                onPress={createPartyQuick} 
                activeOpacity={0.9}
              >
                <Text style={styles.createPartyBtnTxt}>
                  {editingPartyId ? 'Update Party' : 'Create party & select'}
                </Text>
              </TouchableOpacity>
            </View>

            {!editingPartyId && (
              <>
                {partySearch.trim() ? (
                  <TouchableOpacity
                    style={styles.useNameBtn}
                    onPress={() => {
                      setPartyId(null);
                      setPartyDisplayName(partySearch.trim());
                      setPartyModalOpen(false);
                      setPartySearch('');
                      setNewPartyName('');
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.useNameBtnTxt}>
                      Use &quot;{partySearch.trim()}&quot; without saving to list
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <FlatList
                  data={filteredParties}
                  keyExtractor={(item) => item.id}
                  style={styles.partyList}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }}>
                      <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }} onPress={() => selectParty(item)}>
                        <User size={18} color={theme.textMuted} style={{ marginRight: 8 }} />
                        <Text style={styles.partyListItemTxt}>{item.name}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={{ padding: 10 }}
                        onPress={() => startEditParty(item)}
                        hitSlop={8}
                      >
                        <Edit2 size={18} color={theme.textMuted} />
                      </TouchableOpacity>
                    </View>
                  )}
                  ListEmptyComponent={
                    <Text style={styles.partyEmpty}>No saved names yet. Create one above.</Text>
                  }
                />
              </>
            )}
            <TouchableOpacity style={styles.modalBtnGhost} onPress={() => { setPartyModalOpen(false); resetPartyForm(); }}>
              <Text style={[styles.modalBtnGhostTxt, { textAlign: 'center', marginTop: 8 }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

      <Modal visible={showInvoiceViewer} transparent={true} onRequestClose={() => setShowInvoiceViewer(false)}>
        <ImageViewer
          imageUrls={[{ url: invoiceImage?.uri || '' }]}
          onCancel={() => setShowInvoiceViewer(false)}
          enableSwipeDown={true}
          renderHeader={() => (
            <TouchableOpacity 
              style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 }} 
              onPress={() => setShowInvoiceViewer(false)}
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
  sheet: { flex: 1, backgroundColor: theme.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  yellowBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.yellow,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  cancelTxt: { fontSize: 16, fontWeight: '700', color: theme.text, minWidth: 56 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: theme.black, flex: 1, textAlign: 'center' },
  saveHeaderBtn: { minWidth: 56, alignItems: 'flex-end', justifyContent: 'center' },
  saveHeaderTxt: { fontSize: 16, fontWeight: '900', color: theme.black },
  saveHeaderTxtDisabled: { color: theme.textMuted, fontWeight: '700' },
  segment: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 10,
    backgroundColor: theme.offWhite,
    borderRadius: 12,
    padding: 4,
  },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  segBtnOn: { backgroundColor: theme.black },
  segTxt: { fontWeight: '800', color: theme.text },
  segTxtOn: { color: theme.white },
  loader: { padding: 24, alignItems: 'center' },
  categoryBlock: { paddingHorizontal: 16, paddingBottom: 8 },
  pickLabel: { fontWeight: '800', color: theme.textMuted, marginBottom: 8, marginLeft: 2, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  categoryChooseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.offWhite,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  categoryChooseLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  catSmallCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  catIconImg: { width: '100%', height: '100%', borderRadius: 22 },
  categoryChooseTxt: { flex: 1, fontSize: 16, fontWeight: '800', color: theme.text },
  categoryChoosePlaceholder: { color: theme.textMuted, fontWeight: '700' },
  catModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  catModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  catModalSheet: {
    backgroundColor: theme.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 28,
    maxHeight: '72%',
  },
  catModalTitle: { fontSize: 18, fontWeight: '900', color: theme.black, marginBottom: 12, textAlign: 'center' },
  catModalList: { maxHeight: 360 },
  catModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  catModalRowOn: { backgroundColor: 'rgba(255, 215, 64, 0.2)', marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 12, borderBottomWidth: 0 },
  catModalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  catModalPlus: { fontSize: 24, fontWeight: '900', color: theme.text },
  catModalRowTxt: { flex: 1, fontSize: 16, fontWeight: '700', color: theme.text },
  catModalRowTxtOn: { fontWeight: '900' },
  catModalCustom: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  catModalClose: { marginTop: 12, alignItems: 'center', paddingVertical: 12 },
  catModalCloseTxt: { fontSize: 16, fontWeight: '800', color: theme.textMuted },
  metaSection: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    paddingTop: 12,
  },
  metaLabel: { fontSize: 12, fontWeight: '800', color: theme.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  partyIconSlot: { marginRight: 10 },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.offWhite,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  partyRowText: { flex: 1, fontSize: 16, fontWeight: '700', color: theme.text, marginRight: 8 },
  partyPlaceholder: { color: theme.textMuted, fontWeight: '600' },
  clearParty: { marginTop: 8, fontSize: 13, fontWeight: '700', color: '#c62828' },
  udharBlock: { marginTop: 14 },
  udharHint: { fontSize: 12, color: theme.textMuted, marginBottom: 10, lineHeight: 18 },
  udharRow: { flexDirection: 'row' },
  udharChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.offWhite,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.border,
  },
  udharChipLeft: { marginRight: 10 },
  udharChipOn: { backgroundColor: theme.black, borderColor: theme.black },
  udharChipTxt: { fontSize: 14, fontWeight: '800', color: theme.text },
  udharChipTxtOn: { color: theme.white },
  keypadWrap: {
    backgroundColor: theme.grayBg,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  memo: {
    backgroundColor: theme.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.text,
    marginBottom: 8,
  },
  formulaDisp: { textAlign: 'right', fontSize: 22, fontWeight: '800', color: theme.text, marginBottom: 10 },
  keypad: { flexDirection: 'row' },
  keyCol: { flex: 1, marginRight: 8 },
  keyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  keyBtn: {
    flex: 1,
    marginHorizontal: 3,
    backgroundColor: theme.white,
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyTxt: { fontSize: 20, fontWeight: '800', color: theme.text },
  keySide: { width: 76, justifyContent: 'space-between' },
  sideBtn: {
    backgroundColor: theme.white,
    borderRadius: 12,
    flex: 1,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  sideTxt: { fontSize: 10, fontWeight: '700', color: theme.text, marginTop: 2 },
  sideMath: { fontSize: 22, fontWeight: '900', color: theme.text },
  equalsBtn: { backgroundColor: theme.yellow, flex: 1.2, marginBottom: 0 },
  equalsTxt: { fontSize: 26, fontWeight: '900', color: theme.black },
  saveBig: {
    marginTop: 12,
    backgroundColor: theme.yellow,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  saveBigDisabled: { opacity: 0.45 },
  saveBigTxt: { fontSize: 17, fontWeight: '900', color: theme.black },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: theme.white, borderRadius: 16, padding: 20 },
  partyModalCard: { backgroundColor: theme.white, borderRadius: 16, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '900', marginBottom: 12, color: theme.text },
  modalInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 8,
  },
  mtSm: { marginTop: 0 },
  modalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  modalBtnGhost: { paddingVertical: 12, paddingHorizontal: 16 },
  modalBtnGhostTxt: { fontWeight: '800', color: theme.textMuted },
  modalBtn: { backgroundColor: theme.yellow, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 12 },
  modalBtnPad: { marginLeft: 12 },
  modalBtnTxt: { fontWeight: '900', color: theme.black },
  createPartyBtn: {
    backgroundColor: theme.black,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  createPartyBtnTxt: { color: theme.white, fontWeight: '900', fontSize: 15 },
  frequencyRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 8 },
  frequencyLabel: { fontSize: 13, fontWeight: '700', color: theme.textMuted, marginRight: 4 },
  frequencyChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.grayBg },
  frequencyChipOn: { backgroundColor: theme.yellow },
  frequencyChipTxt: { fontSize: 12, fontWeight: '700', color: theme.text },
  frequencyChipTxtOn: { color: theme.black },
  inputLabel: { fontSize: 13, fontWeight: '800', color: theme.textMuted, textTransform: 'uppercase', marginBottom: 6 },
  partyDateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.grayBg, padding: 12, borderRadius: 12 },
  partyDateTxt: { fontSize: 14, fontWeight: '700', color: theme.black },
  useNameBtn: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  useNameBtnTxt: { fontSize: 13, fontWeight: '800', color: theme.text, textAlign: 'center' },
  partyList: { maxHeight: 220 },
  partyListItem: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  partyListItemTxt: { fontSize: 16, fontWeight: '700', color: theme.text },
  partyEmpty: { textAlign: 'center', color: theme.textMuted, paddingVertical: 16, fontWeight: '600' },
  invoiceSection: { padding: 16, borderTopWidth: 1, borderTopColor: theme.grayBg, marginTop: 8 },
  invoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.grayBg,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: 'dashed',
  },
  invoiceBtnSelected: { borderStyle: 'solid', borderColor: theme.yellow, backgroundColor: theme.white },
  invoiceBtnTxt: { marginLeft: 8, fontSize: 14, fontWeight: '700', color: theme.textMuted },
  invoicePreview: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingHorizontal: 12 },
  invoiceImg: { width: 40, height: 40, borderRadius: 6, marginRight: 12 },
  invoiceInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  invoiceName: { fontSize: 14, fontWeight: '700', color: theme.text, flex: 1, marginRight: 8 },
  customImagePicker: {
    marginTop: 16,
    height: 120,
    backgroundColor: theme.grayBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  customImagePickerTxt: { marginTop: 8, fontSize: 13, fontWeight: '700', color: theme.textMuted },
  customImagePreview: { width: '100%', height: '100%' },
});
