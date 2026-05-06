import { ComponentProps } from 'react';
import { SelectData } from 'types/common';
import { TvalueType } from 'types/dataModelTypes';

interface IProps extends ComponentProps<'select'> {
  selectedValue?: any | TvalueType;
  dataList: Array<string | number | SelectData>;
  selectKey?: any;
  placeholder?: string;
}

function Select({
  selectedValue,
  onChange,
  dataList,
  className,
  style,
  name,
  placeholder,
  required,
  disabled,
  defaultValue,
  selectKey,
}: IProps) {
  return (
    <select
      value={selectedValue}
      onChange={onChange}
      className={className}
      style={style}
      name={name}
      required={required}
      disabled={disabled}
      title={selectedValue}
      defaultValue={defaultValue}
      key={selectKey}
    >
      {placeholder && <option value={undefined}>{placeholder}</option>}
      {dataList.map((item) => {
        if (typeof item !== 'object') {
          return (
            <option key={item} value={item}>
              {item}
            </option>
          );
        }
        return (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        );
      })}
    </select>
  );
}

export default Select;
