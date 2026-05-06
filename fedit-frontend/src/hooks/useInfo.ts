import { Dispatch, SetStateAction, useState } from 'react';
import { memberDTO } from 'types/member';

// TODO: this is irrelevant for now

export const UseInfo = () => {
  const [info, setInfo]: [
    memberDTO | undefined,
    Dispatch<SetStateAction<any>>,
  ] = useState();
  // const userStorage = localStorage.getItem('user');

  // useEffect(() => {
  //   if (userStorage) {
  //     setInfo(JSON.parse(userStorage));
  //   }
  // }, []);

  const [isAdmin, setIsAdmin] = useState(true);

  // useEffect(() => {
  //   if (info?.authType === 'ADMIN') {
  //     setIsAdmin(true);
  //   } else {
  //     setIsAdmin(false);
  //   }
  // }, [info]);

  return [info, isAdmin];
};
