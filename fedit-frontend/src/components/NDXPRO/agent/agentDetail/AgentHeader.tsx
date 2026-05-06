import { patchAgentStatus } from 'apis/NDXPRO/IngestApi';
import playImg from 'assets/images/play.svg';
import stopImg from 'assets/images/play_stop.svg';
import useRefreshTrigger from 'components/NDXPRO/hooks/useRefreshTrigger';
import { UseInfo } from 'hooks/useInfo';
import { useRecoilValue } from 'recoil';
import { agentState } from 'store/atoms/ingestAtom';

function AgentHeader() {
  const agentData = useRecoilValue(agentState);
  const [info, isAdmin] = UseInfo();
  const { refreshTrigger } = useRefreshTrigger();

  const changeAgentStatus = (
    agentId: number,
    operation: string,
    status: string,
  ) => {
    const msg = operation === 'run' ? '실행' : '중지';
    if (window.confirm(`해당 Agent를 ${msg} 하시겠습니까?`)) {
      patchAgentStatus(agentId, operation).then(() => {
        refreshTrigger();
        alert(`해당 Agent를 정상적으로 ${msg} 하였습니다`);
      });
    }
  };

  return (
    <div className="agent-header">
      <div className="agent-header-left">
        <h2>{agentData.name}</h2>
        <p className={`header-status ${agentData.status}`}>
          {agentData.status}
        </p>

        <div className="line-wrapper">
          <div className="line" />
        </div>
        {isAdmin && (
          <div className="button-wrap">
            <button
              className={
                ['RUN', 'HANG'].includes(agentData.status)
                  ? 'play-btn active'
                  : 'play-btn'
              }
              type="button"
              onClick={(e) =>
                changeAgentStatus(agentData.id, 'run', agentData.status)
              }
              disabled={['RUN', 'HANG'].includes(agentData.status)}
            >
              <img src={playImg} alt="" />
            </button>
            <button
              className={
                ['STOP', 'DIE', 'CREATED'].includes(agentData.status)
                  ? 'stop-btn active'
                  : 'stop-btn'
              }
              type="button"
              onClick={(e) =>
                changeAgentStatus(agentData.id, 'stop', agentData.status)
              }
              disabled={['STOP', 'DIE', 'CREATED'].includes(agentData.status)}
            >
              <img src={stopImg} alt="" />
            </button>
          </div>
        )}
      </div>
      <div className="agent-header-right">
        <div className="agent-header-right-wrapper">
          <div className="agent-time-info">
            <span className="info-label">Last Ingesting Time</span>
            <i />
            <span className="info-value">
              {agentData.lastSourceSignalReceivedAt}
            </span>
          </div>
          <div className="agent-time-info">
            <span className="info-label">Last Kafka Producing Time</span>
            <i />
            <span className="info-value">
              {agentData.lastSinkSignalReceivedAt}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentHeader;
