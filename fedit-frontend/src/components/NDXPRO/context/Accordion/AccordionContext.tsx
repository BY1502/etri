import arrowRight from 'assets/images/arrow_right.svg';
import arrowUp from 'assets/images/arrow_up_ndxpro.svg';
import { useEffect, useState } from 'react';

import { getContextVersion } from 'apis/NDXPRO/contextApi';
import { useNavigate, useParams } from 'react-router-dom';
import { makeContextIdWithVersion } from 'utils/common';
import AccordionModels from './AccordionModels';

interface IProps {
  context: string[];
  pagePath: string;
}

function AccordionContext({ context, pagePath }: IProps) {
  const param = useParams();
  const [selectedContext, setSelectedContext] = useState('');
  const [toggle, setToggle] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const navigate = useNavigate();
  const goDefaultContext = () => {
    getContextVersion({ params: { contextUrl: context[1] } }).then(
      (response) => {
        navigate(encodeURIComponent(response[0].url));
      },
    );
  };

  useEffect(() => {
    //* URL의 context와 동일한 context가 있으면 setToogle true!
    if (param['*'] === makeContextIdWithVersion(context[1])) {
      setToggle(true);
    }
  }, [param]);

  return (
    <div className={toggle ? 'active accordion-wrapper' : 'accordion-wrapper'}>
      <button
        type="button"
        className={toggle ? 'accordion-title' : 'accordion-title'}
        onClick={() => {
          document.querySelectorAll('.accordion-wrapper').forEach((el) => {
            el.classList.remove('active');
          });
          setToggle(!toggle);
          goDefaultContext();
        }}
      >
        {toggle && <img src={arrowUp} alt="열기" />}
        {!toggle && <img src={arrowRight} alt="닫기" />}
        <p>{context[1]}</p>
      </button>

      {toggle && (
        <AccordionModels
          context={context}
          pagePath={pagePath}
          // params={params}
        />
      )}
    </div>
  );
}

export default AccordionContext;
