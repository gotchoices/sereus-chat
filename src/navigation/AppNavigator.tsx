import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ConnectionsList from '../screens/ConnectionsList';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="ConnectionsList" component={ConnectionsList} options={{ title: 'Sereus Chat' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}


