import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useIsFoldAllState } from './useIsFoldAllState';
import { useTreeHistory } from './useTreeHistory';

export function useTreeToggle(initValue: boolean, treePath: string) {
  const [toggle, setToggle] = useState(initValue);
  const [detailId, setDetailId] = useState('');
  const param = useParams();

  useEffect(() => {
    const detailId = param['*']?.split('/').at(-1);
    if (detailId !== undefined) {
      setDetailId(detailId);
    }
  }, []);

  const foldAllState = useIsFoldAllState();
  const treeHistory = useTreeHistory();

  const currentTreeHistory = treeHistory.find(
    (el) => el.treeHistoryId === detailId,
  );

  const historyObserverTrigger = () => {
    useEffect(() => {
      // tree history 저장
      if (currentTreeHistory !== undefined) {
        currentTreeHistory.treeHistory[treePath] = toggle;
      }
    }, [toggle]);

    useEffect(() => {
      // tree history 조회 및 적용
      if (currentTreeHistory !== undefined && treePath !== 'root') {
        if (currentTreeHistory.treeHistory[treePath] === undefined) {
          currentTreeHistory.treeHistory[treePath] = initValue;
        }
        const historyToggleState = currentTreeHistory.treeHistory[treePath];
        setToggle(historyToggleState);
      }
    }, [detailId, foldAllState]);
  };

  return [toggle, setToggle, historyObserverTrigger];
}
