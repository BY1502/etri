import { IsFoldAllStateContext } from 'components/NDXPRO/entity/AttributeInfo';
import { useContext } from 'react';

export function useIsFoldAllState() {
  return useContext(IsFoldAllStateContext);
}
