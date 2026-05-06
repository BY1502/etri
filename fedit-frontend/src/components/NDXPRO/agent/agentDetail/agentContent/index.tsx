import { getAgentDetail } from 'apis/NDXPRO/IngestApi';

import useRefreshTrigger from 'components/NDXPRO/hooks/useRefreshTrigger';
import Translator from 'pages/service-description-tool/Translator/Translator';
import { useEffect } from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import { useRecoilState, useSetRecoilState } from 'recoil';
import {
  agentModelState,
  agentModeState,
  agentState,
} from 'store/atoms/ingestAtom';
import AgentInfo from './AgentInfo';
import AgentNav from './AgentNav';

function AgentContent() {
  const [agentData, setAgentData] = useRecoilState(agentState);
  const setAgentModel = useSetRecoilState(agentModelState);
  const setAgentMode = useSetRecoilState(agentModeState);
  const param = useParams();

  const updateAgentData = () => {
    if (param.agentName !== undefined) {
      setAgentMode('read');
      getAgentDetail(param.agentName).then((res) => {
        setAgentModel(res.models);
        setAgentData(res);
      });
    }
  };

  const { registerUpdateFuncion } = useRefreshTrigger();

  useEffect(() => {
    updateAgentData();
    registerUpdateFuncion([updateAgentData]);
  }, [param.agentName]);

  return (
    <div className="agent-content">
      <AgentNav />
      <div className="agent-content-body">
        <Routes>
          <Route path="/agent-info" element={<AgentInfo />} />
          <Route path="/translator" element={<Translator />} />
          {/* <Route path="/agent-logs" element={<AgentLogs />} /> */}
        </Routes>
      </div>
    </div>
  );
}

export default AgentContent;
