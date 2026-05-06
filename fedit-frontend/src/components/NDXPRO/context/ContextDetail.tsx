import { getContextInfoData } from 'apis/NDXPRO/contextApi';

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ContextModelVO } from 'types/context';
import ContextSelector from './ContextSelector';
import ContextStructure from './ContextStructure';

function ContextDetail() {
  const param = useParams();
  const [contextId, setContextId] = useState('');
  const [contextModelList, setContextModelList] = useState<ContextModelVO[]>(
    [],
  );
  const [toggle, setToggle] = useState(false);

  useEffect(() => {
    if (param.contextId === 'newContext') {
      setContextId('');
      setToggle(true);
    } else {
      setToggle(false);
      getContextInfoData({ contextUrl: param.contextId as string }).then(
        (res) => {
          setContextId(param.contextId as string);
        },
      );
    }
  }, [param]);

  return (
    <div className="context-detail">
      <div className="context-info">
        <h2 className="title">Context Manage</h2>
        <div className="context-detail-wrapper">
          <ContextStructure
            toggle={toggle}
            setToggle={setToggle}
            ContextModelList={contextModelList}
            setContextModelList={setContextModelList}
            contextId={contextId}
            setContextId={setContextId}
          />
        </div>
      </div>
      {toggle && (
        <ContextSelector
          ContextModelList={contextModelList}
          setContextModelList={setContextModelList}
        />
      )}
    </div>
  );
}

export default ContextDetail;
