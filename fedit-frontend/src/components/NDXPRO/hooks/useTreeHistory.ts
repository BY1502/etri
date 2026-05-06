import {
  SetTreeHistoryContext,
  TreeHistoryContext,
} from 'contexts/TreeHistoryProvider';
import { useContext } from 'react';

export function useTreeHistory() {
  const value = useContext(TreeHistoryContext);
  return value;
}

export function useSetTreeHistory() {
  const value = useContext(SetTreeHistoryContext);
  return value;
}
