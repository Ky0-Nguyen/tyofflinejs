import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, shared } from '../theme';
import type { ControllableNetworkAdapter } from '../mock-network';

interface Props {
  network: ControllableNetworkAdapter;
}

export function NetworkPanel({ network }: Props) {
  const [online, setOnline] = useState(network.getStatus());

  const toggle = useCallback(() => {
    const next = !online;
    network.setOnline(next);
    setOnline(next);
  }, [online, network]);

  return (
    <View style={shared.panel}>
      <Text style={shared.panelTitle}>Network</Text>

      <View style={[shared.row, { justifyContent: 'space-between' }]}>
        <View style={shared.row}>
          <View
            style={[
              styles.dot,
              { backgroundColor: online ? colors.success : colors.error },
            ]}
          />
          <Text testID="network-status" style={styles.statusText}>
            {online ? 'Online' : 'Offline'}
          </Text>
        </View>

        <TouchableOpacity
          testID="network-toggle-btn"
          style={[shared.btn, online ? styles.offlineBtn : styles.onlineBtn]}
          onPress={toggle}
        >
          <Text style={shared.btnText}>
            {online ? 'Go Offline' : 'Go Online'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  offlineBtn: {
    backgroundColor: colors.error,
  },
  onlineBtn: {
    backgroundColor: colors.success,
  },
});
