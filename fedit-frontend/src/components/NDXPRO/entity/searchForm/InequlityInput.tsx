import InputContainer from 'components/NDXPRO/common/inputContainer';
import useDidMountEffect from 'components/NDXPRO/hooks/useDidMountEffect';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';

interface IProps {
  value: string;
  setValue: ((newValue: string) => void) | Dispatch<SetStateAction<string>>;
}

function InequlityInput({ value, setValue }: IProps) {
  const [greaterValue, setGreaterValue] = useState('');
  const [lessValue, setLessValue] = useState('');

  useEffect(() => {
    const splitedValue = value.split(':=:');

    if (splitedValue.length === 1) {
      setGreaterValue('');
      setLessValue('');
      return;
    }

    const [newGreaterValue, newLessValue] = splitedValue;
    setGreaterValue(newGreaterValue);
    setLessValue(newLessValue);
  }, [value]);

  useDidMountEffect(() => {
    setValue(`${greaterValue}:=:${lessValue}`);
  }, [greaterValue, lessValue]);

  return (
    <>
      <InputContainer
        contentNode={
          <input
            type="number"
            placeholder="greater..."
            value={greaterValue}
            onChange={(e) => setGreaterValue(e.target.value)}
          />
        }
      />
      <InputContainer
        contentNode={
          <input
            type="number"
            placeholder="less..."
            value={lessValue}
            onChange={(e) => setLessValue(e.target.value)}
          />
        }
      />
    </>
  );
}

export default InequlityInput;
