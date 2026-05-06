import { RectangleButton } from 'components//NDXPRO/common/button/button';
import Input from 'components//NDXPRO/common/input';
import SelectBox from 'components//NDXPRO/common/selectBox';
import Popup from 'components/NDXPRO/common/popup';
import { Dispatch, SetStateAction, useState } from 'react';

interface IProps {
  setPopupState: Dispatch<SetStateAction<boolean>>;
  emitSubmitData: Dispatch<SetStateAction<{ [key: string]: string }>>;
}

function SearchPopup({ setPopupState, emitSubmitData }: IProps) {
  const [entityIdValue, setEntityIdValue] = useState('');
  const [entityNameValue, setEntityNameValue] = useState('');
  const [orderByValue, setOrderByValue] = useState('');

  const selectData = ['오름차순', '내림차순'];

  const closePopup = () => {
    setPopupState(false);
  };

  const handleSubmit = () => {
    emitSubmitData({
      entityId: entityIdValue,
      entityName: entityNameValue,
      orderBy: orderByValue,
    });
    closePopup();
  };

  return (
    <Popup popupTitle="상세 검색" closePopup={closePopup}>
      <form className="search-popup-wrapper" data-testid="test">
        <Input
          label="Entity ID 검색"
          setState={setEntityIdValue}
          placeholder=""
        />
        <Input
          label="Entity Name 검색"
          setState={setEntityNameValue}
          placeholder=""
        />
        <SelectBox
          label="정렬"
          dataList={selectData}
          setState={setOrderByValue}
          isRequired
        />
        <div className="search-popup-button-wrapper">
          <RectangleButton type="add" text="검색" onClick={handleSubmit} />
          <RectangleButton type="cancle" text="취소" onClick={closePopup} />
        </div>
      </form>
    </Popup>
  );
}

export default SearchPopup;
