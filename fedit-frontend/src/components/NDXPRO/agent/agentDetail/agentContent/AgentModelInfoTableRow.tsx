import { useState } from 'react';

import { AgentMode } from 'store/atoms/ingestAtom';
import ModelAttributeRowContainer from './ModelAttributeRowContainer';

interface AgentModelInfoTableRowProps {
  modelType: string;
  context: string;
  agentMode: AgentMode;
  onCheckedItem: (checked: boolean, item: string) => void;
}

function AgentModelInfoTableRow({
  modelType,
  context,
  agentMode,
  onCheckedItem,
}: AgentModelInfoTableRowProps) {
  const [toggle, setToggle] = useState(false);

  const onToggle = () => {
    setToggle(!toggle);
  };

  return (
    <>
      <tr onClick={onToggle} className="row">
        <td>{modelType}</td>
        <td>{context}</td>
        {agentMode === 'edit' && (
          <td className="checkbox">
            <input
              type="checkbox"
              id={modelType}
              onChange={(e) => {
                onCheckedItem(e.target.checked, e.target.id);
              }}
            />
          </td>
        )}
      </tr>
      {toggle && (
        <ModelAttributeRowContainer
          modelType={modelType}
          agentMode={agentMode}
        />
      )}
    </>
  );
}

export default AgentModelInfoTableRow;
