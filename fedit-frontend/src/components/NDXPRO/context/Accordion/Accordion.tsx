import { getContextData } from 'apis/NDXPRO/contextApi';
import { useEffect, useState } from 'react';

import AccordionContext from './AccordionContext';

interface IProps {
  pagePath: string;
}

// import 예시 : <Accordion pagePath="data-model" />

function Accordion({ pagePath }: IProps) {
  // const [contexts, setContexts] = useState({});
  const [contexts, setContexts] = useState<string[]>([]);

  useEffect(() => {
    getContextData().then((res: string[]) => {
      const findStr = res.filter((el) => el.includes('ngsi-ld'));
      const idx = res.indexOf(findStr[0]);
      const temp = res[idx];
      res.splice(idx, 1);
      res.unshift(temp);
      setContexts(res);
    });
  }, []);

  const contextList = Object.entries(contexts).map((context) => (
    <AccordionContext
      key={context[0]}
      context={context}
      pagePath={pagePath}
      // params={params}
    />
  ));

  return <div className="accordion">{contextList}</div>;
}

export default Accordion;
