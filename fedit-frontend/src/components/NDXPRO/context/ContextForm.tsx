import Input from 'components/NDXPRO/common/input';
import { Dispatch, SetStateAction } from 'react';

interface Iprops {
  contextId: string;
  setContextId: Dispatch<SetStateAction<string>>;
}

function ContextForm({ contextId, setContextId }: Iprops) {
  return (
    <div className="context-model-form">
      <div className="context-model-form-input-wrapper">
        <Input
          label="Context Id"
          setState={setContextId}
          propValue={contextId}
          placeholder="http://172.16.28.218:3005/e8ight-context.jsonld"
          isRequired
          isUnable
        />
      </div>
    </div>
  );
}

export default ContextForm;
