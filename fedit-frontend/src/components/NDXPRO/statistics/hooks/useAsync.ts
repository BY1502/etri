import { Reducer, useEffect, useReducer } from 'react';
import { useRecoilState } from 'recoil';
import { clickable } from '../store';

interface IState {
  data: any;
  loading: boolean;
  error: any;
}

interface IAction {
  type: string;
  data?: any;
  error?: any;
}

const reducer: Reducer<IState, IAction> = (state, action) => {
  switch (action.type) {
    case 'LOADING':
      return { data: null, loading: true, error: null };
    case 'SUCCESS':
      return { data: action.data, loading: false, error: null };
    case 'ERROR':
      return { data: null, loading: false, error: action.error };
    default:
      return state;
  }
};

export const useAsync = <T, R>(
  callback: (param?: T) => Promise<R>,
  watch: any,
  param?: T,
) => {
  const init = { data: null, loading: false, error: null };
  const [state, action] = useReducer(reducer, init);
  const [toggleClickable, toggleSetClickable] = useRecoilState(clickable);

  const fetchData = async () => {
    toggleSetClickable(false);
    action({ type: 'LOADING' });

    await callback(param)
      .then((res) => {
        toggleSetClickable(false);
        action({ type: 'SUCCESS', data: res });
      })
      .catch((err) => {
        toggleSetClickable(false);
        action({ type: 'ERROR', error: err });
      })
      .finally(() => toggleSetClickable(true));
  };

  if (watch === null) {
    return [state.data, state.loading, state.error, fetchData];
  }

  useEffect(() => {
    fetchData();
    // return () => console.log('unmount');
  }, [watch]);
  return [state.data, state.loading, state.error, fetchData];
};

export default useAsync;
