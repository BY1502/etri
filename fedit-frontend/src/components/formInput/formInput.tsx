import { FormInputProps } from 'types/trackingProcessForm';

function FormInput({ label, description, required, children }: FormInputProps) {
  return (
    <div className="flex gap-[24px]">
      <div className="w-[300px]">
        {label && (
          <div className="flex w-full justify-between">
            <p className="font-bold">{label}</p>
            {required && (
              <p className="font-normal text-[#FF4545]">*{required}</p>
            )}
          </div>
        )}
        {description && <p className="text-[var(--gray)]">{description}</p>}
      </div>
      <div className="w-[700px]">{children}</div>
    </div>
  );
}

export default FormInput;
