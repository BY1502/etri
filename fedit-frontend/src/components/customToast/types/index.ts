export interface ICustomConfirmState {
  text: string;
  isOpen: boolean;
  confirmAction: (value?: unknown) => void;
  cancelAction: (value?: unknown) => void;
}
