import AgentContent from './agentContent';
import AgentHeader from './AgentHeader';

function AgentDetail() {
  return (
    <div className="agent-detail">
      <div className="agent-detail-wrapper">
        <AgentHeader />
        <AgentContent />
      </div>
    </div>
  );
}

export default AgentDetail;
