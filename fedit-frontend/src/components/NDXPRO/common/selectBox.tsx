import React, { useLayoutEffect } from 'react';

interface IProps {
  label: string;
  dataList: string[];
  setState: any;
  isRequired?: boolean;
  propValue?: string;
  isUnable?: boolean;
  style?: React.CSSProperties;
  hasPlaceholder?: boolean;
}

function SelectBox({
  label,
  dataList,
  setState,
  isRequired,
  propValue,
  isUnable,
  style,
  hasPlaceholder,
}: IProps) {
  const id = Math.random() * 10;

  const onChangeSelectBox = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState(e.target.value);
  };

  useLayoutEffect(() => {
    if (propValue !== undefined && propValue !== null && propValue !== '') {
      setState(propValue);
    } else {
      setState(dataList[0]);
    }
  }, [propValue]);

  return (
    <fieldset className="select-box-wrapper" style={style}>
      <label htmlFor={`select-${id}`}>
        {label} {isRequired ? '*' : ''}
        <select
          name={label}
          id={`select-${id}`}
          value={propValue}
          onChange={onChangeSelectBox}
          required={isRequired}
          disabled={isUnable}
        >
          {hasPlaceholder && <option value="">--</option>}
          {dataList.map((item) => {
            return (
              <option key={item} value={item}>
                {item}
              </option>
            );
          })}
        </select>
      </label>
      <div />
    </fieldset>
  );
}

export default SelectBox;
