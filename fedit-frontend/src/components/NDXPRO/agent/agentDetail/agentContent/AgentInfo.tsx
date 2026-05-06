import { deleteAgent, putAgentData } from 'apis/NDXPRO/IngestApi';
import { RectangleButton } from 'components/NDXPRO/common/button/button';
import useRefreshTrigger from 'components/NDXPRO/hooks/useRefreshTrigger';
import { UseInfo } from 'hooks/useInfo';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useRecoilState } from 'recoil';
import {
  agentModelState,
  agentModeState,
  agentState,
} from 'store/atoms/ingestAtom';
import AgentInfoTable from './AgentInfoTable';
import AgentModelInfoTable from './AgentModelInfoTable';
import AgentRightTable from './AgentRightTable';

function AgentInfo() {
  const [agentData, setAgentData] = useRecoilState(agentState);
  const [agentModel, setAgentModel] = useRecoilState(agentModelState);
  const [agentMode, setAgentMode] = useRecoilState(agentModeState);
  const navigate = useNavigate();
  const [info, isAdmin] = UseInfo();
  const { refreshTrigger } = useRefreshTrigger();

  const removeAgent = (id: number) => {
    if (window.confirm(`해당 Agent를 삭제하시겠습니까?`)) {
      deleteAgent(id).then(() => {
        alert('성공적으로 삭제 되었습니다');
        refreshTrigger();
        navigate('/agent');
      });
    }
  };

  const updateAgentData = () => {
    const req = { ...agentData, models: agentModel };

    if (window.confirm(`해당 Agent를 수정 하시겠습니까?`)) {
      putAgentData(agentData.id, req).then(() => {
        alert('성공적으로 수정 되었습니다');
        refreshTrigger();
      });
    }
  };

  useEffect(() => {
    setAgentMode('read');
  }, []);

  const changeMode = (mode: string) => {
    if (mode === 'read') {
      setAgentMode('edit');
    } else {
      setAgentMode('read');
    }
  };

  return (
    <div className="agent-info">
      <div className="agent-info-wrapper">
        <div className="agent-info-left">
          <AgentInfoTable />
          <AgentModelInfoTable />
        </div>
        <div className="agent-info-right">
          <AgentRightTable />
          {isAdmin && (
            <div className="agent-btn-wrapper">
              <div className="agent-btn">
                <RectangleButton
                  type="add"
                  text={agentMode === 'read' ? 'Edit' : 'Update'}
                  onClick={
                    agentMode === 'read'
                      ? () => changeMode(agentMode)
                      : () => updateAgentData()
                  }
                />
                <RectangleButton
                  type={agentMode === 'read' ? 'remove' : 'agent-etc'}
                  text={agentMode === 'read' ? 'Remove' : 'Back'}
                  onClick={
                    agentMode === 'read'
                      ? () => removeAgent(agentData.id)
                      : () => setAgentMode('read')
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AgentInfo;
