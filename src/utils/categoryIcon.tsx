import React, { type ComponentType } from 'react';
import { Text, View, Image, Platform, TouchableOpacity } from 'react-native';
import { theme } from '../theme/colors';
import {
  Circle,
  Tags,
  UtensilsCrossed,
  ShoppingBag,
  Car,
  Phone,
  GraduationCap,
  Sparkles,
  Dumbbell,
  Users,
  Bus,
  Shirt,
  Wine,
  Cigarette,
  Laptop,
  Plane,
  HeartPulse,
  PawPrint,
  Wrench,
  Home,
  Gift,
  HandHeart,
  Ticket,
  Cookie,
  Baby,
  Apple,
  TrendingUp,
  Receipt,
  Briefcase,
  Store,
} from 'lucide-react-native';

type IconComp = ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

const ICON_MAP: Record<string, IconComp> = {
  Circle,
  Utensils: UtensilsCrossed,
  UtensilsCrossed,
  Food: UtensilsCrossed,
  ShoppingBag,
  Shopping: ShoppingBag,
  Car,
  Telephone: Phone,
  Phone,
  Education: GraduationCap,
  GraduationCap,
  Beauty: Sparkles,
  Sparkles,
  Sport: Dumbbell,
  Dumbbell,
  Social: Users,
  Users,
  Transportation: Bus,
  Bus,
  Clothing: Shirt,
  Shirt,
  Wine,
  Cigarette,
  Electronics: Laptop,
  Laptop,
  Travel: Plane,
  Plane,
  Health: HeartPulse,
  HeartPulse,
  Pet: PawPrint,
  PawPrint,
  Repair: Wrench,
  Wrench,
  Housing: Home,
  Home,
  Gift,
  Donate: HandHeart,
  HandHeart,
  Lottery: Ticket,
  Ticket,
  Snacks: Cookie,
  Cookie,
  Baby,
  Fruit: Apple,
  Apple,
  vegetable: Apple,
  Investments: TrendingUp,
  TrendingUp,
  Receipt,
  Bills: Receipt,
  Briefcase,
  Salary: Briefcase,
  Store,
  Business: Store,
  Tags,
};

type Props = {
  iconKey: string | null | undefined;
  color: string;
  size?: number;
};

export function CategoryGlyph({ iconKey, color, size = 22 }: Props) {
  const key = (iconKey || 'Circle').trim();
  if (/[\u{1F300}-\u{1FAFF}]/u.test(key) || key.length <= 4 && /[^\w]/.test(key)) {
    return (
      <Text style={{ fontSize: size }} allowFontScaling={false}>
        {key}
      </Text>
    );
  }
  const normalized = key.replace(/\s+/g, '');
  const Icon = ICON_MAP[normalized] || ICON_MAP[key] || Tags;
  return <Icon color={color} size={size} strokeWidth={2} />;
}

export function CategoryIconCircle({
  iconKey,
  color,
  bg,
  size = 22,
  iconUrl,
  onPress,
}: Props & { bg: string; iconUrl?: string | null; onPress?: () => void }) {
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  
  // Clean URL: Remove backticks and spaces
  const cleanUrl = (iconUrl || '').trim().replace(/[`]/g, '');
  
  // Fix localhost URLs for Android Emulator
  const finalUrl = (cleanUrl && Platform.OS === 'android' && cleanUrl.includes('localhost')) 
    ? cleanUrl.replace('localhost', '10.0.2.2') 
    : cleanUrl;
  const canShowImage = !!finalUrl && failedUrl !== finalUrl;

  const content = (
    <View
      style={{
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: canShowImage ? 1 : 0,
        borderColor: theme.border,
      }}
    >
      {canShowImage ? (
        <Image 
          key={finalUrl}
          source={{ uri: finalUrl }} 
          style={{ width: '100%', height: '100%' }} 
          resizeMode="cover"
          fadeDuration={0}
          onLoadStart={() => console.log('Image Loading Start:', finalUrl)}
          onLoad={() => console.log('Image Load Success')}
          onLoadEnd={() => console.log('Image Load End:', finalUrl)}
          onError={(e) => {
            console.log('Image Load Error:', e.nativeEvent.error, 'for URL:', finalUrl);
            setFailedUrl(finalUrl);
          }}
        />
      ) : (
        <CategoryGlyph iconKey={iconKey} color={color} size={size} />
      )}
    </View>
  );

  if (onPress && canShowImage) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}
