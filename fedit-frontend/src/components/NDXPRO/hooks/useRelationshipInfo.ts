import {
  InfoListContext,
  PathListContext,
  SetInfoListContext,
  SetPathListContext,
} from 'contexts/ChildRelationshipInfoProvider';
import { useContext } from 'react';

export function useInfoListValue() {
  return useContext(InfoListContext);
}

export function useSetInfoListValue() {
  const value = useContext(SetInfoListContext);
  return value;
}

export function usePathListValue() {
  return useContext(PathListContext);
}

export function useSetPathListValue() {
  return useContext(SetPathListContext);
}
