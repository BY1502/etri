import { clickable, selectedItems } from 'components/NDXPRO/statistics/store';
import { ISummary } from 'components/NDXPRO/statistics/types';
import { returnStatesByType } from 'components/NDXPRO/statistics/utils';
import { useRecoilState, useRecoilValue } from 'recoil';

function StatisticsTableItem({
  task,
  name,
  type,
}: {
  task: ISummary | null;
  name: string;
  type: string;
}) {
  const [selectedItem, setSelectedItem]: any = useRecoilState(selectedItems);
  const toggleClickable = useRecoilValue(clickable);

  const keyByType: string | undefined = returnStatesByType(type)?.onClickState;

  const handleOnClick = () => {
    if (!toggleClickable) {
      return;
    }

    if (keyByType) {
      const obj: any = {};
      obj[`${keyByType}`] = name;
      setSelectedItem({ ...selectedItem, ...obj });
    }
  };

  return (
    <li className="summary">
      <button
        type="button"
        className={name === selectedItem[`${keyByType}`] ? 'active' : ''}
        onClick={handleOnClick}
      >
        <p>{name}</p>
        {task !== null && (
          <>
            <p className="success">{task.successEntities.toLocaleString()}</p>
            <p className="fail">{task.failEntities.toLocaleString()}</p>
            <p className="total">{task.totalEntities.toLocaleString()}</p>
          </>
        )}
      </button>
    </li>
  );
}

export default StatisticsTableItem;
