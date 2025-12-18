// App-Native.tsx --- React Native App for Expo
import React from 'react';
import { StyleSheet, View } from 'react-native';
import SimpleCamera from './src/components/SimpleCamera-Native';
import './src/components/i18n';

// App component for React Native
function App() {
  return (
    <View style={styles.container}>
      <SimpleCamera />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});

export default App;
