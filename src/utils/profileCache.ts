import AsyncStorage from '@react-native-async-storage/async-storage';

export type MePayload = {
  user: { id: string; email: string | null; full_name: string; phone: string | null };
  subscription: { tier: string; end_date: string | null };
  member_since: string | null;
};

export async function cacheMeFromLoginSession(session: { user: any } | null | undefined, profile: any) {
  const u = session?.user;
  if (!u?.id) return;
  const payload: MePayload = {
    user: {
      id: u.id,
      email: u.email ?? null,
      full_name: profile?.full_name ?? u.user_metadata?.full_name ?? 'User',
      phone: profile?.phone ?? u.user_metadata?.phone ?? null,
    },
    subscription: {
      tier: profile?.subscription_tier ?? 'free',
      end_date: profile?.subscription_end_date ?? null,
    },
    member_since: u.created_at ?? null,
  };
  await AsyncStorage.setItem('khata_profile', JSON.stringify(payload));
}

export async function loadCachedMe(): Promise<MePayload | null> {
  const raw = await AsyncStorage.getItem('khata_profile');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MePayload;
  } catch {
    return null;
  }
}

export async function persistMePayload(me: MePayload) {
  await AsyncStorage.setItem('khata_profile', JSON.stringify(me));
}
