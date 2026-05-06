import { useState } from 'react';

import { RectangleButton } from 'components/NDXPRO/common/button/button';
import { useRecoilState, useRecoilValue } from 'recoil';
import { agentModelState, agentModeState } from 'store/atoms/ingestAtom';
import AgentModal from './AgentModal';
import AgentModelInfoTableRow from './AgentModelInfoTableRow';

function AgentModelInfoTable() {
  const [agentModelData, setAgentModelData] = useRecoilState(agentModelState);

  const agentMode = useRecoilValue(agentModeState);

  const [toggle, setToggle] = useState(false);

  const [checkedList, setCheckedList] = useState<Array<string>>([]);
  const onCheckedItem = (checked: boolean, item: string) => {
    if (checked) {
      setCheckedList((prev) => [...prev, item]);
    } else if (!checked) {
      setCheckedList(checkedList.filter((el) => el !== item));
    }
  };

  const removeAgentModel = () => {
    setAgentModelData(
      agentModelData.filter((x) => !checkedList.includes(x.modelType)),
    );
  };

  return (
    <div
      className={
        agentMode === 'add'
          ? 'agent-info-left-model add'
          : 'agent-info-left-model basic'
      }
    >
      <div className="title">
        <h2>Models</h2>
        {agentMode !== 'read' && (
          <div className="model-btn-group">
            <RectangleButton
              type="add model-add-btn"
              text="Add"
              onClick={() => setToggle(true)}
            />
            <RectangleButton
              type="agent-etc model-remove-btn"
              text="Remove"
              onClick={removeAgentModel}
            />
          </div>
        )}
      </div>
      <div className="agent-info-table">
        <table id="agent-model-info-table">
          <tbody>
            <tr>
              <th>Model Type</th>
              <th>Context URL</th>
              {agentMode === 'edit' && <th className="checkbox"> </th>}
            </tr>
            {agentModelData.map((item) => (
              <AgentModelInfoTableRow
                key={item.modelType + item.context}
                modelType={item.modelType}
                context={item.context}
                agentMode={agentMode}
                onCheckedItem={onCheckedItem}
              />
            ))}
          </tbody>
        </table>
      </div>
      {toggle && <AgentModal setToggle={setToggle} />}
    </div>
  );
}

export default AgentModelInfoTable;
