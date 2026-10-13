import {
  DarkTheme,
  type NavigationContainerRefWithCurrent,
  StackActions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import type { ChatTarget, StoreItem } from 'vaporchat/protocol';
import { colors } from '../theme';
import type { Page } from './PageScreen';

/** The tabs, and the native screens pushed over them: a chat or pages. */
export type Routes = {
  tabs: undefined;
  chat: { chat: ChatTarget };
  page: { page: Page };
};

export const Stack = createNativeStackNavigator<Routes>();

// pushed screens are dark while they come in, not the default white
export const navigationTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background },
};

/** Pushing pages and games over the tabs, and going back. */
export function usePages(
  navigation: NavigationContainerRefWithCurrent<Routes>,
) {
  const push = useCallback(
    (page: Page) => navigation.dispatch(StackActions.push('page', { page })),
    [navigation],
  );
  const openGame = useCallback(
    (item: StoreItem) =>
      push(
        item.appid === null
          ? { kind: 'bundle', item }
          : { kind: 'game', item: { ...item, appid: item.appid } },
      ),
    [push],
  );
  // Android's back button and gesture go back by themselves
  const back = useCallback(() => navigation.goBack(), [navigation]);
  return { push, openGame, back };
}
