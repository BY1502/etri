import { NavLink } from 'react-router-dom';
import { agentDTO } from 'types/ingest';

interface Iprops {
  agentList: agentDTO[];
}

function AgentList({ agentList }: Iprops) {
  // const param = useParams();
  // console.log(param, 'param');

  return (
    <div className="agent-list-wrapper">
      <div className="agent-list-header">
        <span>Agent Name</span>
        <span>Status</span>
      </div>
      <div className="agent-list-body">
        <ul>
          {agentList.map((task: agentDTO) => (
            <NavLink
              key={task.id}
              to={`${task.name}/agent-info`}
              state={`${task.id}`}
            >
              <li key={task.id}>
                <p>{task.name}</p>
                <p className="type-status-wrapper">
                  <span className={`type-status ${task.status}`}>
                    {task.status}
                  </span>
                </p>
              </li>
            </NavLink>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default AgentList;
