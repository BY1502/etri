import { getContextData } from 'apis/NDXPRO/contextApi';
import arrowRight from 'assets/images/arrow_right.svg';
import arrowUp from 'assets/images/arrow_up_ndxpro.svg';
import { useEffect, useState } from 'react';
import AccordionContextModels from './AccordionContextModels';

interface IProps {
  context: any;
  pagePath: string;
}

function AccordionContextPage({ context, pagePath }: IProps) {
  const [contexts, setContexts] = useState({});
  const [toggle, setToggle] = useState(false);

  useEffect(() => {
    getContextData().then((res) => {
      setContexts(res);
    });
  }, []);

  return (
    <div className={toggle ? 'active accordion-wrapper' : 'accordion-wrapper'}>
      <button
        type="button"
        className="accordion-title"
        onClick={() => setToggle(!toggle)}
      >
        {toggle && <img src={arrowUp} alt="열기" />}
        {!toggle && <img src={arrowRight} alt="닫기" />}
        <p>{context[1]}</p>
      </button>
      {toggle && <AccordionContextModels />}
    </div>
  );
}

export default AccordionContextPage;
