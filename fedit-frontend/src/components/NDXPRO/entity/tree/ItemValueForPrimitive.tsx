import ItemSVG from 'assets/images/entity.svg';

import { convertFullDateTimeFromString } from 'utils/date';

interface IProps {
  label: string;
  value: any;
}

function ItemValueForPrimitive({ label, value }: IProps) {
  const convertedValue =
    label === 'observedAt'
      ? convertFullDateTimeFromString(value)
      : value.toString();

  return (
    <li className="depth-division item-tab-label">
      <img src={ItemSVG} alt="아이템 아이콘" />
      <span>{label} :</span>
      <strong>{convertedValue}</strong>
    </li>
  );
}

export default ItemValueForPrimitive;
