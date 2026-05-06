import {
  ActiveEntityTabContext,
  SetActiveEntityTabContext,
} from 'contexts/ActiveEntityTabProvider';
import { Dispatch, SetStateAction, useContext } from 'react';
import { EntityTabType } from 'types/entity';

export function useActiveEntityTab(): EntityTabType {
  return useContext(ActiveEntityTabContext);
}

export function useSetActiveEntityTab():
  | Dispatch<SetStateAction<EntityTabType>>
  | undefined {
  return useContext(SetActiveEntityTabContext);
}
