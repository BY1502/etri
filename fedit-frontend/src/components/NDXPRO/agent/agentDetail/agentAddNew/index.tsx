import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useRecoilValue, useSetRecoilState } from 'recoil';

import { postAgentData } from 'apis/NDXPRO/IngestApi';
import { RectangleButton } from 'components/NDXPRO/common/button/button';
import useRefreshTrigger from 'components/NDXPRO/hooks/useRefreshTrigger';
import {
  agentModelState,
  agentModeState,
  agentState,
} from 'store/atoms/ingestAtom';
import AgentLefTable from '../agentContent/AgentInfoTable';
import AgentModelInfoTable from '../agentContent/AgentModelInfoTable';
import AgentNav from '../agentContent/AgentNav';
import AgentRightTable from '../agentContent/AgentRightTable';

function AgentAddNew() {
  const agentMode = useRecoilValue(agentModeState);
  const setAgentMode = useSetRecoilState(agentModeState);
  const agentData = useRecoilValue(agentState);
  const agentModel = useRecoilValue(agentModelState);
  const { refreshTrigger } = useRefreshTrigger();
  const navigation = useNavigate();

  const changeMode = (mode: string) => {
    if (mode === 'read') {
      setAgentMode('edit');
    } else {
      setAgentMode('read');
    }
  };

  const saveData = () => {
    const req = { ...agentData, models: agentModel };
    postAgentData(req).then((res) => {
      if (res) {
        alert('성공적으로 입력 되었습니다');
        refreshTrigger();
        navigation(`/agent/${agentData.name}/agent-info`);
      }
    });
  };

  useEffect(() => {
    setAgentMode('add');
  }, []);

  return (
    <div className="agent-sub-page">
      <div className="agent-sub-page-wrapper">
        <AgentNav />
        <div className="agent-info-wrapper">
          <div className="agent-info-left">
            <AgentLefTable />
            <AgentModelInfoTable />
          </div>
          <div className="agent-info-right">
            <AgentRightTable />
            <div className="agent-btn-wrapper">
              <div className="agent-btn">
                <RectangleButton
                  type="add"
                  text={agentMode === 'read' ? 'Edit' : 'Save'}
                  // onClick={() => changeMode(agentMode)}
                  onClick={
                    agentMode === 'read'
                      ? () => changeMode(agentMode)
                      : saveData
                  }
                />
                <RectangleButton
                  type={agentMode === 'read' ? 'remove' : 'agent-etc'}
                  text={agentMode === 'read' ? 'Remove' : 'Back'}
                  onClick={() => console.log('Edit')}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentAddNew;
