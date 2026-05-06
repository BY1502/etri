export const errorMessage = {
  default: '에러가 발생하였습니다. 개발팀에 문의주세요.',
  requiredField: (field: string) => `${field} is required field`,
  custom: (text: string) => text,
  jsonld: (text: string) => `${text}는 주소의 맨 뒤에 포함되어야 합니다.`,
  delete: (text: string) =>
    `삭제를 원하시는 경우 하위의 ${text}들을 삭제하신 후 진행하시기 바랍니다.`,
};

export const successMessage = {
  create: () => '생성되었습니다.',
  update: () => '수정되었습니다.',
  delete: () => '삭제되었습니다.',
};
