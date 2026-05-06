import { useRecoilState } from 'recoil';
import { agentModeState, agentState } from 'store/atoms/ingestAtom';

function AgentRightTable() {
  const [agentData, setAgentData] = useRecoilState(agentState);
  const [agentMode, setAgentMode] = useRecoilState(agentModeState);

  const changeObjectValue = (key: string, target: string) => {
    setAgentData((prev) => {
      return {
        ...prev,
        [key]: target,
      };
    });
  };

  return (
    <div className="agent-info-right-wrapper">
      <div className="title">
        <h2>Configuration</h2>
      </div>
      {agentMode !== 'read' ? (
        <div className="agent-config-form">
          <div className="config-form">
            <table className="agent-info-detail-table">
              <tbody>
                <tr>
                  <th>URL</th>
                  <td>
                    <input
                      value={agentData.urlAddress}
                      onChange={(e) =>
                        changeObjectValue('urlAddress', e.target.value)
                      }
                    />
                  </td>
                </tr>
                <tr>
                  <th>CONNECT TERM</th>
                  <td>
                    <input
                      value={agentData.connTerm}
                      onChange={(e) =>
                        changeObjectValue('connTerm', e.target.value)
                      }
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="agent-config">
          <pre>{agentData.confFileContents}</pre>
        </div>
      )}
    </div>
  );
}

export default AgentRightTable;
