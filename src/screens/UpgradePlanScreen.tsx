import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Crown, Sparkles, Check, X, Search, Tag, Filter, Target, AlertTriangle, PieChart as PieChartIcon } from 'lucide-react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RazorpayCheckout from 'react-native-razorpay';
import type { RootStackParamList } from '../../App';
import { API_URL, RAZORPAY_KEY_ID } from '../config/api';
import { theme, shadows } from '../theme/colors';
import { loadCachedMe, persistMePayload, MePayload } from '../utils/profileCache';
import { useAlert } from '../context/AlertContext';

type Props = NativeStackScreenProps<RootStackParamList, 'UpgradePlan'>;

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '₹0',
    period: 'Forever',
    blurb: 'Basic ledger, categories, and reports.',
    cta: 'Current Plan',
    planParam: 'free',
    primary: false,
  },
  {
    key: 'premium_mon',
    name: 'Premium Monthly',
    price: '₹29',
    period: '/ month',
    blurb: 'Full analytics, exports, and priority layout.',
    cta: 'Subscribe Now',
    planParam: 'premium_mon',
    primary: false, // Changed from true to make Lifetime primary
  },
  {
    key: 'premium_yr',
    name: 'Premium Yearly',
    price: '₹199',
    period: '/ year',
    blurb: 'Best value — huge savings vs monthly.',
    cta: 'Subscribe Now',
    planParam: 'premium_yr',
    primary: false,
  },
  {
    key: 'premium_life',
    name: 'Premium Lifetime',
    price: '₹699',
    period: 'one-time',
    blurb: 'Pay once, use premium features forever.',
    cta: 'Get Lifetime',
    planParam: 'premium_life',
    primary: true, // Now Lifetime is primary
  },
] as const;

const FEATURES = [
  { name: 'Daily Income/Expense Entry', free: true, premium: true },
  { name: 'Basic Categories (Pre-set)', free: true, premium: true },
  { name: 'Recent Transactions List', free: true, premium: true },
  { name: 'Monthly Summary (Simple)', free: true, premium: true },
  { name: 'Monthly Entries (Max 100)', free: true, premium: true },
  { name: 'Daily Reminder (8:00 PM)', free: true, premium: true },
  { name: 'Party Ledger (Max 2-3 Parties)', free: true, premium: true },
  { name: 'Basic Search (Date-wise)', free: true, premium: true },
  { name: 'Advanced Search & Filter', free: false, premium: true, icon: Search },
  { name: 'Category-wise Budgeting', free: false, premium: true, icon: Target },
  { name: 'Overspending Alerts', free: false, premium: true, icon: AlertTriangle },
  { name: 'Advanced Charts (Bar/Pie)', free: false, premium: true, icon: PieChartIcon },
  { name: 'Date/Category/Party Filter', free: false, premium: true, icon: Filter },
  { name: 'Tags & Custom Notes', free: false, premium: true, icon: Tag },
  { name: 'Excel/PDF Exports', free: false, premium: true },
];

export default function UpgradePlanScreen({ navigation }: Props) {
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<MePayload | null>(null);
  const [promoCode, setPromoCode] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const profile = await loadCachedMe();
    setUserProfile(profile);
  };

  const handlePayment = async (plan: typeof PLANS[number]) => {
    if (plan.key === 'free') return;
    
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('khata_session');
      if (!token) {
        showAlert({
          title: 'Error',
          message: 'Please login again to continue.',
          type: 'error'
        });
        return;
      }

      // 1. Create Order on Backend
      const orderResponse = await axios.post(
        `${API_URL}/subscription/create-order`,
        { planType: plan.key, promoCode: promoCode.trim() || undefined },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const order = orderResponse.data;

      // 2. Open Razorpay Checkout
      const options = {
        description: `Daily-KHATA ${plan.name}`,
        image: 'https://i.imgur.com/3g7nmJC.png', // Replace with your logo
        currency: order.currency,
        key: RAZORPAY_KEY_ID,
        amount: order.amount,
        name: 'Daily-KHATA',
        order_id: order.id,
        prefill: {
          email: userProfile?.user?.email || '',
          contact: userProfile?.user?.phone || '',
          name: userProfile?.user?.full_name || '',
        },
        theme: { color: plan.key === 'premium_life' ? '#4F46E5' : theme.yellow },
      };

      const data = await RazorpayCheckout.open(options);
      
      // 3. Verify Payment on Backend
      const verifyResponse = await axios.post(
        `${API_URL}/subscription/verify-payment`,
        {
          razorpay_order_id: data.razorpay_order_id,
          razorpay_payment_id: data.razorpay_payment_id,
          razorpay_signature: data.razorpay_signature,
          planType: plan.key,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (verifyResponse.data.status === 'success') {
        // 4. Update local cache
        if (userProfile) {
          const newProfile: MePayload = {
            ...userProfile,
            subscription: {
              tier: plan.key,
              end_date: plan.key === 'premium_life' ? null : new Date(Date.now() + (plan.key === 'premium_mon' ? 30 : 365) * 24 * 60 * 60 * 1000).toISOString(),
            },
          };
          await persistMePayload(newProfile);
          setUserProfile(newProfile);
        }

        showAlert({
          title: 'Success',
          message: 'Subscription upgraded successfully!',
          type: 'success'
        });
        navigation.goBack();
      } else {
        throw new Error('Payment verification failed');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      showAlert({
        title: 'Error',
        message: error.response?.data?.error || error.message || 'Payment failed',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      {loading && (
        <View style={styles.loaderOverlay}>
          <ActivityIndicator size="large" color={theme.black} />
          <Text style={styles.loaderTxt}>Processing Payment...</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, shadows.card]}>
          <Crown size={40} color={theme.black} />
          <Text style={styles.heroTitle}>Plans & payment</Text>
          <Text style={styles.heroSub}>
            Unlock premium features and support our development. Secure payments powered by Razorpay.
          </Text>
        </View>

        <View style={[styles.promoBox, shadows.card]}>
          <Text style={styles.promoLbl}>Promo code</Text>
          <TextInput
            style={styles.promoInput}
            placeholder="Optional — e.g. WELCOME15"
            placeholderTextColor={theme.textMuted}
            value={promoCode}
            onChangeText={setPromoCode}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Text style={styles.promoHint}>Enter a code from your admin dashboard before tapping Subscribe. Invalid codes are rejected at checkout.</Text>
        </View>

        <View style={[styles.comparisonCard, shadows.card]}>
          <Text style={styles.comparisonTitle}>Comparison</Text>
          <View style={styles.comparisonHeader}>
            <View style={styles.compLabelCell} />
            <Text style={styles.compHeaderTxt}>Free</Text>
            <Text style={[styles.compHeaderTxt, { color: '#4F46E5' }]}>Pro</Text>
          </View>
          {FEATURES.map((f, i) => (
            <View key={i} style={styles.compRow}>
              <View style={styles.compLabelCell}>
                <Text style={styles.compFeatureName}>{f.name}</Text>
              </View>
              <View style={styles.compValueCell}>
                {f.free ? <Check size={16} color="#10B981" /> : <X size={16} color="#EF4444" />}
              </View>
              <View style={styles.compValueCell}>
                {f.premium ? <Check size={16} color="#4F46E5" strokeWidth={3} /> : <X size={16} color="#EF4444" />}
              </View>
            </View>
          ))}
        </View>

        {PLANS.map((p) => {
          const isCurrent = userProfile?.subscription?.tier === p.key;
          const isLifetime = p.key === 'premium_life';
          return (
            <View key={p.key} style={[styles.planCard, shadows.card, p.primary && styles.planCardHighlight, isCurrent && styles.planCardCurrent]}>
              <View style={styles.planHeader}>
                <Text style={styles.planName}>{p.name}</Text>
                {p.primary ? (
                  <View style={[styles.badge, isLifetime && styles.badgeLifetime]}>
                    <Sparkles size={14} color={isLifetime ? theme.white : theme.black} />
                    <Text style={[styles.badgeTxt, isLifetime && styles.badgeTxtWhite]}>
                      {isLifetime ? 'Best Value' : 'Popular'}
                    </Text>
                  </View>
                ) : null}
                {isCurrent ? (
                  <View style={[styles.badge, { backgroundColor: theme.black }]}>
                    <Text style={[styles.badgeTxt, { color: theme.yellow }]}>Active</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.price}>
                {p.price}
                <Text style={styles.period}> {p.period}</Text>
              </Text>
              <Text style={styles.blurb}>{p.blurb}</Text>
              {p.key === 'free' ? (
                <Text style={styles.hintMuted}>Basic features for everyone.</Text>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.cta, 
                    p.primary && styles.ctaStrong, 
                    isLifetime && styles.ctaLifetime,
                    isCurrent && styles.ctaDisabled
                  ]}
                  activeOpacity={0.9}
                  disabled={isCurrent || loading}
                  onPress={() => {
                    showAlert({
                      title: 'Confirm Plan',
                      message: `Do you want to upgrade to ${p.name}?`,
                      type: 'confirm',
                      buttons: [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Upgrade', onPress: () => handlePayment(p) },
                      ]
                    });
                  }}
                >
                  <Text style={[styles.ctaTxt, isLifetime && styles.ctaTxtWhite]}>
                    {isCurrent ? 'Current Plan' : p.cta}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        <View style={styles.madeInIndia}>
          <Text style={styles.madeInIndiaTxt}>Made in India ❤️</Text>
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.9}>
          <Text style={styles.backTxt}>Back to Me</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.yellow },
  scroll: { padding: 16, paddingBottom: 32 },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderTxt: { marginTop: 12, fontWeight: '800', color: theme.black },
  hero: {
    backgroundColor: theme.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  promoBox: {
    backgroundColor: theme.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  promoLbl: { fontSize: 13, fontWeight: '800', color: theme.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  promoInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    color: theme.text,
    backgroundColor: theme.offWhite,
  },
  promoHint: { marginTop: 8, fontSize: 12, fontWeight: '600', color: theme.textMuted, lineHeight: 17 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: theme.text, marginTop: 8 },
  heroSub: { fontSize: 14, color: theme.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20, fontWeight: '600' },
  planCard: {
    backgroundColor: theme.white,
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  planCardHighlight: { 
    borderColor: '#4F46E5', 
    borderWidth: 2,
    backgroundColor: '#F5F3FF', // Very light indigo background for lifetime
  },
  planCardCurrent: { backgroundColor: '#f8fafc', borderColor: theme.black },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { fontSize: 17, fontWeight: '800', color: theme.text },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.yellow,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeLifetime: {
    backgroundColor: '#4F46E5',
  },
  badgeTxt: { fontSize: 11, fontWeight: '800', color: theme.black },
  badgeTxtWhite: { color: theme.white },
  price: { fontSize: 28, fontWeight: '900', color: theme.text, marginTop: 10 },
  period: { fontSize: 15, fontWeight: '700', color: theme.textMuted },
  blurb: { fontSize: 14, color: theme.textMuted, marginTop: 6, fontWeight: '600', lineHeight: 20 },
  hintMuted: { fontSize: 13, color: theme.textMuted, marginTop: 12, fontStyle: 'italic' },
  cta: {
    marginTop: 14,
    backgroundColor: theme.grayBg,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  ctaStrong: { backgroundColor: theme.yellow },
  ctaLifetime: { backgroundColor: '#4F46E5' },
  ctaDisabled: { backgroundColor: theme.border, opacity: 0.7 },
  ctaTxt: { fontSize: 16, fontWeight: '800', color: theme.black },
  ctaTxtWhite: { color: theme.white },
  backBtn: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  backTxt: { fontSize: 16, fontWeight: '800', color: theme.black, textDecorationLine: 'underline' },
  madeInIndia: {
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 20,
  },
  madeInIndiaTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textMuted,
    letterSpacing: 0.5,
  },
  comparisonCard: {
    backgroundColor: theme.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: theme.border,
  },
  comparisonTitle: { fontSize: 18, fontWeight: '900', color: theme.text, marginBottom: 16 },
  comparisonHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  compLabelCell: { flex: 2 },
  compHeaderTxt: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '900', color: theme.textMuted },
  compRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  compFeatureName: { fontSize: 13, fontWeight: '700', color: theme.text },
  compValueCell: { flex: 1, alignItems: 'center' },
});

