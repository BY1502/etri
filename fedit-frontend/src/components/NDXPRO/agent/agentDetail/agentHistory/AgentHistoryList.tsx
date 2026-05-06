import { agentHistoryVO } from 'types/ingest';

interface IProps {
  agentHistoryList: agentHistoryVO[];
}

function AgentHistoryList({ agentHistoryList }: IProps) {
  return (
    <div className="agent-history-table-wrapper">
      <table className="agent-history-table">
        <tbody>
          <tr>
            <th>ID</th>
            <th>operatedAt</th>
            <th>AgentID</th>
            <th>Agent Name</th>
            <th>Agent Status</th>
            <th>operatedBy</th>
          </tr>
          {agentHistoryList.map((item: agentHistoryVO) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.operatedAt}</td>
              <td>{item.agentId}</td>
              <td>{item.agentName}</td>
              <td>
                <span className={`type-status ${item.agentStatus}`}>
                  {item.agentStatus}
                </span>
              </td>
              <td>{item.operatedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AgentHistoryList;
