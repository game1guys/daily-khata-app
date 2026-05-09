import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { theme } from '../theme/colors';
import { AlertTriangle, Info, CheckCircle2, XCircle } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export type AlertType = 'info' | 'error' | 'success' | 'warning' | 'confirm';

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  type?: AlertType;
  buttons?: {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
  }[];
  onClose: () => void;
}

export const CustomAlert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  message,
  type = 'info',
  buttons,
  onClose,
}) => {
  const [fadeAnim] = React.useState(new Animated.Value(0));
  const [scaleAnim] = React.useState(new Animated.Value(0.8));

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
    }
  }, [visible, fadeAnim, scaleAnim]);

  const getIcon = () => {
    switch (type) {
      case 'error':
        return <XCircle size={40} color="#ef4444" />;
      case 'success':
        return <CheckCircle2 size={40} color="#22c55e" />;
      case 'warning':
      case 'confirm':
        return <AlertTriangle size={40} color={theme.yellow} />;
      default:
        return <Info size={40} color={theme.black} />;
    }
  };

  const renderButtons = () => {
    if (!buttons || buttons.length === 0) {
      return (
        <TouchableOpacity style={styles.primaryBtnWrapper} onPress={onClose} activeOpacity={0.8}>
          <LinearGradient
            colors={[theme.yellow, '#FFC107']}
            style={styles.primaryBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.primaryBtnTxt}>OK</Text>
          </LinearGradient>
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.buttonRow}>
        {buttons.map((btn, index) => {
          const isCancel = btn.style === 'cancel';
          const isDestructive = btn.style === 'destructive';
          
          if (isCancel || isDestructive) {
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.btn,
                  index > 0 && { marginLeft: 12 },
                  isCancel ? styles.cancelBtn : styles.destructiveBtn,
                  buttons.length > 2 && { flex: 0, width: '100%', marginLeft: 0, marginTop: 8 }
                ]}
                onPress={() => {
                  onClose();
                  btn.onPress?.();
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.btnTxtBase,
                  isCancel ? styles.cancelBtnTxt : styles.destructiveBtnTxt
                ]}>
                  {btn.text}
                </Text>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.btnWrapper,
                index > 0 && { marginLeft: 12 },
                buttons.length > 2 && { flex: 0, width: '100%', marginLeft: 0, marginTop: 8 }
              ]}
              onPress={() => {
                onClose();
                btn.onPress?.();
              }}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[theme.yellow, '#FFC107']}
                style={styles.primaryBtn}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={[styles.btnTxtBase, styles.primaryBtnTxt]}>
                  {btn.text}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.iconBox}>{getIcon()}</View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.footer}>{renderButtons()}</View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: width - 48,
    backgroundColor: theme.white,
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  iconBox: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.black,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  footer: {
    width: '100%',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
    flexWrap: 'wrap',
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnWrapper: {
    flex: 1,
  },
  primaryBtnWrapper: {
    width: '100%',
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: theme.black,
  },
  primaryBtnTxt: {
    color: theme.black,
  },
  cancelBtn: {
    backgroundColor: theme.grayBg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  cancelBtnTxt: {
    color: theme.text,
  },
  destructiveBtn: {
    backgroundColor: '#fee2e2',
    borderWidth: 1.5,
    borderColor: '#ef4444',
  },
  destructiveBtnTxt: {
    color: '#ef4444',
  },
  btnTxtBase: {
    fontSize: 16,
    fontWeight: '800',
  },
});
