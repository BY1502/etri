import { java } from '@codemirror/lang-java';
import ReactCodeMirror from '@uiw/react-codemirror';

import ModalContainer from 'components/NDXPRO/common/modalContainer';

interface IProps {
  translateCode: string;
  closeCodeViewer: () => void;
}

function CodeViewerPopup({ translateCode, closeCodeViewer }: IProps) {
  return (
    <ModalContainer
      title="Translate Code"
      closeEvent={closeCodeViewer}
      className="code-editor-popup"
    >
      <ReactCodeMirror
        value={translateCode}
        height="400px"
        extensions={[java()]}
        className="code-mirror"
        readOnly
      />
    </ModalContainer>
  );
}

export default CodeViewerPopup;
