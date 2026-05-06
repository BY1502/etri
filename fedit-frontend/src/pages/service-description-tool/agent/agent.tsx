import AgentAside from 'components/NDXPRO/agent/agentAside';
import AgentDetail from 'components/NDXPRO/agent/agentDetail';
import AgentAddNew from 'components/NDXPRO/agent/agentDetail/agentAddNew';
import AgentHistory from 'components/NDXPRO/agent/agentDetail/agentHistory';
import { Route, Routes } from 'react-router-dom';
import { RecoilRoot } from 'recoil';

function Agent() {
  return (
    <div className="agent">
      <RecoilRoot>
        <AgentAside />
        <Routes>
          <Route path="/:agentName/*" element={<AgentDetail />} />
          <Route path="/new-agent" element={<AgentAddNew />} />
          <Route path="/history-agent" element={<AgentHistory />} />
        </Routes>
      </RecoilRoot>
    </div>
  );
}

export default Agent;
