import { ReactComponent as AddBtn } from 'assets/images/add.svg';
import { ReactComponent as RemoveBtn } from 'assets/images/close.svg';

import React, {
  Dispatch,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';

interface IProps {
  label: string;
  setState: Dispatch<SetStateAction<any>>;
  validateFn?: (inputValue: string) => boolean;
  propValue?: string[] | undefined;
  isRequired?: boolean;
  placeHolder?: string | undefined;
  isUnable?: boolean;
  listKey?: string;
}

function EditableList({
  label,
  setState,
  validateFn,
  propValue,
  isRequired,
  placeHolder,
  isUnable,
  listKey,
}: IProps) {
  const id = useRef(Math.random() * 10);
  const [inputState, setInputState] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [listBoxItems, setListBoxItems] = useState<string[]>([]);

  useEffect(() => {
    setState(listBoxItems);
  }, [listBoxItems]);

  useEffect(() => {
    if (propValue !== undefined) {
      setListBoxItems([...propValue]);
    } else {
      setListBoxItems([]);
    }
  }, [listKey]);

  const onChangeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputState(e.target.value);
  };

  const validateCheck = (inputValue: string): boolean => {
    if (validateFn !== undefined && validateFn(inputValue) === false) {
      setInputState('');
      alert('입력 값을 확인해주세요.');
      return false;
    }
    return true;
  };

  const overlapCheck = (inputValue: string): boolean => {
    if (listBoxItems.includes(inputValue) === true) {
      setInputState('');
      alert('중복된 값이 있습니다.');
      return false;
    }
    return true;
  };

  const filledCheck = (inputValue: string): boolean => {
    const removeEmptyValue = inputValue.trim();
    if (removeEmptyValue === '') {
      setInputState('');
      return false;
    }
    return true;
  };

  const onEnterPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (
        validateCheck(inputState) === false ||
        overlapCheck(inputState) === false ||
        filledCheck(inputState) === false
      ) {
        return;
      }

      setListBoxItems((prev) => [...prev, inputState.trim()]);
      setInputState('');
    }
  };

  const onAddClick = () => {
    if (
      validateCheck(inputState) === false ||
      overlapCheck(inputState) === false ||
      filledCheck(inputState) === false
    ) {
      return;
    }

    setListBoxItems((prev) => [...prev, inputState.trim()]);
    setInputState('');
  };

  const onRemoveClick = () => {
    setListBoxItems((prev) => prev.filter((el) => el !== selectedItem));
  };

  const onSelectedItem = (e: React.MouseEvent<HTMLButtonElement>) => {
    const target = e.currentTarget;

    if (target.textContent) {
      setSelectedItem(target.textContent);
    }
  };

  return (
    <div className="editable-list-wrapper">
      <fieldset className="input-wrapper">
        <label htmlFor={`input-${id.current}`}>
          {label} {isRequired ? '*' : ''}
          {!isUnable && (
            <input
              type="text"
              id={`input-${id.current}`}
              value={inputState}
              onChange={onChangeInput}
              onKeyUp={onEnterPress}
              required
              placeholder={
                placeHolder === undefined
                  ? '추가하려면 입력하세요'
                  : placeHolder
              }
            />
          )}
        </label>
        {!isUnable && (
          <>
            <button type="button" onClick={onAddClick}>
              <AddBtn fill="#aaaaaa" />
            </button>
            <button type="button" onClick={onRemoveClick}>
              <RemoveBtn fill="#aaaaaa" />
            </button>
          </>
        )}
      </fieldset>
      <ul>
        {listBoxItems.map((item) => {
          return (
            <li key={item}>
              <button
                type="button"
                className={
                  item === selectedItem
                    ? 'list-item-btn active'
                    : 'list-item-btn'
                }
                onClick={onSelectedItem}
              >
                {item}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default EditableList;
