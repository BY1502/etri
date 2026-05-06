import React, { useEffect, useState } from 'react';
import { useRecoilState } from 'recoil';
import { agentModeState, agentState } from 'store/atoms/ingestAtom';

// interface IProps {
//   setAgentData: Dispatch<SetStateAction<agentVO>>;
// }

function AgentInfoTable() {
  const [agentData, setAgentData] = useRecoilState(agentState);
  const [agentMode, setAgentMode] = useRecoilState(agentModeState);
  const [methodToggle, setMethodToggle] = useState(false);

  useEffect(() => {
    if (agentData.type === 'HTTP' || agentData.type === 'HTTPS') {
      setMethodToggle(true);
    } else {
      setMethodToggle(false);
    }
  }, [agentData.type]);

  const changeObjectValue = (key: string, target: string) => {
    setAgentData((prev) => {
      return {
        ...prev,
        [key]: target,
      };
    });
  };

  const onChangeSelectBox = (
    e: React.ChangeEvent<HTMLSelectElement>,
    key: string,
  ) => {
    changeObjectValue(key, e.target.value);
  };

  return (
    <div className="agent-info-left-detail">
      <div className="title">
        <h2>Details</h2>
      </div>
      <div className="agent-info-table-div">
        <table className="agent-info-detail-table">
          <tbody>
            {agentMode !== 'add' ? (
              <tr>
                <th>Name</th>
                <td>{agentData.name}</td>
              </tr>
            ) : (
              <tr>
                <th>Name</th>
                <td>
                  <input
                    type="text"
                    value={agentData.name}
                    onChange={(e) => changeObjectValue('name', e.target.value)}
                  />
                </td>
              </tr>
            )}
            {agentMode !== 'add' && (
              <>
                <tr>
                  <th>ID</th>
                  {agentMode === 'edit' ? (
                    <td className="edit">{agentData.id}</td>
                  ) : (
                    <td>{agentData.id}</td>
                  )}
                </tr>
                <tr>
                  <th>PID</th>
                  {agentData.pid === null ? (
                    <td> - </td>
                  ) : (
                    <td>{agentData.pid}</td>
                  )}
                </tr>
              </>
            )}
            <tr>
              <th>Type</th>
              {agentMode !== 'read' ? (
                <td className="">
                  <select
                    defaultValue={agentData.type}
                    onChange={(e) => onChangeSelectBox(e, 'type')}
                  >
                    <option value="HTTP">http</option>
                    <option value="HTTPS">https</option>
                  </select>
                </td>
              ) : (
                <td>{agentData.type}</td>
              )}
            </tr>
            {(agentData.type === 'HTTP' || agentData.type === 'HTTPS') && (
              <tr>
                <th>Method</th>
                {agentMode === 'read' ? (
                  <td>{agentData.method}</td>
                ) : (
                  <td>
                    <select
                      defaultValue={agentData.method}
                      onChange={(e) => onChangeSelectBox(e, 'method')}
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                  </td>
                )}
              </tr>
            )}

            {agentMode !== 'add' && (
              <tr>
                <th>Status</th>
                {agentMode === 'edit' ? (
                  <td className="edit">{agentData.status}</td>
                ) : (
                  <td>{agentData.status}</td>
                )}
              </tr>
            )}
            <tr>
              <th>Custom Topic</th>
              {agentMode === 'read' ? (
                <td className="agent-data-topic-td">
                  <div className="agent-data-topic-div-wrapper">
                    <div>{agentData.isCustomTopic.toString()}</div>
                    <div className="agent-data-topic-div">
                      <span className="topic">Topic</span>
                      <div>{agentData.topic}</div>
                    </div>
                  </div>
                </td>
              ) : (
                <td className="agent-data-topic-td">
                  <div className="agent-data-topic-div-wrapper">
                    <div>
                      <select
                        id="context-input"
                        defaultValue={agentData.isCustomTopic.toString()}
                        onChange={(e) => onChangeSelectBox(e, 'isCustomTopic')}
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    </div>
                    <div className="agent-data-topic-div">
                      <span className="topic">Topic</span>
                      <input
                        type="text"
                        className={
                          agentData.isCustomTopic
                            ? 'input-custom-topic'
                            : 'input-custom-topic readOnly'
                        }
                        defaultValue={agentData.topic}
                        readOnly={!agentData.isCustomTopic}
                        onChange={(e) =>
                          changeObjectValue('topic', e.target.value)
                        }
                      />
                    </div>
                  </div>
                </td>
              )}
            </tr>

            {agentMode !== 'add' && (
              <>
                <tr>
                  <th>Last Ingesting Time</th>
                  {agentMode === 'edit' ? (
                    <td className="edit">
                      {agentData.lastSourceSignalReceivedAt}
                    </td>
                  ) : (
                    <td>{agentData.lastSourceSignalReceivedAt}</td>
                  )}
                </tr>
                <tr>
                  <th>Last Kafka producing Time</th>
                  {agentMode === 'edit' ? (
                    <td className="edit">
                      {agentData.lastSinkSignalReceivedAt}
                    </td>
                  ) : (
                    <td>{agentData.lastSinkSignalReceivedAt}</td>
                  )}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AgentInfoTable;
